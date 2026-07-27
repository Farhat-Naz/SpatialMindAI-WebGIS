# Research: GIS Import & Export (005-import-export)

**Feature**: [spec.md](./spec.md) | **Date**: 2026-07-27

**Purpose**: Resolve every implementation unknown before design. Each decision records what was
chosen, why, and what was rejected. Decisions are referenced by number throughout
[plan.md](./plan.md), [data-model.md](./data-model.md), and [contracts/](./contracts/).

---

## Starting position: what already exists

Before deciding anything, the existing surface was read in full. This feature is **much less
greenfield than the spec implies**:

| Capability | Current state | File |
|---|---|---|
| GeoJSON import | Working, all-or-nothing, per-feature loop | `src/app/api/layers/[layerId]/features/import/route.ts`, `featureRepository.importFeatures` |
| Import request contract | Working, reuses `geometrySchema` | `src/shared/contracts/geoJsonImport.schema.ts` |
| Shapefile import | Working, **loose `.shp`/`.dbf`/`.prj` file set only — no ZIP** | `src/features/database/services/shapefileImport.ts` |
| Reprojection | Working, client-side proj4 + wkt-parser, `.prj` WKT only | `src/features/database/utils/reprojection.ts` |
| Client-side structural validation | Working, reuses `geometrySchema` | `src/features/database/utils/validateGeoJson.ts` |
| GeoJSON export | Working, cursor-paged aggregation | `src/features/database/services/exportLayer.ts` |
| **CSV / KML / Shapefile export** | **Working** — built by 007, page-streamed, `@mapbox/shp-write` | `src/features/analysis/services/exportService.ts` |
| Export history record | Working — `ExportJob` model, repository, route, hook | `exportLogRepository.ts`, `api/projects/[projectId]/exports/route.ts` |
| Import/Export UI | Working, minimal (2 buttons + confirm dialog) | `src/features/database/components/ImportExportControls.tsx` |
| North arrow | Working, static overlay | `src/features/database/components/NorthArrow.tsx` |
| Background-job pattern | Working — `AnalysisRun` (status/progress/cancelRequestedAt/backendPid) | `analysisRepository.ts` |
| Role authorization | Working | `src/server/auth/assertProjectRole.ts` |
| Error vocabulary | Working, 9 codes | `src/shared/errors/apiError.ts` |

**Consequence**: this feature's job is to *complete and generalize* these, not to build a parallel
import/export system. Every decision below is biased toward extension over replacement.

---

## Decision 1: One new feature module `src/features/import-export/`; existing modules extended in place, not forked

**Decision**: Create `src/features/import-export/` with the standard internal structure
(`components/`, `hooks/`, `services/`, `store/`, `types/`, `utils/`, `__tests__/`, `index.ts`).
Reuse `@/features/database`'s `featureService` and `@/features/analysis`'s `exportService` by
**deep import from their specific modules, never through the feature barrel**.

**Rationale**: Constitution Principle I mandates feature-first organization. Import/Export is a
distinct capability with its own stores, hooks, and ~15 components; folding it into
`features/database` would push that module past the point where its barrel is comprehensible.

The deep-import rule is not stylistic — `src/features/database/index.ts` re-exports `LayerTree`,
`MapEditingLayer`, and `FeatureLayer`, which pull Leaflet and leaflet-geoman into any consumer.
`src/features/analysis/services/exportService.ts` already documents this exact hazard and imports
`featureService`/`exportLayerAsGeoJson` from their own modules for that reason. This plan follows
the same precedent verbatim.

**Alternatives rejected**:
- *Extend `features/database`* — would double that module's size and drag map runtime into the
  import path.
- *Extend `features/analysis`* — export lives there today only because 007 needed it; import has
  nothing to do with analysis.

---

## Decision 2: Files are parsed entirely in the browser; **no uploaded bytes ever reach the server**

**Decision**: All five source formats are parsed, converted, validated, and normalized to GeoJSON
in the browser. The server receives only **normalized JSON chunks** of already-parsed features. No
multipart upload endpoint, no temp directory, no object storage, no `FileMetadata` blob table.

**Rationale**:

1. Every format library required (`shpjs`, `@tmcw/togeojson`, `papaparse`, `jszip`) is
   browser-first. Running them server-side would need the same libraries plus a file-transport
   layer, for no gain.
2. It is the established precedent: 004 parses Shapefiles client-side
   (`shapefileImport.ts`), and 007's research Decision 10 explicitly chose client-side export
   over "server-side file generation/storage that has never existed in this codebase."
