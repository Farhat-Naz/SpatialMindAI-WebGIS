# Import / Export

GIS data interchange: GeoJSON, Shapefile, KML, KMZ, and CSV **in**; GeoJSON,
Shapefile, KML, CSV, and PDF **out**. Plus validation reporting, coordinate-system
handling, progress, cancellation, per-import rollback, and history.

Spec: [`specs/005-import-export/`](../../../specs/005-import-export/).

---

## The two ideas that explain everything else

### 1. No file ever reaches the server

All five source formats are parsed **in the browser**. The server receives
normalized JSON chunks and nothing else. There is no upload endpoint, no temp
storage, no object store, and no table holding file bytes.

What that buys: no upload transport, no temp-file lifecycle, no storage
credentials, no cleanup job, no server-side archive extraction — and with them, a
whole class of security surface. `ImportJob` keeps `fileName`, `fileSizeBytes`,
`mimeType`, and a client-computed `fileHash` as provenance, and that is all.

The same principle already governed export before this feature existed: the
browser produces the file, and `POST /api/projects/:id/exports` **logs a finished
attempt, never drives one**.

### 2. The browser is the executor; the database is the system of record

An import is a DB-backed, client-driven, chunked job. The tab loops
`POST /api/imports/:id/chunks` a thousand features at a time; `ImportJob` accrues
the counters. There is no queue, broker, scheduler, or long-running function, so
deployment topology is unchanged on every target.

The one thing a real worker would give free — surviving the client's
disappearance — is covered by `heartbeatAt` plus a lazy sweep on history read.
No infrastructure at all.

---

## Where the code lives

```
services/     the only code that calls fetch or runs a format writer
  importService.ts        thin wrappers over the eight endpoints — no logic
  importPipeline.ts       chunking, progress, preflight orchestration, chunk retry
  importParser.worker.ts  the parser worker (see the CSP note below)
  parsers/                one module per format, one shared signature
  exportWriters.ts        the five writers (moved here from features/analysis)
  crsCatalog.ts           proj4 catalog — preview and export only
  pdfExport.ts            html2canvas raster + jsPDF vector overlays
  downloadBlob.ts         anchor-click + revokeObjectURL, six lines
hooks/        React Query + the only place mutations are sequenced
store/        Zustand — UI/session state, never a shadow of server state
components/   presentational only
utils/        pure helpers: guards, sanitization, repair, hashing
```

Server-side counterparts: `src/server/repositories/importJobRepository.ts`,
`src/server/http/importRouteHelpers.ts`, and eight Route Handlers under
`src/app/api/`.

---

## Four things that will bite you if you change them

### The worker must not be a `blob:` worker

```ts
new Worker(new URL("./importParser.worker.ts", import.meta.url), { type: "module" })
```

`next.config.ts` sets `script-src 'self' 'unsafe-inline'` with no `worker-src`.
`worker-src` falls back through `child-src` to `script-src`, and `blob:` is not
listed — so `new Worker(URL.createObjectURL(...))`, which several worker-helper
libraries use internally, **works in development and is blocked in production**.

Do not introduce a worker helper library, and do not relax the CSP. A CSP diff in
a PR touching this feature should be treated as a review failure.

### `ST_Transform` has two signatures and only one of them is safe here

For a custom CRS the commit uses:

```sql
ST_Transform(ST_GeomFromGeoJSON(…), <definition>, 4326)   -- from_proj → to_srid
```

**Not** `ST_Transform(ST_SetSRID(…, 4326), <definition>)`. The second form reads
as the same thing and means the opposite: it declares the source to be WGS84 and
converts *to* the custom system. Worse, given WKT rather than proj4 it does not
error — it returns the geometry **unchanged**, so every coordinate would be
persisted untransformed with nothing anywhere reporting a problem.

The three-argument form handles both proj4 and WKT correctly, which is why
`toCanonicalGeometry` uses it and why `assertCrsIsUsable` probes with the same
signature the commit will use.

### Coordinates leave the parsers untransformed

Every parser returns geometry **in the source CRS**. The persisted transform is
`ST_Transform`, server-side (Constitution Principle IV). This is why
`shapefileParser` uses `shpjs`'s low-level `parseShp`/`parseDbf` rather than its
convenience entry point — the convenience function reprojects with proj4 before
returning, which is exactly what must not happen on the persisted path.

proj4 is still used, but only for the CRS *preview* (transient UI feedback) and
for *export* (a downloaded file is not platform state). Both are carve-outs
Principle IV states explicitly.

### Import is append-only

An import adds features. It never deletes, overwrites, replaces, or truncates
what is already in the target layer. `appendOnly.integration.test.ts` asserts
this directly — including that no `DELETE` or `UPDATE` against `Feature` is even
issued during a normal import — because it is the one property a user cannot
verify before committing and whose violation is unrecoverable.

