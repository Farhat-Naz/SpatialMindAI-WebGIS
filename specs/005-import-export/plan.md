# Implementation Plan: GIS Import & Export

**Branch**: `005-import-export` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-import-export/spec.md`

---

## Summary

This plan delivers all ten user stories in the 005 spec — GeoJSON / Shapefile / KML / KMZ / CSV
import, GeoJSON / Shapefile / KML / CSV / PDF export, validation, coordinate systems, bulk
operations, print output, and import/export history — by **extending the existing
SpatialMindAI-WebGIS architecture rather than building a parallel system**.

Six findings shape this plan significantly:

1. **This feature is far less greenfield than the spec implies.** GeoJSON import, loose-file
   Shapefile import, client-side reprojection, structural validation, GeoJSON export, and — from
   007 — **fully working CSV, KML, and Shapefile export writers plus an `ExportJob` history model,
   repository, route, and hook** all already exist. The work is to complete and generalize them
   (research.md, "Starting position").
2. **No file ever reaches the server.** All five formats are parsed in the browser; the server
   receives normalized JSON chunks. There is no upload endpoint, no temp storage, and no
   `FileMetadata` blob table. This is 007's research Decision 10 ("no server-side file
   generation/storage that has never existed in this codebase") applied to the import direction
   (research.md Decision 2).
3. **Import becomes a DB-backed, client-driven, chunked job** — `ImportJob` + `ImportIssue`, with
   `POST /chunks` / `/complete` / `/cancel` / `/rollback`. This is the direct analogue of 007's
   research Decision 5, which chose DB-backed job state and chunked execution specifically to
   avoid a queue or broker and stay portable across every deployment target (research.md
   Decision 3).
4. **Coordinate transformation on import moves into PostGIS.** The client sends untransformed
   source coordinates plus an SRID; `ST_Transform` runs inside the chunk-commit statement. This
   resolves a genuine Constitution Principle IV tension in the *existing* `shapefileImport.ts`
   (which reprojects with proj4 and then persists), gains the full ~9,000-entry EPSG catalog for
   free, and sidesteps the fact that the CSP's `connect-src 'self'` makes a runtime EPSG lookup
   impossible. proj4 is retained strictly for the transformation *preview* and for export — both
   non-persisted, exactly what Principle IV carves out (research.md Decision 4).
5. **The existing per-feature import loop is left completely alone.** `featureRepository.importFeatures`
   issues three statements per feature — 300,000 round trips at 100k features. A new set-based
   `commitImportChunk` does four statements per 1,000-feature chunk instead. Map Editing's path is
   bit-for-bit unchanged and its tests keep passing (research.md Decision 5).
6. **Four of the seven models the brief requested are not created.** `ImportJob` rows *are* the
   import history; `ExportJob` rows *are* the export history; file metadata is columns, not a
   table; export statistics are columns, not a table. This is 007's research Decision 1 applied
   again — that decision refused the identical `AnalysisJob`/`AnalysisHistory`/`AnalysisResult`
   split one feature earlier in this same codebase (research.md Decision 15).

**Net footprint**: 2 new models, 1 extended model, 1 nullable column on `Feature`, 8 new Route
Handlers, 1 new feature module, 6 new npm dependencies (all dynamically imported), 1 additive
migration, and exactly **one line changed in an already-implemented feature** (a `crossOrigin`
prop on the tile layer).

---

## Technical Context

**Language/Version**: TypeScript 5, `strict` mode — unchanged.

**Primary Dependencies**:

- Existing, reused unmodified: `next@15`, `react@19`, `@tanstack/react-query@5`, `zustand@5`,
  `zod@4`, `@prisma/client@6`, `react-leaflet@5`, `@turf/turf@7`, `shadcn/ui` (Radix),
  Tailwind CSS v4.
- Existing, reused for this feature's transformation work: **`proj4` + `wkt-parser`** (already
  installed for `reprojection.ts`) — preview and export only.
- Existing, reused for export: **`@mapbox/shp-write`** (added by 007) — unchanged.
- **Six new packages**, every one behind `await import()` (research.md Decision 10):
  `shpjs` (Shapefile ZIP read), `@tmcw/togeojson` (KML), `jszip` (KMZ + project archive),
  `papaparse` (CSV), `jspdf` + `html2canvas` (PDF).
- **One package removed**: `shapefile` — superseded by `shpjs`, which handles ZIP archives,
  nested directories, and `.cpg` encoding that the current loose-file path cannot
  (research.md Decision 9).
- No new state-management, CSS, mapping, ORM, or database dependency, so **no constitution
  amendment is required** (Technology Stack section).

**Storage**: PostgreSQL + PostGIS. Two new models (`ImportJob`, `ImportIssue`), `ExportJob`
extended with three nullable/defaulted columns, `Feature` gains one nullable `importJobId` column
and its index. One additive migration, no backfill — [data-model.md](./data-model.md).
**No file bytes are stored anywhere, ever.**

**Testing**: Vitest + React Testing Library — unchanged. New/changed Route Handlers and
repositories are tested against the real ephemeral PostGIS database with the established
skip-if-unavailable pattern. Two tiers are new for this feature: a **large-dataset performance
tier** (100,000-feature import, memory ceiling, cancellation latency) and an **idempotency /
concurrency tier** (chunk replay, rollback isolation under a concurrent insert).

**Target Platform**: Unchanged — Node.js runtime, single Postgres/PostGIS instance. The
client-executes / DB-records design is deliberately runtime-portable: nothing here needs a queue,
a broker, a scheduler, an object store, or a long-running function.

**Project Type**: Web application — single Next.js App Router app. Adds one feature module,
`src/features/import-export/`, with the same internal structure `database` / `analysis` / `map` /
`search` already use.

**Performance Goals** (from spec Success Criteria):

- SC-001: 1,000-feature import visible on the map in under 30 s, including validation and
  confirmation.
- SC-002: 100,000-feature import completes with the interface interactive throughout.
- SC-003: progress advances at least once every 3 s for any import longer than 3 s.
- SC-004: cancellation stops further commits within 2 s.
- SC-007: exported → re-imported round trip loses nothing, all four vector formats.
- SC-013: PDF produced within 15 s and matching its preview.

**Constraints**:

- No queue, broker, scheduler, or object storage may be introduced.
- All persisted geometry stays EPSG:4326 (Constitution Principle IV; spec Assumptions).
- **The CSP in `next.config.ts` must not be weakened.** Two of this plan's decisions exist because
  of it: workers must be same-origin rather than `blob:` (Decision 7), and the EPSG catalog must
  be server-side because `connect-src 'self'` blocks a runtime lookup (Decision 4).
- Map Editing's existing import endpoint and feature-listing endpoint must keep working unchanged.

**Scale/Scope**: 100,000+ features per import; 50 MB default max file size (env-configurable);
1,000 features per chunk; ~15 components, ~7 hooks, ~10 services, 8 Route Handlers.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Both passes below.*

| # | Principle | Verdict | Evidence |
|---|---|---|---|
| I | Architecture (Feature-First) | **PASS** | New `src/features/import-export/` with the standard subdirectories; components presentational only; logic in hooks/services; store mutations only via actions; **no file under `src/features/` imports `@prisma/client`**. Cross-feature imports are deep, not via barrels — matching the hazard `analysis/services/exportService.ts` already documents. *(Interpretation note below.)* |
| II | Type Safety | **PASS** | `strict` unchanged; no `any`, no `@ts-ignore`. Four new Zod schema modules in `src/shared/contracts/`, each exporting its `z.infer` type, imported by **both** the Route Handler and the client service. |
| III | Database | **PASS** | Prisma only; PostGIS geometry types only; every new index declared in the schema; the existing GiST index carries the duplicate probe; all raw SQL is parameterized `$queryRaw`/`$executeRaw`/`Prisma.sql` — **no concatenation**; one `prisma migrate` migration. |
| IV | GIS Principles | **PASS** | **Persisted transformation is `ST_Transform` in PostGIS** (Decision 4). `ST_IsValid` gates every insert. proj4 is confined to the preview (transient UI feedback) and export (a downloaded file — not persisted, not an authoritative server query result). Geometry types stay the established six. SRID stays 4326 platform-wide. |
| V | Performance | **PASS** | All six new dependencies behind `await import()`; `ANALYZE=true npm run build` is a mandatory gate; query keys centralized in `services/queryKeys.ts`; narrow Zustand selectors; parsing off the main thread in a worker. |
| VI | Security | **PASS** | **CSP unchanged** — no header weakened. Every Route Handler Zod-validates before use. All DB access parameterized. `assertProjectRole` before any handler logic on every new endpoint. No secret is read client-side. |
| VII | Testing | **PASS** | Unit, store, hook, component, API, integration, and a11y tiers all specified — see Testing Strategy and the matrices in [contracts/repository-api.md](./contracts/repository-api.md) and [contracts/client-api.md](./contracts/client-api.md). |
| VIII | Documentation | **PASS** | JSDoc on every export, with units/CRS/side effects stated. Full Spec Kit lifecycle (spec → plan → tasks → implementation → tests → feature `README.md`). Deviations recorded in Complexity Tracking below. |
| IX | Git Workflow | **ACTION REQUIRED** | The repository is currently on `main` and the setup script reported an empty branch. **A `005-import-export` branch must be created before the first commit** — direct commits to `main` are forbidden. Conventional Commits; PR with review. |
| X | Quality Gates | **PASS** | `tsc --noEmit`, `eslint --max-warnings 0`, full test suite, `next build`, bundle analyzer, Lighthouse a11y ≥ 90, security headers verified — enumerated under Quality Gates. |

### Interpretation note on Principle I

Principle I states that Route Handlers are "the only code in the entire codebase permitted to
import the Prisma client." As **practiced** since 003-database-foundation, and in all 18 existing
repositories, that boundary is drawn at `src/server/repositories/*` — Route Handlers delegate to
repositories, which hold `prismaClient`. This plan follows the established, universal codebase
pattern rather than diverging from it. The load-bearing half of the rule — that nothing under
`src/features/` touches the database — is honoured absolutely.

### Post-design re-evaluation

Re-checked after data-model.md and contracts/ were written. No verdict changed. Two items were
tightened during design rather than after:

- Principle IV initially permitted client-side proj4 on the import path (matching the existing
  `shapefileImport.ts`). Design review moved it to `ST_Transform`, which both complies and
  improves EPSG coverage.
- Principle V initially assumed `file-saver`. Design review dropped it in favour of a six-line
  shared utility, reducing the dependency count from seven to six.

---

## Project Structure

### Documentation (this feature)

```text
specs/005-import-export/
├── plan.md              # This file
├── spec.md              # Approved — NOT modified by this command
├── research.md          # Phase 0 — 21 decisions
├── data-model.md        # Phase 1 — entities, indexes, migration
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/
│   ├── api-contracts.md      # 8 new endpoints + 2 reused
│   ├── repository-api.md     # importJobRepository + exportLogRepository delta
│   └── client-api.md         # services / hooks / stores / components
├── checklists/
│   └── requirements.md  # From /speckit-specify — all items pass
└── tasks.md             # Phase 2 — NOT created by this command
```

### Source Code (repository root) — additions and changes only

```text
src/
├── app/api/
│   ├── layers/[layerId]/imports/route.ts              NEW  POST  create job
│   ├── imports/[importJobId]/route.ts                 NEW  GET   progress/status
│   ├── imports/[importJobId]/chunks/route.ts          NEW  POST  commit chunk
│   ├── imports/[importJobId]/complete/route.ts        NEW  POST  finalize
│   ├── imports/[importJobId]/cancel/route.ts          NEW  POST  cancel
│   ├── imports/[importJobId]/rollback/route.ts        NEW  POST  undo this import
│   ├── imports/[importJobId]/issues/route.ts          NEW  GET   validation issues
│   ├── projects/[projectId]/imports/route.ts          NEW  GET   import history
│   ├── projects/[projectId]/exports/route.ts          —    UNCHANGED (schema widened only)
│   └── layers/[layerId]/features/import/route.ts      —    UNCHANGED (Map Editing's path)
│
├── server/repositories/
│   ├── importJobRepository.ts                         NEW
│   ├── exportLogRepository.ts                         MOD  +scope/outputCrs/layerCount, +"pdf"
│   └── featureRepository.ts                           —    UNCHANGED (Decision 5)
│
├── shared/contracts/
│   ├── importJob.schema.ts                            NEW
│   ├── importChunk.schema.ts                          NEW
│   ├── importIssue.schema.ts                          NEW
│   ├── crs.schema.ts                                  NEW
│   ├── exportLogRequest.schema.ts                     MOD  widened
│   ├── geoJsonImport.schema.ts                        —    REUSED unchanged
│   └── geometry.schema.ts                             —    REUSED unchanged
│
├── features/import-export/                            NEW MODULE
│   ├── components/    ImportDialog, FileDropZone, CrsSelector, CrsPreview,
│   │                  CsvColumnMapper, ImportPreviewTable, ValidationReport,
│   │                  ImportProgress, ImportSummaryPanel, ImportHistoryPanel,
│   │                  ExportDialog, PrintDialog, PrintPreview, ScaleBar, MapLegend
│   ├── hooks/         useImport, useImportProgress, useImportHistory,
│   │                  useImportIssues, useExport, usePrintExport
│   ├── services/      importService, importPipeline, importParser.worker,
│   │                  parsers/{geoJson,shapefile,kml,csv}Parser,
│   │                  crsCatalog, exportWriters, pdfExport, downloadBlob,
│   │                  apiFetch (re-export), queryKeys
│   ├── store/         importStore, exportStore
│   ├── types/         importExport.types.ts
│   ├── utils/         sanitizeAttributes, repairGeometry, duplicateHash, formatDetect
│   ├── __tests__/     + fixtures/
│   ├── README.md
│   └── index.ts       public barrel
│
├── features/analysis/services/exportService.ts        MOD  writers move out; re-export shim
├── features/database/components/ImportExportControls.tsx  MOD  becomes a dialog launcher
├── features/database/services/shapefileImport.ts      DELETE (superseded — Decision 9)
├── features/database/utils/reprojection.ts            MOD  generalized into crsCatalog
└── features/map/components/MapContainer.tsx           MOD  ONE LINE: crossOrigin="anonymous"

prisma/schema.prisma                                   MOD  +2 models, +4 columns, +2 indexes
```

**Structure Decision**: single Next.js application, feature-first. Import/Export becomes its own
module (`src/features/import-export/`) rather than growing `features/database`, because it carries
~15 components and two stores of its own and because `features/database`'s barrel already pulls
Leaflet into anything that touches it. All cross-feature reuse is by deep import from the specific
module, never through a barrel — the exact precaution
`src/features/analysis/services/exportService.ts` already documents in its header comment.

---

## Architecture

### Import pipeline

```
File
  │ format detection by CONTENT, not extension                        (FR-004)
  │ size / zip-slip / expansion-ratio checks                    (FR-081–083)
  ▼
Web Worker  ── same-origin, NOT blob: (CSP)                     (Decision 7)
  │ await import() the one parser this format needs             (Decision 10)
  │ parse → NormalizedFeature[]  (still in SOURCE CRS)
  │ preflight: geometrySchema structure + range, ring repair,
  │            attribute sanitization, in-file duplicate hash    (Decision 6)
  ▼
PreflightResult → importStore
  │ CRS selection + transformation preview (proj4, transient)   (FR-060–065)
  │ CSV column mapping                                          (FR-029–031)
  ▼
CONFIRMATION GATE — nothing written yet; abandoning here is free   (FR-005, FR-011)
  ▼
POST /api/layers/:id/imports                     → ImportJob (running)
  ▼
for each chunk of 1,000:
  POST /api/imports/:id/chunks
      ├─ Zod re-validation (the real security boundary)         (Decision 18)
      ├─ ST_Transform(ST_SetSRID(…, :srid), 4326)               (Decision 4)
      ├─ WHERE ST_IsValid(…) AND NOT EXISTS(duplicate probe)    (Decision 8)
      ├─ RETURNING id  → committed; input − returned = rejected (Decision 5)
      └─ counters + heartbeatAt + capped ImportIssue rows       (Decision 16)
  ▼
POST /api/imports/:id/complete                   → succeeded | failed
      └─ Strict mode: any rejection → POST /rollback instead     (Decision 6)
```

### Export pipeline

```
ExportSource: selection | layer | project                            (FR-035)
  ▼
featureService.list — cursor-paged, one page at a time         (007, reused)
  ▼
optional proj4 transform to outputCrs (not persisted → OK)     (Decision 4)
  ▼
writer: GeoJSON | CSV | KML | Shapefile | PDF                  (Decision 21)
      CSV     — buffered rows (header needs all keys first), formula-neutralized
      KML     — streamed Blob parts, MultiGeometry preserved
      SHP     — buffered (header carries type + bbox); partitioned by geometry type
      PROJECT — jszip: one file per layer + manifest.json
      PDF     — html2canvas raster + jsPDF vector overlays     (Decision 11)
  ▼
downloadBlob()
  ▼
POST /api/projects/:id/exports  — logs the finished attempt, success OR failure  (FR-043)
```

### Validation pipeline

Two tiers, split by what genuinely needs a database (research.md Decision 6):

| Tier | Where | Checks |
|---|---|---|
| Preflight — **whole file, before the gate** | Worker | structure, geometry type, coordinate range, CRS bbox plausibility, in-file duplicates, attribute sanitization, ring-closure repair, CSV row parsing |
| Commit-time — **per chunk** | PostGIS | `ST_IsValid` topology, existing-layer duplicates |

`geometrySchema` is reused verbatim for the preflight — its own doc comment already states that
topology "is intentionally NOT checked here — that is PostGIS `ST_IsValid`'s job." This split is
that comment's design applied at scale.

**Strict mode is auto-rollback**: the client reacts to any commit-time rejection by calling
`/rollback`, so the observable outcome is exactly all-or-nothing.

### Transformation pipeline

| Path | Engine | Persisted? | Principle IV |
|---|---|---|---|
| Import | **PostGIS `ST_Transform`** | Yes | Compliant — authoritative math in PostGIS |
| Preview | proj4 (client) | No | Compliant — "transient UI feedback" |
| Export | proj4 (client) | No | Compliant — a downloaded file is not platform state |

Custom CRS (FR-063) works on both paths: PostGIS accepts a proj4 text target directly, so no
`spatial_ref_sys` entry is required.

### Background processing

There is **no server-side background worker**, and that is a deliberate design commitment, not a
gap. The browser tab is the executor; the database is the job's system of record
(research.md Decision 3). This buys: no queue, no broker, no scheduler, no long-running function,
and identical behavior on Vercel / Railway / Docker / AWS / Supabase — the same portability
constraint 007 imposed on itself.

The one thing a real worker would give for free — surviving the client's disappearance — is
covered by `heartbeatAt` plus a lazy sweep on history read (research.md Decision 17), which needs
no infrastructure at all.

### Progress tracking

Client-owned (`importStore`), because the tab driving the import already holds both numerator and
denominator. `ImportJob.importedCount` / `rejectedCount` / `heartbeatAt` are written per chunk and
polled via `GET /api/imports/:id` **only** when a running job is opened without an in-memory
driver — after a reload, or from another device (research.md Decision 12). Polling is the baseline,
matching 007's research Decision 6; the SSE endpoint 006 added is not used here.

### Import history / Export history

`ImportJob` rows *are* the import history; `ExportJob` rows *are* the export history. No parallel
tables (research.md Decision 15). Both are cursor-paginated newest-first with the same
`DEFAULT_LIMIT = 20` / `MAX_LIMIT = 100` as `listExportsForProject`, and both are readable by
project `Viewer`s while every mutating action requires `Editor` (FR-080).

### File storage strategy

**None.** No uploaded bytes are written to disk, object storage, or the database at any point
(research.md Decision 2). `ImportJob` retains `fileName`, `fileSizeBytes`, `mimeType`, and a
client-computed SHA-256 `fileHash` as provenance metadata. Exported files are `Blob`s handed
straight to a download; nothing is staged server-side.

This is the single largest simplification in the plan: it removes upload transport, temp-file
lifecycle, storage credentials, cleanup jobs, and server-side archive extraction — and with them
an entire class of security surface.

---

## Database Changes

Full detail in [data-model.md](./data-model.md). Summary:

| Change | Kind |
|---|---|
| `ImportJob` model + 4 indexes | New |
| `ImportIssue` model + 1 index | New |
| `Feature.importJobId` (nullable) + index + FK `SetNull` | Additive column |
| `ExportJob.scope` (default `"layer"`), `.outputCrs`, `.layerCount` | Additive columns |
| `ExportJob.format` value set gains `"pdf"` | Validation only — already a `String` column |
| Back-relations on `Project`, `User`, `Layer` | Additive, no SQL |

One migration, `add_import_jobs_and_export_scope`. **No backfill**: every added column is nullable
or defaulted, so existing `Feature` rows correctly read as "not from a tracked import" and existing
`ExportJob` rows correctly read as `scope = "layer"`. Adding a nullable column with no default is
metadata-only in PostgreSQL 11+, so the large `Feature` table is not rewritten.

---

## React Query Flow

| Hook | Key | Behavior |
|---|---|---|
| `useImportProgress` | `importJob(jobId)` | `refetchInterval: 2000`, **enabled only when this tab is not the driver** |
| `useImportHistory` | `importHistory(projectId, params)` | Cursor-paginated, newest first |
| `useImportIssues` | `importIssues(jobId, params)` | Cursor-paginated, `sourcePosition` order |
| `useImport` | *(mutations)* | On settle invalidates `importHistoryList(projectId)` **and** `database.featuresList(layerId)` |
| `useExport` | *(mutation)* | On settle invalidates `exportHistoryList(projectId)` |

Keys are centralized in `services/queryKeys.ts` (Principle V). The list-prefix keys
(`importHistoryList`, `exportHistoryList`) are one element shorter than their parameterized
counterparts, so `invalidateQueries` matches every cached cursor page rather than only the
no-params page — the exact trap `database/services/queryKeys.ts` documents at length on
`featuresList()`.

Server state is **never** copied into Zustand. The one client-held artifact, `preflight`, was never
server state — it is computed locally and is what makes the uncapped in-session issue download
possible.

---

## Zustand Flow

| Store | Holds | Never holds |
|---|---|---|
| `importStore` | `step`, `file`, `preflight`, `crs`, `columnMapping`, `mode`, `progress`, `activeJobId`, `summary` | `ImportJobRecord`s from the server |
| `exportStore` | `scope`, `format`, `outputCrs`, `printLayout`, `isDialogOpen` | The selection itself — read from Map Editing's existing selection store |

All mutations go through named store actions; no component reaches into store internals.

---

## Repository Layer

New: `src/server/repositories/importJobRepository.ts` —
`createImportJob`, `commitImportChunk`, `completeImportJob`, `cancelImportJob`,
`rollbackImportJob`, `getImportJobById`, `listImportsForProject`, `listIssuesForJob`, plus a
module-private `sweepAbandonedJobs`.

Modified additively: `exportLogRepository.ts` — `ExportFormat` gains `"pdf"`, `LogExportInput`
gains `scope` / `outputCrs` / `layerCount`. **Every existing call signature still compiles.**

Unchanged: `featureRepository.ts`. Signatures, behavior, and tests all stay as they are
(research.md Decision 5).

Every function asserts its role first (`Editor` to write, `Viewer` to read), throws the shared
error classes, and returns a plain `*Record` shape. Full contract and test matrix in
[contracts/repository-api.md](./contracts/repository-api.md).

---

## Route Handlers

Eight new handlers, each following the established shape exactly:
`getCurrentUser` → `assertWriteRateLimit` (writes only) → Zod `safeParse` → repository →
`respond()` with `logger.request` → `catch` → `handleRouteError`.

Two existing handlers are reused: `/api/projects/:projectId/exports` (schema widened, **no code
change**) and `/api/layers/:layerId/features` (untouched). Map Editing's
`/api/layers/:layerId/features/import` is untouched.

**No new `ApiErrorCode`** — all nine existing codes cover every situation this feature produces
(research.md Decision 19). Full endpoint list, request/response shapes, and error mapping in
[contracts/api-contracts.md](./contracts/api-contracts.md).

---

## Performance

**Target**: 100,000 features imported with the interface interactive throughout (SC-002).

| Concern | Approach |
|---|---|
| Main-thread blocking | Parsing + preflight in a same-origin Web Worker (Decision 7) |
| Database round trips | Set-based chunk insert: **4 statements per 1,000 features** instead of 3 per feature — ~400 statements total, not ~300,000 (Decision 5) |
| Memory | The worker emits chunks of 1,000 and never retains the full array; page-streamed export; CSV/Shapefile buffering is documented and bounded |
| Duplicate probe cost | GiST bbox narrowing before `ST_OrderingEquals`; `ST_OrderingEquals` chosen over the far more expensive `ST_Equals` (Decision 8) |
| Rejection-reason cost | `ST_IsValidReason` runs only on the ids that actually failed, never on the whole chunk |
| Issue-row volume | Capped at 1,000 per job; counters stay exact (Decision 16) |
| Bundle size | All six new dependencies behind `await import()`; analyzer run is a merge gate (Principle V) |
| Progress overhead | Client-owned — zero network round trips for the common case (Decision 12) |
| Large exports | Cursor-paged reads with honest `(pagesLoaded, pagesLoaded + 1)` progress (007's writer, reused) |
| Rollback at scale | `[importJobId]` index makes it an index scan, not a sequential scan of a 500k-row table |

**Streaming**: response streaming is deliberately not used. The bottleneck is the database write
path, not response serialization, and chunked requests already give progress, cancellation, and
retry — properties a streamed response would not.

---

## Security

Client-side checks are for UX; **the server is the security boundary** (research.md Decision 18).
Because parsing is client-side, the chunk endpoint must assume a hostile caller.

| Control | Client | Server |
|---|---|---|
| Max file size (50 MB, env-configurable) | Rejected before read (FR-081) | n/a — no upload |
| Zip slip (`..`, absolute paths) | Entry names checked before any entry is read (FR-082) | n/a |
| Zip bomb (≤100:1, ≤500 MB total) | Enforced during extraction (FR-083) | n/a |
| Format sniffing | By content, not extension (FR-004) | n/a |
| Chunk size / body size | Enforced when chunking | **Zod → `INVALID_INPUT`** |
| Geometry structure + range | `geometrySchema` | **`geometrySchema` again** |
| Geometry topology | — | **`ST_IsValid`** |
| Attribute sanitization | During normalization | **Re-applied before storage (FR-084)** |
| SQL injection | — | **Parameterized `$queryRaw` only** (Principle III) |
| Authorization | — | **`assertProjectRole` before any logic** (FR-085) |
| Rate limiting | — | **`assertWriteRateLimit`** on every mutating route |
| Error disclosure | — | **`handleRouteError`** generic fallback (FR-086) |
| CSV formula injection | — | Neutralized on **export** (FR-040) |

**Security headers are unchanged.** In particular the CSP is not touched: the worker is built
same-origin precisely so `worker-src blob:` is never needed, and a CSP diff in this PR should be
treated as a review failure.

---

## Testing Strategy

Per Constitution Principle VII, co-located under `src/features/import-export/__tests__/` and
`src/server/repositories/__tests__/`. Database-backed tests use the real ephemeral PostGIS
instance with the established skip-if-unavailable pattern.

| Tier | Coverage |
|---|---|
| **Unit** | Each of the four parsers against a fixture; `crsCatalog` transform + `isBboxPlausible`; attribute sanitization; ring-closure repair; duplicate hashing; CSV formula neutralization; `chunkFeatures` boundary cases |
| **Repository** | Full matrix in [contracts/repository-api.md](./contracts/repository-api.md) — role gates, `ST_Transform` correctness, `ST_IsValid` rejection, duplicate exclusion, **idempotent chunk replay**, **rollback isolation under a concurrent insert**, abandoned-job sweep, issue cap |
| **API** | Every new handler: validation failure, success, and each error path; the Viewer-forbidden path on all five write endpoints; `CONFLICT` on post-cancel chunk and double-rollback |
| **Store** | `importStore` step transitions; `exportStore`; assertion that no server state is shadowed |
| **Hook** | `useImport` happy path; **Strict-mode auto-rollback**; cancel aborts further chunks; `useImportProgress` polls only when not the driver; `useExport` logs on both success and failure |
| **Component** | Every component with conditional rendering, interaction, or ARIA state |
| **Integration** | All five formats end-to-end; export round trip (SC-007); the full US9 cancel → undo journey |
| **Large-dataset / performance** *(new tier)* | 100,000-feature import completes; peak memory under ceiling; cancellation latency < 2 s (SC-004); progress cadence < 3 s (SC-003) |
| **Accessibility** | axe assertions on all three dialogs; keyboard-only + screen-reader CSV walkthrough (SC-014) |

Regression guard: the existing suites for `featureRepository`, `exportLogRepository`, 007's
`exportService`, and Map Editing's import path must pass **unmodified**. If any of them needs
editing, this plan's non-invasiveness claim has been broken and the change needs re-examination.

---

## Deployment Notes

- **Migration**: `prisma migrate deploy`. Additive, no backfill, no downtime. Adding the nullable
  `Feature.importJobId` is metadata-only in PostgreSQL 11+.
- **Index on a populated `Feature` table**: the generated SQL should be hand-edited to
  `CREATE INDEX CONCURRENTLY` for `Feature.importJobId` before deploying against a large
  production table. Prisma Migrate does not emit `CONCURRENTLY` itself.
- **PostGIS prerequisite**: `ST_Transform` needs a populated `spatial_ref_sys`. The extension
  populates it on install; the migration asserts it is non-empty so a misconfigured environment
  fails at migrate time rather than at a user's first import.
- **Environment**: `IMPORT_MAX_FILE_BYTES` (optional, default 50 MB) is the only new variable.
- **No new infrastructure**: no queue, broker, scheduler, object store, or long-running function.
  Deployment topology is unchanged across every target 010 documents.
- **Runtime portability**: because the browser executes imports, no function timeout applies to the
  import as a whole — only to each individual ~1–3 MB chunk request.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Tainted canvas breaks PDF export** — basemap tiles cached before `crossOrigin` was added | Medium | PDF unusable | `crossOrigin="anonymous"` on the tile layer; `canRasterize()` probe; automatic `window.print()` fallback (Decision 11) |
| **CSP blocks a blob-URL worker** if a helper library is introduced later | Medium | Import silently fails in production, works in dev | Worker constructed via `new URL(…, import.meta.url)`; documented in three artifacts; a CSP diff in review is a red flag (Decision 7) |
| **Memory exhaustion on a 50 MB file** — `JSON.parse` peak plus the parsed tree | Medium | Tab crash | Worker isolation; chunk-and-release; hard 50 MB limit; large-dataset test tier with a memory ceiling |
| **Chunk retry double-inserts** after a network blip | Medium | Duplicated features | Idempotency on `(importJobId, chunkIndex)`; explicit repository test (Decision 3) |
| **Coordinate transformation failure** — unknown EPSG or unparseable custom definition | Medium | Import fails late | Validated at job creation against `spatial_ref_sys`; bbox-plausibility warning before commit (FR-065); custom definitions parse-checked client-side first |
| **Wrong CRS imported silently** — the classic GIS disaster | Medium | Data in the wrong hemisphere | Mandatory transformation preview + out-of-bounds warning requiring explicit confirmation (SC-010) |
| **Duplicate probe too slow** on a very large target layer | Medium | Chunk latency grows | GiST bbox narrowing first; `ST_OrderingEquals` not `ST_Equals`; measured in the performance tier; the probe is skippable per-job if it proves pathological |
| **Partial import after a crash** | Medium | Confusing state | Committed chunks are countable and reported; `heartbeatAt` sweep gives a terminal state (FR-074); rollback stays available |
| **Corrupt / malicious archive** | Low | Client-side DoS | Zip-slip and expansion-ratio checks before extraction; worker isolation means a crash costs a worker, not the tab |
| **`shpjs` behaves differently from `shapefile`** on existing users' files | Low | Regression in Shapefile import | Fixture-based parity tests on the same archives before `shapefile` is removed |
| **Issue-row flood** from a mis-mapped 100k CSV | Low | Database growth | 1,000-row cap with exact counters retained (Decision 16) |
| **Interim auth seam** — `getCurrentUser` is still a `DEV_USER_ID` placeholder | High | Every role check is only as real as the seam | Pre-existing platform-wide risk, not introduced here. This feature adds no new authorization mechanism — it uses `assertProjectRole` exactly as 006/007 do, so it inherits the fix automatically when real sessions land |

---

## Development Phases (for `/speckit-tasks`)

Ordered so each phase is independently testable and the P1 stories land first.

| Phase | Content | Stories |
|---|---|---|
| 1 | **Foundation** — Prisma models + migration; `importJobRepository` skeleton; four Zod schema modules; feature module scaffold + barrel | — |
| 2 | **Import core** — `commitImportChunk` set-based insert with `ST_Transform` + `ST_IsValid`; the five write endpoints; `importService`; `useImport`; `importStore` | US1 |
| 3 | **GeoJSON import UI** — `ImportDialog`, `FileDropZone`, preflight worker, `ImportProgress`, `ImportSummaryPanel` | US1 (P1) |
| 4 | **Export** — move 007's writers to `exportWriters`; re-export shim; scope + output CRS; formula neutralization; mixed-geometry Shapefile; project archive; `ExportDialog`; widened export log schema | US5 (P1) |
| 5 | **Validation** — `ValidationReport`; issues endpoint + hook; Strict-mode auto-rollback; duplicate detection both tiers | US7 |
| 6 | **Coordinate systems** — `crsCatalog`; `CrsSelector`; `CrsPreview`; bbox-plausibility warning; custom CRS | US8 |
| 7 | **Shapefile import** — `shpjs` parser; ZIP + nested dirs + `.cpg`; multi-shapefile choice; retire `shapefileImport.ts` and the `shapefile` dependency | US2 |
| 8 | **CSV import** — `papaparse` parser; `CsvColumnMapper`; `ImportPreviewTable`; delimiter/header handling | US4 |
| 9 | **History** — import history endpoint, repository, hook, `ImportHistoryPanel`; abandoned-job sweep | US10 |
| 10 | **KML / KMZ import** — `@tmcw/togeojson` + `jszip`; folder path; altitude drop; unsupported-content reporting | US3 |
| 11 | **Bulk operations hardening** — worker chunking at 100k; cancellation latency; rollback isolation; large-dataset performance tier | US9 |
| 12 | **Print & PDF** — `PrintDialog`, `PrintPreview`, `ScaleBar`, `MapLegend`, `pdfExport`, `crossOrigin` prop, `window.print()` fallback | US6 |
| 13 | **Polish** — a11y sweep across all three dialogs; feature `README.md`; bundle-analyzer run; quality gates | — |

Phases 1–4 constitute a shippable MVP: GeoJSON import and full multi-format export, the two P1
stories.

---

## Quality Gates

Every gate must pass before merge (Constitution Principle X), with no exception absent a
Complexity Tracking entry.

```bash
npx tsc --noEmit                 # zero errors
npm run lint                     # eslint src --max-warnings 0
npm run test                     # every tier in Testing Strategy
npm run build                    # production build, no errors
ANALYZE=true npm run build       # MANDATORY — six new dependencies (Principle V)
```

Plus, verified manually:

- Lighthouse **Accessibility ≥ 90** on every route the import/export UI mounts on.
- All six security headers present on the deployed response, and **the CSP byte-identical to
  `main`**.
- Bundle analyzer confirms **none** of the six new packages appear in the initial route bundle.
- No `TODO` left in place of real error handling or a stubbed Route Handler.
- The existing test suites for `featureRepository`, `exportLogRepository`, 007's `exportService`,
  and Map Editing's import path all pass **unmodified**.

---

## Complexity Tracking

| Violation / Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Six new npm dependencies** (`shpjs`, `@tmcw/togeojson`, `jszip`, `papaparse`, `jspdf`, `html2canvas`) | Five source formats and PDF output cannot be implemented from primitives at acceptable cost or correctness | Hand-rolling a Shapefile/DBF reader, a KML parser, a ZIP reader, an RFC 4180 CSV parser, and a PDF writer is thousands of lines of high-risk code. All six are dynamically imported and gated on the bundle analyzer. No mandated-stack category is affected, so no constitution amendment is required |
| **Replacing `shapefile` with `shpjs`** — a change to an implemented feature's dependency | FR-017 requires single-ZIP import; `shapefile` has no archive awareness whatsoever, and the current workaround makes users multi-select component files | Wrapping `shapefile` in JSZip means reimplementing component discovery, `.cpg` encoding handling, and multi-shapefile archives that `shpjs` already provides. Parity fixture tests run before removal |
| **One line changed in Map Core** — `crossOrigin="anonymous"` on `TileLayer` | Without it, `html2canvas` taints the canvas and PDF export throws `SecurityError` | No alternative exists: the browser only records a tile's CORS approval if the request carried the attribute. Scope is one prop; a `window.print()` fallback covers the case where it still fails |
| **`ImportIssue` capped at 1,000 rows per job** | A 100,000-row CSV with a mis-mapped column would otherwise write more issue rows than the import itself | Uncapped persistence turns a user error into a database-growth incident. Counters stay exact, inline display (100) is fully met, and the uncapped report is available in-session. **Stated limitation**: from history, the first 1,000 issues are available, not all |
| **`file-saver` declined**, contrary to the original feature brief's technology list | The codebase already downloads blobs with a six-line anchor-click; a dependency for that spends Principle V's budget on nothing new | Adopting it would add a seventh dependency to replace working code. Recorded here because it is a deliberate departure from the brief |
| **Client-side execution of a "background" job** | No queue, broker, or scheduler may be introduced (a constraint inherited from 007's research Decision 5, which chose this for deployment portability) | A real server-side worker needs infrastructure this platform does not have. The one thing it would give free — surviving client disappearance — is covered by `heartbeatAt` + lazy sweep |
| **Principle I read as "server-only modules," not "Route Handlers only"** | All 18 existing repositories import `prismaClient`; Route Handlers delegate to them | Inlining every query into Route Handlers would diverge from the established pattern across the entire codebase. The load-bearing half of the rule — nothing under `src/features/` touches the database — is honoured absolutely |
| **Currently on `main`; no feature branch exists** | Principle IX forbids direct commits to `main` | Not a justified deviation — an action item. `git checkout -b 005-import-export` before the first commit |