3. It sidesteps the platform's hardest constraint. A 50 MB Shapefile ZIP uploaded as multipart
   would have to survive the serverless request-body limit, cold starts, and a 300 s function
   timeout. A 50 MB ZIP parsed in the browser becomes ~100 chunk POSTs of ~1–3 MB each, every one
   of which is an ordinary, retryable, individually-timed request.
4. It removes an entire class of security surface: there is no server-side archive extraction, so
   zip-slip and zip-bomb defenses (FR-082, FR-083) run in a sandboxed browser tab against the
   user's own file, never against shared server storage.

**Consequence for the spec's "File storage strategy"**: the answer is *no file storage*. The
`ImportJob` record retains the file's **name, byte size, MIME type, and SHA-256 hash** as
provenance columns (FR-075) — the metadata, never the bytes.

**Alternatives rejected**:
- *Server-side upload + parse* — needs blob storage this codebase does not have, breaks
  portability across the deployment targets 010 documents, and puts untrusted archive extraction
  on the server.
- *Direct-to-storage presigned upload* — same, plus a new infrastructure dependency.

---

## Decision 3: Import is a **DB-backed job driven by the client**, committed in chunks

**Decision**: An import is a four-call lifecycle against a persisted `ImportJob`:

```
POST   /api/layers/:layerId/imports          → create job          (status: running)
POST   /api/imports/:importJobId/chunks      → commit one chunk    (repeat 1..n, idempotent)
POST   /api/imports/:importJobId/complete    → finalize            (status: succeeded)
POST   /api/imports/:importJobId/cancel      → request cancel      (status: cancelled)
POST   /api/imports/:importJobId/rollback    → undo this import    (status: rolled_back)
GET    /api/imports/:importJobId             → progress / status   (polling)
```

The browser tab is the executor; the database is the job's system of record.

**Rationale**: This is the only design that satisfies FR-067 (100,000 features), FR-069
(per-chunk progress), FR-070 (prompt cancellation), and FR-072 (exact rollback) **without new
infrastructure**. It is the direct analogue of 007's research Decision 5, which chose "DB-backed
job state + chunked execution, with no message broker, no queue," specifically so the platform
stays deployable identically across Vercel / Railway / Docker / AWS / Supabase.

Chunk commits are idempotent on `(importJobId, chunkIndex)`, so a retried chunk after a network
blip cannot double-insert.

**Alternatives rejected**:
- *One request for the whole file* — a 100,000-feature body exceeds request limits and cannot
  report progress or be cancelled.
- *A real server-side worker/queue* — new infrastructure, explicitly avoided by 007 for
  portability, and unnecessary when the client is already present and holds the parsed data.
- *Fire-and-forget with no job record* — makes FR-072 rollback and FR-074 abandoned-job
  resolution impossible.

---

## Decision 4: Coordinate transformation on **import** happens in PostGIS; proj4 is confined to the preview and to export

**Decision**:

- **Import (persisted)**: the client sends **untransformed source coordinates plus the source
  SRID**. The server transforms with `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(...), :srid), 4326)`
  inside the chunk-commit statement.
- **Preview (FR-064, transient)**: proj4 in the browser transforms a **sample** of coordinates and
  computes the projected bounding box for the confirmation screen. Never persisted.
- **Export (not persisted)**: proj4 in the browser transforms output coordinates to the chosen
  output CRS. The result is a downloaded file, not platform state.

**Rationale**: Constitution Principle IV is explicit — spatial calculation "whose result is
persisted … MUST be computed in PostGIS," and client-side geometry math is permitted "**only** for
transient UI feedback." The existing `shapefileImport.ts` reprojects with proj4 *and then persists
the result*, which sits in tension with that principle. This plan resolves the tension rather than
propagating it.

Two practical wins beyond compliance:

1. **PostGIS carries the authoritative EPSG catalog** in `spatial_ref_sys` (~9,000 entries).
   Client-side proj4 would need every definition bundled or fetched — and fetching is impossible
   here, because `next.config.ts` sets `connect-src 'self'`, so a runtime lookup against
   `epsg.io` or `spatialreference.org` is blocked by CSP. Server-side transformation makes the
   entire EPSG registry available with no bundle cost and no CSP change.
2. A custom user-supplied definition (FR-063) works too: `ST_Transform(geom, :proj4Text)` accepts
   a proj4 text form directly, so custom CRS needs no catalog entry.

