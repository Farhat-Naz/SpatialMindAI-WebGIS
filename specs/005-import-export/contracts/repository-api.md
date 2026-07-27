# Repository API Contracts: GIS Import & Export (005-import-export)

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md) | **Date**: 2026-07-27

Repositories live in `src/server/repositories/` and are the **only** modules besides Route
Handlers permitted to touch the database (Constitution Principle I, as established and practiced
by 003-database-foundation — every existing repository imports `prismaClient` directly). Nothing
under `src/features/` may import `@prisma/client`.

Conventions carried over unchanged from `analysisRepository.ts` / `exportLogRepository.ts`:

- Every exported function takes `userId` and calls `assertProjectRole(projectId, userId, minRole)`
  **first**, before any read or write.
- Errors are thrown as the shared classes (`NotFoundError`, `ForbiddenError`, `ConflictError`,
  `ValidationError`) — never as HTTP responses.
- Raw SQL uses only Prisma's parameterized `$queryRaw` / `$executeRaw` tagged templates or
  `Prisma.sql` composition. **No string concatenation** (Constitution Principle III).
- Each function returns a plain `*Record` shape, never a raw Prisma row, so the route layer never
  leaks column names or `Unsupported` geometry handles.

---

## New file: `src/server/repositories/importJobRepository.ts`

### Types

```ts
export type ImportSourceFormat = "geojson" | "shapefile" | "kml" | "kmz" | "csv"
export type ImportMode = "strict" | "lenient"
export type ImportStatus = "running" | "succeeded" | "failed" | "cancelled" | "rolled_back"

export interface ImportJobRecord {
  id: string
  projectId: string
  userId: string
  targetLayerId: string | null      // null once the layer is deleted (FR-079)
  targetLayerName: string           // snapshot, always readable
  sourceFormat: ImportSourceFormat
  fileName: string
  fileSizeBytes: number
  mimeType: string | null
  fileHash: string | null
  sourceCrs: string
  customCrsDefinition: string | null
  mode: ImportMode
  columnMapping: unknown | null
  status: ImportStatus
  totalFeatures: number | null
  importedCount: number
  rejectedCount: number
  duplicateCount: number
  repairedCount: number
  chunksCommitted: number
  errorMessage: string | null
  cancelRequestedAt: Date | null
  heartbeatAt: Date | null
  startedAt: Date
  completedAt: Date | null
  createdAt: Date
}
```

### `createImportJob`

```ts
export async function createImportJob(
  layerId: string,
  userId: string,
  input: CreateImportJobInput,
): Promise<ImportJobRecord>
```

- Resolves the layer's `projectId`, then `assertProjectRole(projectId, userId, "Editor")`.
- `NotFoundError` if the layer does not exist or the caller has no access (non-disclosure).
- Snapshots `layer.name` into `targetLayerName`.
- Persists up to `IMPORT_MAX_PERSISTED_ISSUES` (1,000) preflight issues via one `createMany`;
  seeds `rejectedCount` / `duplicateCount` / `repairedCount` from `preflightCounts`, which stay
  exact regardless of the cap (research.md Decision 16).
- Validates `sourceCrs`: `ValidationError` if `"CUSTOM"` without a `customCrsDefinition`, or if a
  supplied `EPSG:` code has no `spatial_ref_sys` row.
- Returns the row already in `status: "running"`.

### `commitImportChunk` — the performance-critical path

```ts
export interface ImportChunkFeature {
  sourcePosition: number
  geometry: unknown            // raw GeoJSON, in the job's SOURCE CRS
  attributes: { key: string; value: string }[]
}

export interface ImportChunkResult {
  chunkIndex: number
  committed: number
  rejected: { sourcePosition: number; category: string; message: string }[]
  job: Pick<ImportJobRecord, "importedCount" | "rejectedCount" | "duplicateCount" | "status">
}

export async function commitImportChunk(
  importJobId: string,
  userId: string,
  chunkIndex: number,
  features: ImportChunkFeature[],
): Promise<ImportChunkResult>
```

**Guards, in order:**

1. `assertProjectRole(job.projectId, userId, "Editor")`.
2. `ConflictError` if `job.cancelRequestedAt !== null` — the server-side half of cancellation
   (research.md Decision 13).
3. `ConflictError` if `job.status !== "running"`.
4. **Idempotency**: `chunkIndex <= job.chunksCommitted` returns the recorded result without
   re-inserting (research.md Decision 3).

**Execution — four statements per chunk, not three per feature** (research.md Decision 5):

