# Repository Contract: Spatial Analysis Toolset (007)

**Feature**: 007-spatial-analysis

Extends `src/server/repositories/analysisRepository.ts` and
`analysisOperations.ts` (005's two files) and adds three new, equally
small repository files — `analysisPresetRepository.ts`,
`measurementRepository.ts`, `exportLogRepository.ts` — following the exact
same ownership/role-scoping and error-throwing conventions
`featureRepository.ts` originally established and 005 already reused.

---

## `analysisRepository.ts` (extended)

| Function | Change from 005 |
|---|---|
| `createAnalysisRun` | Now writes `status: "queued"` immediately, `userId` (the resolved caller, not implied by project ownership), and — for operations whose input exceeds a per-operation chunking threshold — returns before execution completes, having kicked off `executeInBackground` (below) as a detached, error-guarded async call. Small operations still resolve to a terminal status inline, preserving 005's existing fast-path behavior and tests. |
| `executeOperation` | Dispatch table extended with every new `operationType` from data-model.md (US2/US4/US5/US6); still lives entirely in `analysisOperations.ts` builders, never inline SQL. |
| `listAnalysisRunsForProject` | Adds optional `status?: string[]` filter to `params`, otherwise unchanged (still the single query serving Analysis History, per 005 Decision 2). |
| `getAnalysisRunById` | Scoping changes from `ownerId`-only to `assertProjectRole`-based visibility (research.md Decision 3) — any project member may read; unchanged return shape. |
| `deleteAnalysisRun` | Unchanged behavior; role requirement changes from "owner" to "Editor or above, or the run's own creator." |

### New: `analysisRepository.executeInBackground`

| Function | Input | Output | Notes |
|---|---|---|---|
| `executeInBackground` | `runId` | `void` (fire-and-forget, internally awaited to completion but not by the caller) | Re-fetches the run, sets `status: "running"`/`startedAt`, then iterates the operation's chunks (keyset-paginated by feature id), writing `progress` after each chunk and checking `cancelRequestedAt` before starting the next one; records `pg_backend_pid()` for the connection running the current chunk into `backendPid` so `cancelRun` (below) can issue `pg_cancel_backend`. On completion writes the terminal `status`/`resultLayerId`/`resultData`/`errorMessage`/`completedAt`/`executionTimeMs`, clearing `backendPid`. Any thrown error inside this function is caught and written as `status: "failed"` — it must never reject uncaught, since nothing awaits it at the HTTP layer. |

### New: `analysisRepository.cancelRun`

| Function | Input | Output | Notes |
|---|---|---|---|
| `cancelRun` | `runId`, `userId` | `AnalysisRunRecord` | No-ops (returns current state unchanged) if already terminal. Otherwise sets `cancelRequestedAt`, and if `backendPid` is currently set, immediately issues `SELECT pg_cancel_backend($1)` on a separate pooled connection so an in-flight chunk's query is interrupted rather than waiting for the next between-chunk check. |

### New: `analysisRepository.discardResult`

| Function | Input | Output | Notes |
|---|---|---|---|
| `discardResult` | `runId`, `userId` | `AnalysisRunRecord` | Throws `ValidationError` if `resultLayerId` is already `null`. Otherwise deletes the `Layer` row (cascading its `Feature`s per the existing schema rule) inside a transaction, then sets `resultLayerId: null` on the run — the run row itself is retained (FR-031's "undo the result, not the history"). |

---

## `analysisOperations.ts` (extended)

Same non-Prisma-importing, pure-`Prisma.Sql`-builder role as 005 defined.
New builders added, one per new `operationType`, following research.md
Decision 7's function table:

| Export (representative, new) | PostGIS function(s) |
|---|---|
| `buildSpatialPredicateSql(predicate, aGeom, bGeom)` | Touches/Crosses/Overlaps (Intersects/Within/Contains already existed via `spatialJoin`) |
| `buildSimplifySql(geom, tolerance)` | `ST_SimplifyPreserveTopology` |
| `buildSmoothSql(geom)` | `ST_ChaikinSmoothing` |
| `buildMultipartConversionSql(direction, geom)` | `ST_Dump` (to singlepart) / `ST_Collect` + `ST_Multi` (to multipart) |
| `buildRepairGeometrySql(geom)` | `ST_IsValid` gate + `ST_MakeValid` |
| `buildSymmetricalDifferenceSql(aGeom, bGeom)` | `ST_SymDifference` |
| `buildStatisticsSql(statType, geomColumn)` | `COUNT`/`ST_Area`/`ST_Length`/`ST_Envelope`/`ST_Centroid`/`ST_ConvexHull`/`ST_Extent` aggregates |
| `buildChunkPageSql(layerId, afterId, pageSize)` | Keyset-paginated feature page for chunked execution (Decision 5) — not operation-specific, shared by every chunked builder |

---

## `analysisPresetRepository.ts` (new)

| Function | Input | Output | Notes |
|---|---|---|---|
| `listPresetsForProject` | `projectId`, `userId` | `AnalysisPresetRecord[]` | Membership-scoped (any project member reads all presets in the project, matching the spec's "offered as a quick-start option" for the whole team) |
| `createPreset` | `projectId`, `userId`, `{ name, operationType, parameters }` | `AnalysisPresetRecord` | Throws `DuplicateNameError` on a `(projectId, name)` collision, mirroring `layerRepository.createLayer`'s exact pattern |
| `deletePreset` | `presetId`, `userId` | `void` | Throws `ForbiddenError` unless `userId` is the preset's creator or the project's Owner |

## `measurementRepository.ts` (new)

| Function | Input | Output | Notes |
|---|---|---|---|
| `saveMeasurement` | `projectId`, `userId`, `{ measurementType, geometry, label }` | `MeasurementHistoryRecord` | Runs `ST_IsValid` + the matching PostGIS recomputation (`ST_Length`/`ST_Area`/`ST_Azimuth`/`ST_Distance`) against the submitted geometry before insert (research.md Decision 8) — never persists a client-supplied `value` directly |
| `listMeasurementsForProject` | `projectId`, `userId`, `params: { cursor?, limit? }` | `{ measurements: MeasurementHistoryRecord[]; nextCursor: string \| null }` | Same keyset-pagination shape as `listAnalysisRunsForProject` |
| `deleteMeasurement` | `measurementId`, `userId` | `void` | Creator-or-Owner only, same rule as preset delete |

## `exportLogRepository.ts` (new)

| Function | Input | Output | Notes |
|---|---|---|---|
| `logExport` | `projectId`, `userId`, `{ sourceAnalysisRunId?, sourceLayerId?, format, status, featureCount?, errorMessage? }` | `ExportJobRecord` | Pure insert — no execution, no status transition (research.md Decision 10, revised); validates at most one of the two `source*` fields is set |
| `listExportsForProject` | `projectId`, `userId`, `params: { cursor?, limit? }` | `{ exports: ExportJobRecord[]; nextCursor: string \| null }` | Same shape as the other two history listings |

---

## Cross-cutting rules (unchanged from 005, reaffirmed)

- No repository function in this feature accepts a raw, unvalidated
  request body — every Route Handler Zod-parses first.
- No file other than `analysisRepository.ts`, `analysisPresetRepository.ts`,
  `measurementRepository.ts`, and `exportLogRepository.ts` imports
  `@prisma/client`/`prismaClient` for this feature's concerns
  (Constitution Principle I).
- Every function that resolves a project/layer/run scopes its query
  through the caller's project membership (`assertProjectRole`), not a bare
  `ownerId` equality check, per research.md Decision 3 — this is the one
  systematic change from 005's original convention, applied consistently
  across every function in this file, old and new.