The preview stays client-side deliberately: it must respond as the user changes the CRS dropdown,
and it is exactly the "transient UI feedback" Principle IV carves out.

**Alternatives rejected**:
- *All-proj4, client-side (status quo from 004)* — persists JS-computed geometry, contrary to
  Principle IV; needs a bundled EPSG subset; cannot support arbitrary EPSG codes.
- *All-PostGIS, including preview* — a database round trip per dropdown change; the preview is
  transient UI feedback and does not warrant one.

---

## Decision 5: The **existing per-feature import loop is left alone**; a new set-based chunk insert is added beside it

**Decision**: `featureRepository.importFeatures` (used by Map Editing today) is **not modified**.
A new `importJobRepository.commitImportChunk` performs a set-based insert:

```sql
INSERT INTO "Feature" (id, "layerId", geometry, "importJobId", "createdAt", "updatedAt")
SELECT v.id,
       :layerId,
       ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(v.geom), :srid), 4326),
       :importJobId,
       NOW(), NOW()
FROM unnest(:ids::text[], :geoms::text[]) AS v(id, geom)
WHERE ST_IsValid(ST_GeomFromGeoJSON(v.geom))
  AND NOT EXISTS (... duplicate probe, Decision 8 ...)
RETURNING id
```

**Rationale**: The existing loop issues **three statements per feature** — one `ST_IsValid` probe,
one `INSERT`, one `createMany` for attributes. At 100,000 features that is ~300,000 round trips,
which cannot meet SC-002 under any chunking scheme. The set-based form is **four statements per
1,000-feature chunk**: the insert above, one `createMany` for attributes, one counter update, one
issue-row insert — roughly 400 statements for the whole 100,000-feature import.

Rejections fall out for free: the ids passed in, minus the ids in `RETURNING`, are exactly the
features PostGIS refused, and the reason is recoverable by re-probing just those few.

Leaving `importFeatures` untouched means Map Editing's behavior is bit-for-bit unchanged and its
existing tests keep passing — this feature adds a second path rather than retuning a shared one.

**Alternatives rejected**:
- *Rewrite `importFeatures` to be set-based and have both callers share it* — changes an
  implemented feature's tested behavior (all-or-nothing transaction semantics) for no benefit to
  that caller, whose files are small.
- *`COPY` / `pg-copy-streams`* — fastest, but bypasses Prisma's parameterized-query guarantee
  (Constitution Principle III forbids string-concatenated SQL) and adds a dependency.

---

## Decision 6: Validation is two-tier — complete client preflight, plus per-chunk server checks — and **Strict mode is implemented as auto-rollback**

**Decision**:

| Tier | Runs where | Checks | When |
|---|---|---|---|
| **Preflight** | Browser (worker) | Structure, geometry type, coordinate range, CRS bbox sanity, in-file duplicates, attribute sanitization, ring-closure repair, CSV row parsing | Over the **whole file**, before the confirmation gate |
| **Commit-time** | PostGIS, per chunk | `ST_IsValid` topology, existing-layer duplicates | During each chunk commit |

FR-005 ("validate an entire file and present a summary before any feature is written") is
satisfied by the **preflight** tier, which does read the entire file and does gate on explicit
confirmation.

**Strict mode (FR-006)** is implemented as: if any chunk reports a commit-time rejection, the
client immediately calls `rollback`, and the job ends `rolled_back` with nothing net-written. The
observable outcome is identical to all-or-nothing.

**Rationale**: Only two checks genuinely require the database — `ST_IsValid` topology and
comparison against existing layer rows. Making them part of the preflight would require sending
all 100,000 geometries to the server twice: once to validate, once to commit. That doubles the
cost of the feature's single most expensive operation to move a small minority of rejections
earlier in the report.

Auto-rollback is what makes this honest rather than a compromise: a Strict-mode user gets exactly
the guarantee the spec promises, and a Lenient-mode user (the default) gets the extra rejections
appended to the same summary they were already going to read.

`geometrySchema` (`src/shared/contracts/geometry.schema.ts`) is reused verbatim for the preflight's
structure and range rules — its doc comment already states that topological validity "is
intentionally NOT checked here — that is PostGIS `ST_IsValid`'s job." This decision is that
comment's design, applied at scale.

**Alternatives rejected**:
- *Full server-side dry-run pass* — doubles network and database cost at the scale that matters most.
- *Client-only validation* — cannot detect self-intersection or existing-layer duplicates at all.

---

## Decision 7: Parsing and preflight run in a **Web Worker**; the worker must be same-origin, not `blob:`

