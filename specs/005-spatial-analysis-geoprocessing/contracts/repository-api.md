# Repository Contract: Spatial Analysis & Geoprocessing

**Feature**: 005-spatial-analysis-geoprocessing

Exactly one new repository file is added: `src/server/repositories/analysisRepository.ts`
(Research Decision 1). It is the only file in this feature that imports
`@prisma/client`/`prismaClient`. Its internal PostGIS SQL-fragment builders
(one per operation, per Research Decision 4's function table) live in a
sibling, non-Prisma-importing helper module,
`src/server/repositories/analysisOperations.ts`, which exports pure functions
returning `Prisma.Sql` fragments for `analysisRepository.ts` to execute —
kept separate from the repository file purely for readability given 22
operations, not as a second repository (it never opens a database
connection itself).

Every function below follows the exact ownership-scoping and error-throwing
conventions `featureRepository.ts` already established
(`getLayerScopedToOwner`, `NotFoundError`, `ValidationError`,
`assertGeometryIsValid` reused as-is for any operation that produces new
geometry).

## `analysisRepository.createAnalysisRun`

| Function | Input | Output | Notes |
|---|---|---|---|
| `createAnalysisRun` | `projectId`, `ownerId`, `input: { operationType, parameters, inputLayerIds }` | `AnalysisRunRecord` | Validates every `inputLayerIds` entry via `getLayerScopedToOwner`-equivalent project-scoped lookup; dispatches to the matching `analysisOperations.ts` builder for `operationType`; runs the builder's SQL plus (if geometry is produced) `assertGeometryIsValid` and the new `Layer`/`Feature` insert, all inside one `$transaction`; writes the resulting `AnalysisRun` row with `status: "succeeded"` or catches a validation failure and writes `status: "failed"` with `errorMessage` instead of throwing — the row is always created (spec.md's "even a failed run appears in history"), only pre-processing rejections (bad input shape, missing layer, oversized input) throw before any row is written. |

## `analysisRepository.createBatchRun`

| Function | Input | Output | Notes |
|---|---|---|---|
| `createBatchRun` | `projectId`, `ownerId`, `input: { operationType, parameters, items: { inputLayerIds }[] }` | `{ batchId: string; runs: AnalysisRunRecord[] }` | Generates one `batchId`, then calls `createAnalysisRun` once per item with that shared `batchId` — each item's own try/catch means one item's failure never aborts the others (FR-023), matching the endpoint contract in `api-contracts.md`. |

## `analysisRepository.getAnalysisRunById`

| Function | Input | Output | Notes |
|---|---|---|---|
| `getAnalysisRunById` | `runId`, `ownerId` | `AnalysisRunRecord \| null` | Scoped via a join through `Project.ownerId`, exactly like `getFeatureScopedToOwner`'s join through `Layer`/`Project`. |

## `analysisRepository.listAnalysisRunsForProject`

| Function | Input | Output | Notes |
|---|---|---|---|
| `listAnalysisRunsForProject` | `projectId`, `ownerId`, `params: { cursor?, limit?, batchId? }` | `{ runs: AnalysisRunRecord[]; nextCursor: string \| null }` | Cursor (keyset) pagination ordered by `createdAt DESC, id`, mirroring `listFeaturesForLayer`'s pattern exactly (Research Decision 2 — Analysis History is this query, not a separate table). |

## `analysisRepository.rerunAnalysis`

| Function | Input | Output | Notes |
|---|---|---|---|
| `rerunAnalysis` | `runId`, `ownerId` | `AnalysisRunRecord` | Reads the original run via `getAnalysisRunById`, throws `NotFoundError` if any of its original `inputLayerIds` no longer resolves (spec.md Edge Cases), otherwise calls `createAnalysisRun` again with the original `operationType`/`parameters`/`inputLayerIds` — a genuinely new row, original left untouched. |

## `analysisRepository.deleteAnalysisRun`

| Function | Input | Output | Notes |
|---|---|---|---|
| `deleteAnalysisRun` | `runId`, `ownerId` | `void` | Deletes only the `AnalysisRun` row; `resultLayerId`'s layer (if any) is never touched — matches the `onDelete: SetNull` relation, not `Cascade`, in `data-model.md`. |

## `analysisOperations.ts` (SQL-fragment builders, not a repository)

| Export (representative) | Input | Output |
|---|---|---|
| `buildBufferSql(geometryColumn, distance, unit)` | geometry reference + validated params | `Prisma.Sql` fragment wrapping `ST_Buffer` |
| `buildOverlaySql(operationType, aGeometryColumn, bGeometryColumn)` | operation + two geometry references | `Prisma.Sql` fragment for Intersect/Union/Difference/Clip (Research Decision 4 groups these under one builder, dispatched by `operationType`) |
| `buildMeasurementSql(operationType, geometryColumn)` | operation + geometry reference | `Prisma.Sql` fragment for Area/Length/Centroid/Convex Hull/Bounding Box |
| … (one builder per row of Research Decision 4's function table) | | |

**Cross-cutting rule**: no builder in `analysisOperations.ts` ever accepts a
raw, unvalidated request body — the Route Handler parses the full
discriminated-union body with the new
`analysisRequestSchema` (Zod) before `analysisRepository.ts` is called at
all, consistent with every other repository function's contract.
