# Data Model: Spatial Analysis Toolset (007)

**Prerequisite**: `research.md` (Decisions 1–2, 4–5, 9–11 drive this file
directly).

This feature modifies one existing model (`AnalysisRun`) and adds three new
ones (`AnalysisPreset`, `MeasurementHistory`, `ExportJob`). It does **not**
add `AnalysisJob`, `AnalysisHistory`, `AnalysisResult`, `GeometryOperation`,
or `AnalysisStatistics` as separate tables — research.md Decision 1
explains why each of those concepts is already covered by the extended
`AnalysisRun` table or by new `operationType` values on it.

---

## Entity: `AnalysisRun` (MODIFIED)

Already exists (005). Extended with background-job columns.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | unchanged |
| `projectId` | `String` (FK → `Project`, `onDelete: Cascade`) | unchanged |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | **NEW** — who ran it (FR-019, FR-036); 005 had no explicit runner column beyond the project owner implied by the old auth check. Required now that multiple project members (006) can each run analyses. |
| `operationType` | `String` | unchanged column type; value set expands (see "New operationType values" below) |
| `status` | `String` | **widened**: `"queued" \| "running" \| "succeeded" \| "failed" \| "cancelled"` (was `"succeeded" \| "failed"` only) |
| `progress` | `Int?` | **NEW** — 0–100, updated between chunks (research.md Decision 5); `null` until execution starts |
| `parameters` | `Json` | unchanged |
| `inputLayerIds` | `Json` | unchanged |
| `resultLayerId` | `String?` (FK → `Layer`, `onDelete: SetNull`) | unchanged |
| `resultData` | `Json?` | unchanged |
| `errorMessage` | `String?` | unchanged |
| `batchId` | `String?` | unchanged (005's Batch Run grouping, reused as-is) |
| `presetId` | `String?` (FK → `AnalysisPreset`, `onDelete: SetNull`) | **NEW** — set when the run was launched from a preset (US8) |
| `startedAt` | `DateTime?` | **NEW** — when execution actually began (may lag `createdAt` while `queued`) |
| `completedAt` | `DateTime?` | **NEW** — when it reached a terminal status |
| `executionTimeMs` | `Int?` | **NEW** — `completedAt - startedAt` in ms, persisted so history doesn't recompute it (FR-019) |
| `cancelRequestedAt` | `DateTime?` | **NEW** — set the instant a user requests cancellation; the execution loop polls this between chunks (research.md Decision 5) |
| `backendPid` | `Int?` | **NEW** — the PostgreSQL backend process id of the currently-executing chunk's connection, set only while `status = "running"` and cleared on completion; used for `pg_cancel_backend` |
| `createdAt` / `updatedAt` | `DateTime` | unchanged |

**New `operationType` values added** (beyond 005's existing 20): `erase`,
`identity`, `symmetricalDifference` (US4); `simplify`, `smoothGeometry`,
`multipartToSinglepart`, `singlepartToMultipart`, `repairGeometry` (US5 —
`split`, `merge`, `dissolve` already exist from 005 and are reused
unchanged); `selectByLocation`, `selectByAttribute`, `touches`, `crosses`,
`overlaps` (US2 — `spatialJoin`/`pointInPolygon`/`nearAnalysis` already
cover intersects/within/contains/nearest); `featureCount`, `totalLength`,
`averageLength`, `averageArea`, `extent` (US6 — `areaCalculation`,
`lengthCalculation`, `centroid`, `convexHull`, `boundingBox`,
`densityAnalysis` already exist).

**Relationships**: `Project 1──* AnalysisRun` (unchanged, cascade),
`Layer 0..1──* AnalysisRun.resultLayerId` (unchanged, set-null),
`User 1──* AnalysisRun` (**new**, cascade — a run has no meaning without
its project regardless, but cascading on user-delete matches every other
user-owned row's rule), `AnalysisPreset 0..1──* AnalysisRun` (**new**,
set-null — deleting a preset must not delete the history of runs launched
from it).

**Indexes** (existing `@@index([projectId, createdAt])`,
`@@index([batchId])` retained; new):
- `@@index([userId])` — "my analyses" queries and the per-user concurrent-job
  cap check (research.md Decision 12).
- `@@index([projectId, status])` — "show running/queued jobs for this
  project" (Progress Dialog, job-list polling) without scanning completed
  history.
- `@@index([presetId])` — "runs launched from this preset."

**Validation rules**:
- `progress` MUST be `null` or `0–100`.
- `cancelRequestedAt` MUST NOT be set once `status` is terminal
  (`succeeded`/`failed`/`cancelled`) — the repository layer enforces this,
  not a DB constraint, since Prisma has no conditional check constraint
  syntax; a raw SQL `CHECK` is added in the migration as defense in depth.
- Exactly one of `resultLayerId`/`resultData` is set on `succeeded` for a
  geometry-producing vs. statistics-producing operation respectively (unchanged
  from 005's existing behavior).

**Status lifecycle**:

```text
queued ──▶ running ──▶ succeeded
                    ├─▶ failed
                    └─▶ cancelled
```

`queued → running` on execution start; a fast operation may transition
through both before the creating request even returns, which is why the
client always treats `succeeded`/`failed` observed in the initial `202`
poll as valid terminal states, not an error.

---

## Entity: `AnalysisPreset` (NEW)

A named, reusable parameter set for one operation type (US8/FR-021).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `projectId` | `String` (FK → `Project`, `onDelete: Cascade`) | presets are project-scoped, matching every other saved configuration in the app |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | creator; presets are visible to all project members (read), editable only by their creator or an Owner (enforced in service layer, not schema) |
| `name` | `String` | |
| `operationType` | `String` | must be a known `operationType` value; validated by Zod against the same enum `analysisRequestSchema` uses |
| `parameters` | `Json` | the saved `parameters` shape for that `operationType` |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `Project 1──* AnalysisPreset`, `User 1──* AnalysisPreset`,
`AnalysisPreset 1──* AnalysisRun` (back-relation, see above).

**Indexes**: `@@unique([projectId, name])` (matches `Layer`'s existing
per-project name-uniqueness convention); `@@index([projectId, operationType])`
for "presets available for this tool" lookups.

**Cascade**: deleting the `Project` deletes its presets; deleting the
creating `User` deletes their presets (matches `Project.owner` cascade
precedent — no orphaned presets).

---

## Entity: `MeasurementHistory` (NEW)

An explicitly saved measurement reading (US3, FR-008 "save" action;
research.md Decision 8 — server-recomputed at save time, not a raw client
value).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `projectId` | `String` (FK → `Project`, `onDelete: Cascade`) | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | |
| `measurementType` | `String` | `"distance" \| "area" \| "perimeter" \| "radius" \| "bearing" \| "azimuth" \| "coordinates"` |
| `geometry` | `Unsupported("geometry(Geometry, 4326)")` | the measured shape/point, same PostGIS column pattern as `Feature.geometry`, so it can be re-displayed on the map |
| `value` | `Float?` | the measured scalar (distance/area/perimeter/radius/bearing/azimuth); `null` for a pure coordinates reading |
| `unit` | `String?` | unit the value is expressed in (e.g., `"meters"`, `"degrees"`) |
| `label` | `String?` | optional user-provided note |
| `createdAt` | `DateTime` | |

**Relationships**: `Project 1──* MeasurementHistory`,
`User 1──* MeasurementHistory`.

**Indexes**: `@@index([projectId, createdAt])` (history list, newest
first, same shape as `AnalysisRun`'s existing index).

**Validation rules**: `geometry` MUST pass `ST_IsValid` before insert
(Constitution Principle IV), enforced server-side exactly like
`featureRepository.ts` already does for `Feature.geometry`.

---

## Entity: `ExportJob` (NEW — lightweight history record, not an executed job)

A client-reported log entry for a completed export (US9; research.md
Decision 10, revised). The client does all export work itself (paginated
fetch + in-browser serialization); this row exists purely so export
activity has the same after-the-fact history/audit visibility as
`AnalysisRun`, not to drive or track execution. There is no server-side
file storage and no `queued`/`running` phase.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `projectId` | `String` (FK → `Project`, `onDelete: Cascade`) | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | |
| `sourceAnalysisRunId` | `String?` (FK → `AnalysisRun`, `onDelete: SetNull`) | set when the export was of an analysis result |
| `sourceLayerId` | `String?` (FK → `Layer`, `onDelete: SetNull`) | set when the export was of a layer directly (via `AnalysisRun.resultLayerId` or any other layer) |
| `format` | `String` | `"geojson" \| "shapefile" \| "csv" \| "kml"` |
| `status` | `String` | `"succeeded" \| "failed"` only — always written already-terminal, reported by the client after the export finishes or fails in-browser |
| `featureCount` | `Int?` | how many features were exported, for history display |
| `errorMessage` | `String?` | populated when the client reports a failed export (e.g., aborted, browser memory limit hit) |
| `createdAt` | `DateTime` | |

**Relationships**: `Project 1──* ExportJob`, `User 1──* ExportJob`,
`AnalysisRun 0..1──* ExportJob` (back-relation), `Layer 0..1──* ExportJob`
(back-relation).

**Indexes**: `@@index([projectId, createdAt])`.

**Validation rules**: at most one of `sourceAnalysisRunId`/`sourceLayerId`
is set (both may be unset for an export whose source has since been
deleted — the history entry is still retained, matching `AnalysisRun`'s
`SetNull` precedent for `resultLayerId`).

**Retention**: the row is retained indefinitely (matches research.md
Decision 11) — since no file is stored server-side, there is nothing to
expire; the exported file lives only as the browser's completed download.

---

## Back-relations added to existing models

```prisma
model Project {
  // ...existing fields unchanged...
  analysisPresets     AnalysisPreset[]
  measurementHistory  MeasurementHistory[]
  exportJobs          ExportJob[]
}

model Layer {
  // ...existing fields unchanged...
  sourceOfExportJobs  ExportJob[]
}

model User {
  // ...existing fields unchanged...
  analysisRuns        AnalysisRun[]
  analysisPresets     AnalysisPreset[]
  measurementHistory  MeasurementHistory[]
  exportJobs          ExportJob[]
}
```

No existing field on `Project`, `Layer`, `Feature`, `FeatureAttribute`,
`FeatureStyle`, or `User` is renamed, retyped, or removed. `AnalysisRun`'s
existing fields are all retained; only new nullable columns and one FK are
added, so the migration is purely additive (no backfill required beyond
defaulting existing rows' new `status` values, which already fit the
widened enum unchanged, since `"succeeded"`/`"failed"` remain valid).

---

## Migration notes

- One migration: widen `AnalysisRun` (add columns + `userId` FK — existing
  rows get `userId` backfilled from `Project.ownerId` since every prior run
  predates multi-member projects and was necessarily run by the owner) +
  create `AnalysisPreset`, `MeasurementHistory`, `ExportJob`.
- `userId` on `AnalysisRun` is added `NOT NULL` after backfill, matching
  Prisma's standard add-nullable-then-backfill-then-tighten migration shape
  for a non-empty existing table.
- Every new geometry column (`MeasurementHistory.geometry`) gets a GiST
  spatial index per Constitution Principle III, added via the same raw-SQL
  migration step `featureRepository.ts`'s original migration used for
  `Feature.geometry`.