**Decision**: Files above a 5,000-feature threshold are parsed and preflighted in a dedicated Web
Worker instantiated as `new Worker(new URL("./importParser.worker.ts", import.meta.url))`. The
worker posts normalized chunks of 1,000 features back to the main thread and never retains the
full feature array.

**Rationale**: SC-002 requires the interface to stay interactive — panning and scrolling
responsive — for the entire duration of a 100,000-feature import. Parsing a 50 MB Shapefile or
running 100,000 Zod validations on the main thread blocks it for tens of seconds.

**The CSP constraint is the load-bearing detail here.** `next.config.ts` sets
`default-src 'self'` and `script-src 'self' 'unsafe-inline'`, with **no `worker-src` directive**.
`worker-src` falls back to `child-src`, which falls back to `script-src`. `blob:` is **not** in
`script-src`, so the common `new Worker(URL.createObjectURL(blob))` idiom — which several worker
helper libraries use internally — **is blocked at runtime in this application**. The
`new URL(..., import.meta.url)` form emits a same-origin chunk under `/_next/static/`, which
`'self'` permits. No CSP change is required, and none should be made.

**Alternatives rejected**:
- *Main-thread parsing with `setTimeout` yielding* — keeps the UI nominally responsive but roughly
  doubles wall-clock time and does not help the single 50 MB `JSON.parse`.
- *A worker-pool library* — most construct workers from blob URLs and would be CSP-blocked; also a
  dependency for something one hand-written worker covers.
- *Adding `worker-src blob:` to the CSP* — weakens a security header (Principle VI) to buy
  convenience that the same-origin form already provides.

---

## Decision 8: Duplicate detection uses PostGIS `ST_OrderingEquals` narrowed by the existing GiST index — no new hash column on `Feature`

**Decision**:

- **In-file duplicates**: detected during preflight in the worker, by hashing each normalized
  feature's `(geometry, sorted attribute pairs)` into a `Set`. O(n), no server cost.
- **Existing-layer duplicates**: detected per chunk in SQL, via a `NOT EXISTS` probe that uses
  `&&` (bbox overlap, GiST-indexed) to narrow candidates and then `ST_OrderingEquals` plus an
  attribute-set comparison to confirm.

**Rationale**: The spec's definition (Assumptions) is "geometry **and** the complete attribute set
are both identical," so bbox equality is a necessary condition — which means the existing
`@@index([layerId])` plus the GiST index on `Feature.geometry` already provide the narrowing the
probe needs. No new column, no new index, no migration of existing rows.

Adding a `Feature.contentHash` column was considered and rejected: it would require backfilling
every existing feature and, more seriously, modifying **every** existing feature-creation path
(`createFeature`, `updateFeature`, `importFeatures`, plus every analysis operation that writes a
result layer) to maintain it. That is precisely the redesign of already-implemented features this
plan is directed to avoid.

`ST_OrderingEquals` is chosen over `ST_Equals` deliberately: `ST_Equals` is a *spatial* equality
test (same point set, different vertex order still equal) and is far more expensive.
"Byte-identical duplicate," which is what the spec describes, is `ST_OrderingEquals`.

**Alternatives rejected**:
- *`Feature.contentHash` column* — touches every write path in the codebase; needs a backfill.
- *Download the whole target layer and dedupe client-side* — O(existing layer size) per import.
- *Skip existing-layer duplicate detection* — FR-055 requires it explicitly.

---

## Decision 9: `shpjs` replaces the `shapefile` package for import; `@mapbox/shp-write` is kept for export

**Decision**: Add `shpjs` for Shapefile **reading** (it accepts a ZIP `ArrayBuffer` directly and
resolves `.shp`/`.dbf`/`.prj`/`.cpg` internally). Retire `shapefile` and
`src/features/database/services/shapefileImport.ts` together with the loose-file-set UI they back.
Keep `@mapbox/shp-write` unchanged for Shapefile **writing** (already working, added by 007).

**Rationale**: FR-017 requires single-ZIP import. The installed `shapefile` package reads a `.shp`
buffer and a `.dbf` buffer as separate arguments and has no archive awareness whatsoever — the
current code compensates by making the user multi-select the component files, which is exactly the
workflow FR-017 exists to eliminate. `shpjs` also reads the `.cpg` encoding declaration that
FR-020 needs, and handles the nested-directory case in FR-017 acceptance scenario 2.

Retiring `shapefileImport.ts` is sanctioned by the spec, which states the existing Map Editing
import/export controls are "replaced with the fuller interchange interface rather than duplicated."