```
1. INSERT … SELECT … FROM unnest($ids::text[], $geoms::text[])
     geometry: ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(v.geom), :srid), 4326)
     WHERE    ST_IsValid(ST_GeomFromGeoJSON(v.geom))
       AND    NOT EXISTS (duplicate probe, below)
     RETURNING id
2. featureAttribute.createMany(...)          — only for ids that came back
3. importJob.update(...)                     — counters, chunksCommitted, heartbeatAt
4. importIssue.createMany(...)               — rejections, subject to the 1,000 cap
```

All four run inside one `prismaClient.$transaction`, so a chunk is atomic: it either lands whole
or not at all. Chunks are independent of each other by design — that is what makes cancellation
leave a well-defined, countable amount of data behind.

**Rejection derivation**: `inputIds − RETURNING ids` is exactly the set PostGIS refused. Those few
ids are re-probed with a single `ST_IsValid` + `ST_IsValidReason` query to attribute each one to
`invalid_topology` or `duplicate_in_layer` (running the expensive reason function only on actual
failures, never on the whole chunk).

**Duplicate probe** (research.md Decision 8) — bbox-narrowed by the existing GiST index, then
confirmed by `ST_OrderingEquals` plus an attribute-set match:

```sql
NOT EXISTS (
  SELECT 1 FROM "Feature" f2
  WHERE f2."layerId" = :layerId
    AND f2.geometry && ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(v.geom), :srid), 4326)
    AND ST_OrderingEquals(f2.geometry, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(v.geom), :srid), 4326))
    AND NOT EXISTS ( /* attribute-set difference against FeatureAttribute */ )
)
```

**Custom CRS**: when `job.customCrsDefinition` is set, `ST_Transform(geom, :proj4Text)` is used in
place of the SRID form — PostGIS accepts a proj4 text target directly, so no catalog entry is
needed (research.md Decision 4).

**`repairedCount`**: ring-closure repairs happen in the client's preflight (FR-053) and arrive
already-closed. The counter is seeded at job creation, not incremented here.

### `completeImportJob`

```ts
export async function completeImportJob(
  importJobId: string, userId: string,
  outcome: "succeeded" | "failed", errorMessage?: string,
): Promise<ImportJobRecord>
```

`Editor`. `ConflictError` if already terminal. Sets `completedAt`, `status`, and `errorMessage`.

### `cancelImportJob`

```ts
export async function cancelImportJob(importJobId: string, userId: string): Promise<ImportJobRecord>
```

`Editor`. Sets `cancelRequestedAt` and `status: "cancelled"`. **No-op success** on an
already-terminal job — deliberately mirroring `analysisRepository.cancelRun`, whose first action is
`if (["succeeded","failed","cancelled"].includes(run.status)) return toRecord(run)`.

No `pg_cancel_backend`: the longest statement here is a single chunk insert, so a chunk-boundary
check meets SC-004's 2-second target without aborting a partially-applied transaction
(research.md Decision 13).

### `rollbackImportJob`

```ts
export async function rollbackImportJob(
  importJobId: string, userId: string,
): Promise<{ job: ImportJobRecord; deletedFeatureCount: number }>
```

`Editor`. `ConflictError` if already `rolled_back`. In one transaction:

```sql
DELETE FROM "Feature" WHERE "importJobId" = :importJobId    -- index-backed (FR-072)
```

`FeatureAttribute` and `FeatureStyle` cascade via their existing foreign keys. Concurrent users'
features in the same layer are untouched, because the predicate is row-level provenance rather
than a time window (research.md Decision 14). Then sets `status: "rolled_back"`.

### `getImportJobById`

```ts
export async function getImportJobById(importJobId: string, userId: string): Promise<ImportJobRecord | null>
```

`Viewer`. Applies the abandoned-job sweep before returning (see `sweepAbandonedJobs`).

### `listImportsForProject`

```ts
export async function listImportsForProject(
  projectId: string, userId: string,
  params: { cursor?: string; limit?: number; status?: ImportStatus },
): Promise<{ imports: ImportJobRecord[]; nextCursor: string | null }>
```

`Viewer` — FR-080's "view-only members can read history." Cursor-paginated, newest first,
`DEFAULT_LIMIT = 20` / `MAX_LIMIT = 100`, matching `listExportsForProject` exactly. Runs the
abandoned-job sweep first.

### `listIssuesForJob`

```ts
export async function listIssuesForJob(
  importJobId: string, userId: string,
  params: { cursor?: string; limit?: number },
): Promise<{ issues: ImportIssueRecord[]; nextCursor: string | null; totalPersisted: number; truncated: boolean }>
```

`Viewer`. Ordered by `sourcePosition` via `[importJobId, sourcePosition]`. `truncated` is
`totalPersisted >= IMPORT_MAX_PERSISTED_ISSUES`, which is how the UI states honestly that history
holds the first 1,000 of a larger set (research.md Decision 16).

### `sweepAbandonedJobs` (module-private)

```ts
async function sweepAbandonedJobs(projectId: string): Promise<void>
```