---

## Deliberate non-existence

Four models named in the original brief were not created, and several
"obvious" modules do not exist. Each is a decision, not an omission:

| Not created | Because |
|---|---|
| `ImportHistory`, `ExportHistory` tables | `ImportJob` / `ExportJob` rows *are* the history |
| `FileMetadata` table | Four columns on `ImportJob`. No file bytes are stored, so there is nothing else to describe |
| `ExportStatistics` table | Four columns on `ExportJob` |
| `HistoryRepository`, `FileRepository` | Functions on the two existing repositories; and there is no file storage to have a repository for |
| `ProgressService`, `ProgressStore` | Progress is client-owned in `importStore`; the server read is `importService.get` |
| Per-format import routes | One format-agnostic endpoint pair. Every format arrives as identical normalized chunks |
| Per-format export routes | Export runs entirely client-side. None exists and none is added |
| `file-saver` | A six-line utility covers it; the dependency budget went to the six packages doing work nothing here could already do |

---

## Untouched on purpose

These are load-bearing "do not change" boundaries, not incidental:

- `src/server/repositories/featureRepository.ts` — Map Editing's per-feature
  import path. Its three-statements-per-feature loop is left exactly as it is;
  `commitImportChunk` is a separate, set-based path.
- `POST /api/layers/:layerId/features/import` and
  `GET /api/layers/:layerId/features` — unmodified, so Map Editing's read and
  write paths are bit-for-bit unchanged.
- `next.config.ts`'s CSP — see the worker note.
- `src/shared/errors/apiError.ts` — no new `ApiErrorCode`. The existing nine cover
  every situation this feature produces.
- `src/shared/contracts/geoJsonImport.schema.ts` and `geometry.schema.ts` — reused
  verbatim.

---

## Replaced

`features/database/services/shapefileImport.ts`, `utils/reprojection.ts`, and the
`shapefile` dependency were **removed**, and `ImportExportControls` was rewritten
as a dialog launcher. The spec sanctions this explicitly: the existing Map Editing
import/export controls are "replaced with the fuller interchange interface rather
than duplicated."

The old reader required the user to multi-select `.shp` + `.dbf` + `.prj`
individually, because `shapefile` has no archive awareness at all. `shpjs` reads
one ZIP and additionally handles nested directories, `.cpg` encoding, and
multi-shapefile archives.

**Parity was asserted before the deletion** — same feature count, same geometry
types in the same order, same attribute values, and coordinates agreeing to six
decimal places once the new reader's source-CRS output was transformed through the
same proj4 definition the old path used. Both fixtures
(`parcels_osgb.zip`, `parcels_latin1.zip`) passed on all four dimensions. The
parity suite was then deleted with the reader it existed to license.

---

## Two-tier validation, and why

| Tier | Where | Checks |
|---|---|---|
| Preflight — whole file, before the gate | Worker | structure, geometry type, coordinate range, CRS bbox plausibility, in-file duplicates, attribute sanitization, ring-closure repair, CSV row parsing |
| Commit-time — per chunk | PostGIS | `ST_IsValid` topology, existing-layer duplicates |

`geometrySchema` is reused verbatim for the preflight; its own doc comment already
says topology "is intentionally NOT checked here — that is PostGIS `ST_IsValid`'s
job." The split is that comment applied at scale.

Attribute sanitization runs in **both** tiers, and that is not redundancy: the
client pass tells the user what will be adjusted before they confirm, and the
server pass makes it true whatever the client sent. `sanitizeAttributes.test.ts`
asserts the two agree.

**Strict mode is auto-rollback.** The client reacts to any commit-time rejection
by calling `/rollback`, so the observable outcome is exactly all-or-nothing
without a second write path.

---

## Two caps worth knowing about

- **`ImportIssue` is capped at 1,000 rows per job.** A 100,000-row CSV with a
  mis-mapped coordinate column would otherwise write more issue rows than the
  import itself. `ImportJob`'s counters stay exact regardless, and the *uncapped*
  list is available in the session that ran the import — from
  `importStore.preflight.issues`, which is what makes the full-report download
  possible. Read back from history, only the first 1,000 survive, and the UI says
  so (`truncated: true`).
- **50 MB default file size**, mirrored client-side for fast rejection and
  configured server-side via `IMPORT_MAX_FILE_BYTES`.

---

## Testing

```bash
npm run test:db:up                  # required for the DB-backed tiers
npm run test -- import-export       # this feature
npm run test                        # everything
```

DB-backed tests skip when the database is unavailable, following the established
pattern. Fixtures under `__tests__/fixtures/` are real files — the Shapefile
archives hold genuine `.shp`/`.shx`/`.dbf`/`.prj` bytes generated by
`@mapbox/shp-write`, because a shapefile reader tested against fabricated bytes
proves nothing about a shapefile.