**Alternatives rejected**:
- *Keep `shapefile`, add JSZip in front of it* — reimplements component discovery, `.cpg` encoding
  handling, and multi-shapefile archives that `shpjs` already does.
- *Keep both readers* — two code paths for one capability.

---

## Decision 10: New npm dependencies — six, each justified, each dynamically imported

**Decision**:

| Package | For | Load |
|---|---|---|
| `shpjs` | Shapefile ZIP read (FR-017–021) | `await import()` in worker |
| `@tmcw/togeojson` | KML → GeoJSON (FR-022–027) | `await import()` in worker |
| `jszip` | KMZ extraction + project-export archive (FR-022, FR-037) | `await import()` |
| `papaparse` | CSV parse with streaming + delimiter detection (FR-028–033) | `await import()` in worker |
| `jspdf` | PDF page container (FR-034, FR-044–049) | `await import()` |
| `html2canvas` | Rasterize the map pane for the PDF | `await import()` |

`file-saver` is **not** adopted. The codebase already performs blob downloads with a six-line
anchor-click (`useExportLayer`); this plan centralizes that into one shared
`utils/downloadBlob.ts` instead of adding a dependency for it. *(Noted as a deliberate deviation
from the technology list in the original feature brief — see plan.md Complexity Tracking.)*

`proj4` and `wkt-parser` are **already installed** and are reused for preview/export
transformation (Decision 4). `@turf/turf` is already installed and is reused for bounding-box and
ring-closure work. No new state-management, CSS, mapping, ORM, or database dependency is
introduced, so no constitution amendment is required (Technology Stack section).

**Rationale**: Constitution Principle V requires heavy modules to be lazy-loaded at point of use
and `@next/bundle-analyzer` to be run before merging any PR adding a dependency over 20 KB gzipped.
Every package above clears 20 KB, so **all six are behind `await import()`** and the analyzer run
is a mandatory gate (plan.md Quality Gates). A user who never opens the import dialog downloads
none of them.

---

## Decision 11: PDF export rasterizes the live map; the tainted-canvas risk is mitigated by `crossOrigin` on the tile layer

**Decision**: `html2canvas` rasterizes the Leaflet map pane at 2× device scale; `jsPDF` places that
raster on the selected page and draws the title, north arrow, scale bar, and legend as **vector**
elements on top. `TileLayer` gains `crossOrigin="anonymous"`.

**Rationale and the risk being managed**: A canvas that has drawn an image from another origin
without CORS approval becomes *tainted*, and `toDataURL()` on it throws a `SecurityError`. Basemap
tiles come from `tile.openstreetmap.org` and `server.arcgisonline.com` (both in the CSP's
`img-src`). Both send `Access-Control-Allow-Origin: *`, but the browser only records that fact if
the image was requested with the CORS attribute set — hence `crossOrigin="anonymous"` on the
`TileLayer`.

This is the plan's **only** change to an already-implemented feature (Map Core): a single prop.
It is recorded in plan.md Complexity Tracking. Cached tiles fetched before the attribute existed
can still taint the canvas until a hard reload, which is why the fallback below matters.

**Fallback if rasterization fails**: the dialog falls back to `window.print()` against a print
stylesheet that hides application chrome. The user still gets a correct page via the browser's own
"Save as PDF"; only the direct-download path is lost. FR-050's cancel path covers the same code.

Overlay elements are drawn as jsPDF vectors rather than being included in the raster so that the
scale bar's numbers and the legend's labels stay crisp and selectable at print resolution
(FR-047, FR-049).

**Alternatives rejected**:
- *Server-side headless-browser rendering* — a Chromium dependency and a rendering service this
  platform does not have; contradicts Decision 2's no-server-file-work stance.
- *`window.print()` only* — cannot satisfy FR-034 ("export **PDF**") as a downloaded file, nor
  FR-044's exact-page preview.
- *SVG-only export* — Leaflet raster tiles have no SVG representation.

---

## Decision 12: Progress is client-owned; the server record is polled only for cross-session recovery

**Decision**: The progress bar reads from the Zustand `importStore`, which the client updates as
each chunk resolves — it already knows the denominator. `ImportJob.importedCount` /
`rejectedCount` / `heartbeatAt` are updated server-side per chunk, and
`GET /api/imports/:importJobId` is polled by React Query **only** when a running job is opened
without an in-memory driver (i.e., after a reload, or from another device).