One `updateMany`: `status: "running"` **and** `heartbeatAt < now − 5 min` → `status: "failed"`,
`errorMessage: "The import was interrupted before it finished."` Called at the top of
`getImportJobById` and `listImportsForProject` — reading history is the only moment anyone can
observe a stale job, so it is the correct moment to resolve one (FR-074, research.md Decision 17).
No cron, no scheduler.

---

## Modified file: `src/server/repositories/exportLogRepository.ts`

**Additive only.** `logExport` and `listExportsForProject` keep their signatures; every existing
caller (007's `useExportResult`) compiles and behaves unchanged.

```diff
- export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml"
+ export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml" | "pdf"
+ export type ExportScope  = "selection" | "layer" | "project"

  export interface LogExportInput {
    sourceAnalysisRunId?: string | null
    sourceLayerId?: string | null
    format: ExportFormat
    status: ExportOutcome
    featureCount?: number | null
    errorMessage?: string | null
+   scope?: ExportScope | null        // defaults to "layer" — what every pre-existing row was
+   outputCrs?: string | null
+   layerCount?: number | null
  }
```

The existing "at most one of `sourceAnalysisRunId` / `sourceLayerId`" `ValidationError` is
retained, plus one rule: `scope === "project"` must carry neither source id.

`assertProjectRole(projectId, userId, "Editor")` on write and `"Viewer"` on read are already in
place and unchanged.

---

## Unchanged: `src/server/repositories/featureRepository.ts`

**This file is not modified.** In particular `importFeatures` keeps its per-feature loop and its
all-or-nothing transaction semantics, because Map Editing's small-file import path depends on
exactly that behavior and its tests assert it (research.md Decision 5).

The new set-based chunk insert lives in `importJobRepository.commitImportChunk`. The two paths
share the schema and the `propertiesToAttributes` flattening rule, not the write code.

`listFeaturesForLayer` is likewise untouched — it is the read path for every export scope, and
output-CRS transformation happens client-side (research.md Decision 4).

---

## Constants

```ts
// src/server/repositories/importJobRepository.ts
const IMPORT_MAX_PERSISTED_ISSUES = 1000   // research.md Decision 16
const ABANDONED_JOB_THRESHOLD_MS  = 5 * 60 * 1000
const DEFAULT_LIMIT = 20
const MAX_LIMIT     = 100

// src/shared/contracts/importChunk.schema.ts  (shared with the client)
export const IMPORT_CHUNK_MAX_FEATURES = 1000
export const IMPORT_CHUNK_MAX_BYTES    = 8 * 1024 * 1024
```

`IMPORT_MAX_FILE_BYTES` (default 50 MB) is read from the environment and exported from
`src/server/config/` alongside the platform's other tunables, so an operator can raise it per
environment without a code change (spec Assumptions).

---

## Repository test matrix (Constitution Principle VII)

Run against the real ephemeral PostGIS database, skip-if-unavailable — the pattern
`src/server/repositories/__tests__/` already uses.

| Function | Cases |
|---|---|
| `createImportJob` | Editor ok; Viewer → `Forbidden`; unknown layer → `NotFound`; layer in another project → `NotFound`; `CUSTOM` without definition → `Validation`; unknown EPSG → `Validation`; 1,500 preflight issues → 1,000 persisted, counts exact |
| `commitImportChunk` | Happy path inserts + attributes; `ST_IsValid` rejection reported not thrown; existing-layer duplicate excluded; in-CRS transform lands at the right coordinates; **idempotent replay** commits nothing new; post-cancel → `Conflict`; terminal job → `Conflict`; over-1,000 features → `Validation`; custom proj4 CRS transforms correctly |
| `completeImportJob` | `succeeded`; `failed` with message; double-complete → `Conflict` |
| `cancelImportJob` | Running → cancelled; already terminal → no-op success; Viewer → `Forbidden` |
| `rollbackImportJob` | Deletes exactly this job's features; **a concurrently-added feature in the same layer survives**; attributes cascade; double-rollback → `Conflict` |
| `getImportJobById` / `listImportsForProject` | Newest-first order; cursor paging neither skips nor duplicates; `status` filter; Viewer may read; deleted layer → `targetLayerId: null` with `targetLayerName` intact; **stale running job swept to `failed`** |
| `listIssuesForJob` | `sourcePosition` order; paging; `truncated` true at the cap |
| `logExport` *(existing, extended)* | `pdf` format accepted; each `scope` accepted; `scope: "project"` with a source id → `Validation`; **every pre-existing call signature still passes** |

The two cases that matter most are marked in bold: idempotent chunk replay (network retries are
routine at 100 chunks) and rollback isolation under concurrency (the spec's headline correctness
promise, SC-011).