**Rationale**: The executor is the browser tab (Decision 3), so it has the authoritative progress
locally and network round trips for it would be pure overhead. The server-side counters are not
redundant, though — they are what makes an import visible after a reload and what FR-074's
abandoned-job detection reads.

This matches 007 research Decision 6 ("SSE progress stream is optional/additive; polling is the
guaranteed baseline"). A `/api/projects/[projectId]/stream` SSE endpoint exists from 006 and could
carry import events later; that is deliberately out of scope here.

**Alternatives rejected**:
- *Poll for progress unconditionally* — round trips for a number already in memory.
- *SSE as the primary channel* — 007 already established polling as the baseline for exactly this
  reason (portability across deployment targets).

---

## Decision 13: Cancellation is cooperative and checked at the chunk boundary — no `pg_cancel_backend`

**Decision**: `POST /api/imports/:id/cancel` sets `cancelRequestedAt`. The client stops sending
chunks immediately. The server independently rejects any further chunk POST for that job with
`CONFLICT`, so a stale or malicious client cannot continue past a cancel.

**Rationale**: SC-004 requires cancellation to stop further commits "within 2 seconds." A chunk of
1,000 features commits in well under that, so a chunk-boundary check meets the target without
interrupting an in-flight statement.

007 needed `pg_cancel_backend` because a single analysis statement can run for minutes; here the
longest-running statement is one chunk insert. Reaching for backend-PID cancellation would add the
`backendPid` bookkeeping and the risk of aborting a partially-applied transaction for no gain.

The server-side rejection is what makes this a real guarantee rather than client politeness.

---

## Decision 14: Rollback is a targeted delete on `Feature.importJobId`

**Decision**: Add nullable `Feature.importJobId` with an index.
`POST /api/imports/:id/rollback` executes `DELETE FROM "Feature" WHERE "importJobId" = :id`,
cascading to `FeatureAttribute` and `FeatureStyle` via existing foreign keys, then sets the job's
status to `rolled_back`.

**Rationale**: FR-072 requires removing "exactly the features that import committed and no
others, including when other users have since added features to the same layer." Provenance on
the row is the only way to guarantee that — a timestamp window or a count-based delete would take
concurrent users' features with it (spec Edge Cases, "Concurrency and state").

This mirrors 007 research Decision 14 ("Undo of an analysis result is a targeted delete, not a
generic undo stack"). It is additive: existing features get `NULL`, which correctly reads as "not
from a tracked import," and no backfill is needed.

`onDelete: SetNull` on the relation means deleting a history entry never deletes data — consistent
with the spec's rule that no import path removes existing features automatically.

---

## Decision 15: `ImportJob` **is** the import history; no separate `ImportHistory`/`ExportHistory`/`FileMetadata`/`ExportStatistics` tables

**Decision**: The feature brief lists seven candidate models. Four are rejected:

| Requested model | Decision | Where it actually lives |
|---|---|---|
| `ImportJob` | **Create** | New model |
| `ImportError` | **Create**, named `ImportIssue` | New model (spec's own entity name; also covers non-error categories like `repaired` and `duplicate`) |
| `ExportJob` | **Extend** | Existing model + `scope`, `outputCrs`, `pdf` format |
| `ImportHistory` | **Reject** | `ImportJob` rows *are* the history |
| `ExportHistory` | **Reject** | `ExportJob` rows *are* the history |
| `FileMetadata` | **Reject** | Columns on `ImportJob` (`fileName`, `fileSizeBytes`, `mimeType`, `fileHash`) — no bytes stored (Decision 2) |
| `ExportStatistics` | **Reject** | Columns on `ExportJob` (`featureCount`, `status`, `errorMessage`) |

**Rationale**: A job row that is never deleted *is* a history row; a parallel table would need
writing twice, kept consistent, and would drift. This is 007 research Decision 1 applied again —
that decision explicitly refused to "create parallel `AnalysisJob`/`AnalysisHistory`/
`AnalysisResult` tables" because `AnalysisRun` already consolidated the concern. Introducing the
split here would contradict a precedent set one feature earlier in the same codebase.

---

## Decision 16: Persisted `ImportIssue` rows are capped at 1,000 per job

**Decision**: Persist at most 1,000 issue rows per import. Counts on `ImportJob`
(`rejectedCount`, `duplicateCount`, `repairedCount`) remain **exact** regardless. The complete
report is downloadable **in-session** from the preflight result, which the client holds in full.

**Rationale**: A 100,000-row CSV where the user mapped the wrong column produces 100,000
rejections. Persisting them would write more rows than the import itself and turn a user error
into a database-growth incident.

FR-058 requires "the first 100 inline with an accurate total count, and a downloadable full
report." Inline display and exact totals are fully met. The full report is complete in-session;
**from history, the first 1,000 issues are available, not all of them.** This limitation is stated
plainly rather than papered over, and 1,000 is ten times the inline requirement.

---

## Decision 17: An abandoned job is resolved lazily on read — no cron, no scheduler

**Decision**: `ImportJob.heartbeatAt` is bumped on every chunk commit. A `running` job whose
`heartbeatAt` is older than 5 minutes is treated as **abandoned**: the history repository sweeps
it to `status: "failed"` with `errorMessage: "The import was interrupted..."` on the next read of
that project's history, and the rollback action stays available.

**Rationale**: FR-074 requires an import whose session ended to reach a terminal state rather than
showing "running" forever. A scheduled sweeper would need cron infrastructure that this codebase
does not have and that Decision 3 deliberately avoids. Reading history is the only moment anyone
can observe a stale job, so it is the correct moment to resolve one.

5 minutes is well beyond the worst realistic gap between chunk commits (a 1,000-feature chunk
commits in ~1–3 s), so a live-but-slow import cannot be swept out from under itself.

**Alternatives rejected**:
- *Cron job / scheduled function* — new infrastructure, deployment-target-specific.
- *Client-side `beforeunload` cleanup* — unreliable by construction; does not fire on crash, tab
  kill, or connectivity loss.

---

## Decision 18: Security limits are enforced on **both** sides — client for UX, server for the guarantee

**Decision**:

| Control | Client | Server |
|---|---|---|
| Max file size (50 MB, env-configurable) | Rejected before read (FR-081) | Not applicable — no file is uploaded |
| Archive expansion ratio ≤ 100:1, total ≤ 500 MB | Enforced during extraction (FR-083) | n/a |
| Zip-slip (absolute / `..` entry paths) | Entry names checked before any entry is read (FR-082) | n/a |
| Format sniffing by content | Magic-byte / structural check, not extension (FR-004) | n/a |
| Chunk size ≤ 1,000 features, body ≤ 8 MB | Enforced when chunking | **Zod-enforced, rejected with `INVALID_INPUT`** |
| Geometry structure + coordinate range | `geometrySchema` (preflight) | **`geometrySchema` again, in the chunk schema** |
| Geometry topology | — | **`ST_IsValid`** |
| Attribute key/value sanitization | Applied during normalization (FR-054) | **Re-applied server-side before storage (FR-084)** |
| Authorization | — | **`assertProjectRole(projectId, userId, "Editor")` on every write; `"Viewer"` on reads** |
| Rate limiting | — | **`assertWriteRateLimit(user.id, "import:write")`** on every mutating route |

**Rationale**: Because parsing is client-side (Decision 2), *every* client-side check is advisory
only — the chunk endpoint is a public API and must assume the client is hostile. The right-hand
column is the actual security boundary; the left-hand column exists so a user with a 200 MB file
learns that in 10 ms instead of after an upload.

The Zod re-validation on the chunk endpoint is not redundant with the preflight: it is
Constitution Principle II's requirement that "every Route Handler MUST validate its input … with
a Zod schema before the value is used for anything," and it is what stops a crafted chunk POST
from writing a geometry that no preflight ever saw.

CSV formula neutralization (FR-040) is applied on **export**, prefixing a leading `=`, `+`, `-`,
or `@` with `'` — the value is preserved, its executability is not.

---

## Decision 19: Error reporting reuses the existing nine-code `ApiErrorCode` vocabulary unchanged

**Decision**: No new error codes. The mapping:

| Situation | Code |
|---|---|
| Malformed chunk body, bad CRS, oversized chunk | `INVALID_INPUT` (400) |
| Unknown job / layer, or no project access at all | `NOT_FOUND` (404) |
| Viewer attempting an import, export, or rollback | `FORBIDDEN` (403) |
| Chunk POST after cancel; `complete` on a terminal job; rollback of a rolled-back job | `CONFLICT` (409) |
| Rate limit exceeded | `RATE_LIMITED` (429) |
| Unexpected failure | `DATABASE_ERROR` (500) |

**Rationale**: `src/shared/errors/apiError.ts` documents that each addition beyond the original
five was made only when no existing code could correctly carry the meaning. Every situation this
feature produces maps cleanly onto an existing code, so adding one would be unjustified. `CONFLICT`
in particular already exists for precisely this shape of "the resource moved on without you"
(added by 006 for lock and stale-write conflicts).

Every new Route Handler routes its catch block through the existing `handleRouteError`, and every
message is user-safe — FR-086 requires the defect be described without exposing internals, which
`handleRouteError`'s generic `DATABASE_ERROR` fallback already guarantees for unrecognized errors.

---

## Decision 20: Attribute handling reuses the existing free-form key/value model and its flattening rule

**Decision**: Reuse `propertiesToAttributes` from `geoJsonImport.schema.ts` unchanged as the
single flattening rule for **all five** formats. Extend it only with the sanitization FR-054
requires (control-character stripping, empty/duplicate key resolution, length truncation),
implemented as a separate composable function so the existing behavior for Map Editing's import
path is untouched.

Nested / object-valued properties (FR-016) are flattened to their compact JSON text — the same
`String(value)` outcome the existing function already produces for objects, made explicit and
documented rather than incidental.

**Rationale**: `FeatureAttribute` is already a normalized `(featureId, key, value)` table with a
`@@unique([featureId, key])` constraint, which is exactly why duplicate-key resolution must happen
before insert — an unresolved duplicate key is a constraint violation that would fail the whole
chunk. The spec's Assumptions explicitly retain this model and rule out per-layer fixed schemas,
so no schema inference is needed for any format.

---

## Decision 21: Export gains scope, CRS, and PDF by **extending** 007's `exportService`, not replacing it

**Decision**: `src/features/analysis/services/exportService.ts` already implements page-streamed
GeoJSON, CSV, KML, and Shapefile export. Move the format writers to
`src/features/import-export/services/exportWriters.ts`, re-export from the old path so 007's
Result Panel keeps working unchanged, and add on top:

- **Scope** (FR-035): `selection` reads from the existing selection store instead of paging a
  layer; `project` iterates layers and assembles a JSZip archive plus `manifest.json` (FR-037).
- **Output CRS** (FR-041): a proj4 transform applied to each page as it streams (Decision 4).
- **Mixed-geometry Shapefile** (FR-038): partition features by geometry type and emit one
  component set per type, with the user warned before download.
- **PDF** (Decision 11).
- **Formula neutralization** on CSV (FR-040) — a genuine gap in the current writer.

**Rationale**: The existing writers are tested, handle multi-geometry KML correctly, and already
solve the non-obvious problem that CSV headers must be known before the first row is written. Not
reusing them would mean re-deriving all of that and maintaining two KML serializers.

The re-export shim is what keeps this non-breaking: 007's `useExportResult` imports
`exportAnalysisResult` from `@/features/analysis/services/exportService`, and that import keeps
resolving to the same function.

---

## Summary of resolved unknowns

| Unknown | Resolved by |
|---|---|
| Where files are parsed | D2 — browser only; no bytes on the server |
| How 100,000 features are imported | D3 (chunked job) + D5 (set-based insert) |
| Where coordinate transformation happens | D4 — PostGIS on import, proj4 for preview/export |
| Which EPSG catalog | D4 — PostGIS `spatial_ref_sys`; CSP blocks network lookup |
| How Strict vs Lenient is implemented | D6 — auto-rollback for Strict |
| How the UI stays responsive | D7 — same-origin Web Worker (not `blob:`, CSP) |
| How duplicates are detected | D8 — worker `Set` in-file; GiST-narrowed `ST_OrderingEquals` server-side |
| Shapefile ZIP support | D9 — `shpjs` replaces `shapefile` |
| Which dependencies are added | D10 — six, all dynamically imported; `file-saver` declined |
| How PDF is produced | D11 — `html2canvas` + `jsPDF`, with `crossOrigin` and a `window.print()` fallback |
| How progress is tracked | D12 — client-owned; server counters for cross-session recovery |
| How cancellation works | D13 — cooperative, chunk-boundary, server-enforced |
| How rollback is exact | D14 — `Feature.importJobId` targeted delete |
| Which tables to create | D15 — `ImportJob` + `ImportIssue` only; four rejected with reasons |
| How issue volume is bounded | D16 — 1,000 persisted per job; exact counts always |
| How abandoned jobs terminate | D17 — lazy sweep on history read; no cron |
| Where security is enforced | D18 — both sides; server is the boundary |
| Which error codes | D19 — existing nine, unchanged |
| How attributes are mapped | D20 — existing `propertiesToAttributes` + sanitization |
| How export grows | D21 — extend 007's writers; re-export shim keeps 007 working |
