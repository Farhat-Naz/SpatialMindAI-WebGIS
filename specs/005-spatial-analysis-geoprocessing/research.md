# Research: Spatial Analysis & Geoprocessing

**Feature**: 005-spatial-analysis-geoprocessing
**Date**: 2026-07-23

All decisions below extend the patterns already established by
`003-database-foundation` and `004-map-editing-ui` (constitution v3.0.0). No
`NEEDS CLARIFICATION` markers remain in `spec.md` — this document records the
implementation-pattern decisions needed to move from spec to design. Where a
decision from 003/004 already settles a question for this feature, it is
referenced, not re-litigated.

---

## Decision 1: Repository/database-access boundary — extend, don't reinterpret

**Decision**: This feature adds exactly one new repository file,
`src/server/repositories/analysisRepository.ts`, following 003's Decision 2
precedent verbatim: only files under `src/server/` import `@prisma/client`;
Route Handlers are the only callers of `src/server/repositories/*`; no
repository is ever imported by client-side code.

**Rationale**: 003-database-foundation's research.md Decision 2 already
resolved the literal-vs-intended reading of Constitution Principle I for this
codebase ("client code must never reach the database directly" — not
literally "only files named `route.ts`"). Re-opening that question here would
be redesigning settled architecture, which this plan explicitly must not do.

**Alternatives considered**: None — re-litigating an already-decided
constitutional interpretation is out of scope for this plan.

---

## Decision 2: One `AnalysisRun` table covers Analysis Run, Batch Run, and History

**Decision**: Add a single new Prisma model, `AnalysisRun`, rather than three
separate tables for "Analysis Run," "Batch Run," and "Analysis History Entry"
(spec.md Key Entities). A Batch Run is a set of `AnalysisRun` rows sharing one
`batchId`; Analysis History is simply the existing per-project listing query
over `AnalysisRun` rows (`ORDER BY createdAt DESC`), not a separate ledger.

**Rationale**: The three spec-level entities describe one lifecycle from
three angles (a single run, a group of runs submitted together, and the
list view over past runs) — not three independent aggregates with their own
identity and relationships. A single table with a nullable `batchId`
self-grouping column satisfies FR-022–FR-026 without a join to a second or
third new table, and keeps the migration surface to one new model, matching
"every feature must integrate with the existing database architecture"
rather than introducing a parallel schema of its own.

**Alternatives considered**: A separate `BatchRun` parent table with
`AnalysisRun.batchRunId` as a required FK (rejected — adds a second new model
and a mandatory join for every batch read, for no behavior a nullable
self-grouping column doesn't already provide); a separate `AnalysisHistoryEntry`
table distinct from `AnalysisRun` (rejected — history is explicitly "a record
of one past Analysis Run," i.e., the same row, not new data — a second table
would just be a redundant, driftable copy of the first).

---

## Decision 3: One generic analysis endpoint family, not 22 per-operation routes

**Decision**: Expose analysis submission through one endpoint,
`POST /api/projects/:projectId/analysis`, whose Zod-validated request body is
a discriminated union keyed by `operationType` (22 variants, one per
capability in spec.md) — the same discriminated-union pattern
`geometry.schema.ts` already uses for the six supported geometry types.
Supporting endpoints: `GET /api/projects/:projectId/analysis` (history list,
paginated), `GET /api/analysis/:runId` (single run detail/status),
`POST /api/analysis/:runId/rerun`, `DELETE /api/analysis/:runId`, and
`POST /api/projects/:projectId/analysis/batch` (Batch Run submission — same
discriminated union, plus an array of independent input sets).

**Rationale**: Twenty-two dedicated routes would mean twenty-two
near-identical Route Handlers (auth → rate limit → validate → repository
call → error map) differing only in which repository function they call —
pure duplication the existing `/api/layers/:layerId/features` /
`/api/layers/:layerId/features/import` precedent (one shared endpoint for
both GeoJSON and Shapefile import, 004 Research Decision 19) already argues
against. A single endpoint with a discriminated-union body keeps the exact
same amount of Zod-enforced type safety per operation while adding one
Route Handler, not twenty-two.

**Alternatives considered**: One route per operation (rejected — the
duplication above); a single "generic geoprocessing" endpoint with an
untyped/`Record<string, unknown>` `parameters` field validated ad hoc inside
the repository (rejected — violates Constitution Principle II's requirement
that a Zod schema be the single source of truth for a request shape; a
discriminated union gives per-operation parameter validation without
sacrificing one shared endpoint).

---

## Decision 4: PostGIS function mapping per operation (all persisted results)

**Decision**: Every operation whose result is persisted (i.e., every one
except Heatmap, which is client-side-only per spec.md's Assumptions) is
computed via the PostGIS function below, executed through
`analysisRepository.ts`'s parameterized `$queryRaw`, never recomputed in
JavaScript as the system of record (Constitution Principle IV).

| Operation | PostGIS function(s) |
|---|---|
| Buffer | `ST_Buffer(geom, distance)` |
| Intersect | `ST_Intersection(a, b)`, filtered by `ST_Intersects` |
| Union | `ST_Union(geom)` (aggregate) |
| Difference | `ST_Difference(a, b)` |
| Clip | `ST_Intersection(input, clipBoundary)` (Clip is Intersect with a fixed second-operand role) |
| Dissolve | `ST_Union(geom)` grouped by the chosen attribute value |
| Merge | `UNION ALL` of the input layers' feature rows (no geometry function — concatenation only) |
| Split | `ST_Split(target, blade)` |
| Spatial Join | `ST_Intersects` / `ST_Within` / `ST_Contains` / `ST_DWithin` (nearest), chosen by the requested relationship |
| Point in Polygon | `ST_Within(point, polygon)` / `ST_Contains(polygon, point)` |
| Near Analysis | `ST_Distance` ordered `LIMIT 1` per source feature (nearest-neighbor), optionally `ST_DWithin` for a max-radius filter |
| Distance Matrix | `ST_Distance(a, b)` cross joined across both input sets |
| Area Calculation | `ST_Area(geog)` (cast to `geography` for a metric result at any latitude) |
| Length Calculation | `ST_Length(geog)` |
| Centroid | `ST_Centroid(geom)` |
| Convex Hull | `ST_ConvexHull(ST_Collect(geom))` |
| Bounding Box | `ST_Envelope(ST_Collect(geom))` |
| Density Analysis | `ST_Collect` + a fixed-cell grid built with `ST_SquareGrid`/`ST_HexagonGrid` (PostGIS ≥ 3.1) and a per-cell `ST_Contains`/count aggregate |
| Coordinate Conversion | `ST_Transform(ST_SetSRID(ST_MakePoint(x, y), sourceSrid), 4326)` (input boundary only, per spec.md Assumptions) |
| CRS Transformation | `ST_Transform(geom, targetSrid)` for display/export only — the stored `Feature.geometry` column is never rewritten in a non-4326 SRID (Constitution GIS Principle IV) |

**Rationale**: Matches Constitution Principle IV exactly ("any spatial
calculation whose result is persisted ... MUST be computed in PostGIS,
never recomputed in JavaScript") and reuses the exact validation precedent
`featureRepository.ts`'s `assertGeometryIsValid` already established —
every operation's output geometry is checked with `ST_IsValid` before
persistence, matching FR-028.

**Alternatives considered**: Computing any of the above with Turf.js
server-side (rejected outright by Constitution Principle IV — Turf.js is
approved only for transient client-side UI feedback, never as the system of
record); a dedicated geoprocessing microservice (rejected — "do not
redesign architecture"; PostGIS already provides every function needed
inside the existing single Postgres instance).

---

## Decision 5: Non-geometry results (Distance Matrix, Near Analysis) use `resultData Json`, not a new table

**Decision**: `AnalysisRun.resultData` (a `Json` column) holds tabular
results that are not a geometry layer — the Distance Matrix table and the
per-feature distance/nearest-id annotations Near Analysis produces. Results
that *are* new geometry go through the existing `createFeature`/layer
pattern and are referenced via `AnalysisRun.resultLayerId`.

**Rationale**: A Distance Matrix or Near Analysis result is a bounded table
(row count = input feature count, or its cross product, both already capped
by the same batch/size limits as every other operation — see Decision 7);
storing it as `Json` alongside the run's own row avoids a new table purely
for occasional tabular output, and is exported the same way other tabular
data already is in this platform (per spec.md's Assumptions).

**Alternatives considered**: A dedicated `DistanceMatrixResult` table with
one row per pair (rejected — unbounded row growth for large inputs, for
data that is read as a whole export, never queried row-by-row).

---

## Decision 6: A new `analysisStore` (Zustand) — not an extension of `editingStore` or `databaseStore`

**Decision**: Introduce `src/features/analysis/store/analysisStore.ts` — a
new store, sibling to `database`'s `databaseStore`/`editingStore`, owning
only: the currently selected operation type, in-progress parameter form
state, which input layer(s)/features are staged for the next submission,
and the currently-open Analysis History panel state. It does not duplicate
`databaseStore`'s project/layer/feature selection or `editingStore`'s
drawing/measurement/lock/clipboard state — it reads those via the
`database` feature's public barrel where needed.

**Rationale**: 004-map-editing-ui's own research (Decision 13/`editingStore`)
already established the precedent that a genuinely new client-only concern
gets its own store rather than being bolted onto an existing one, precisely
*to avoid* the kind of grab-bag single store the "no duplicate stores"
instruction is guarding against. Analysis workflow state (which operation is
being configured, with what parameters, before submission) is not project
selection and is not drawing/editing/measurement state — it is a third,
new concern. Adding it to either existing store would make that store
responsible for an unrelated feature's in-progress form state.

**Alternatives considered**: Extending `editingStore` (rejected — that
store's own doc comment scopes it to "active map editing/drawing/
measurement/lock/clipboard"; analysis parameter-form state is none of
those); no client-only state at all, with every analysis parameter held in
local component `useState` (rejected — the Analysis History panel and the
operation-picker toolbar are separate components that both need to read
"what operation is currently selected," which is exactly the cross-component
state Zustand exists to hold, per the constitution's State Management
standard).

---

## Decision 7: Synchronous execution with size limits; no job queue

**Decision**: Every Analysis Run (including each item of a Batch Run)
executes synchronously within its Route Handler's request/response cycle,
matching spec.md's Assumptions. Each operation enforces a maximum input
feature count (a per-operation constant, e.g. 5,000 features for
single-layer operations, 500×500 for Distance Matrix's cross product),
rejecting an oversized request up front with a clear message rather than
letting it run unbounded.

**Rationale**: Matches spec.md's explicit Assumption ("a persistent
background job queue ... is out of scope unless a future amendment
introduces one") and "do not redesign architecture" — no queue/worker
infrastructure exists in this codebase today, and introducing one is a
platform-level architecture change, not a feature-level one. Fixed input
caps keep every operation's worst-case cost bounded and give SC-001's
15-second budget a concrete enforcement mechanism instead of an
aspiration.

**Alternatives considered**: A background job queue with polling/webhook
completion (rejected per the above — out of scope, and “do not redesign
architecture”); no caps at all (rejected — an unbounded Distance Matrix or
Union across a very large layer could exceed reasonable request timeouts
with no defined failure mode).

---

## Decision 8: Coordinate Conversion / CRS Transformation reuse PostGIS `ST_Transform`, not `proj4`

**Decision**: Unlike 004-map-editing-ui's Shapefile import (which reprojects
with `proj4` client-side, *before* data ever reaches the server, per 004
Research Decision 19), this feature's Coordinate Conversion (FR-018) and CRS
Transformation (FR-019) operate on coordinates/layers that are already
inside the platform, so they use PostGIS's `ST_Transform`, run server-side
inside `analysisRepository.ts` like every other operation in Decision 4.

**Rationale**: `ST_Transform` is the authoritative, already-available
PostGIS mechanism for reprojecting geometry that already carries a known
SRID — reusing it needs no new dependency and is the correct tool per
Constitution Principle IV ("any spatial calculation whose result is
persisted or used to drive an authoritative ... result MUST be computed in
PostGIS"). `proj4` remains exactly where 004 left it (client-side Shapefile
pre-import only) — this feature does not touch or duplicate that path.

**Alternatives considered**: Reusing `proj4` server-side for this feature
too (rejected — `proj4` has no access to PostGIS's `spatial_ref_sys` table
or its already-validated SRID handling, and would be recomputing an
authoritative result in JavaScript, which Principle IV forbids for anything
beyond transient client preview).

---

## Decision 9: Heatmap stays client-side-only; Density Analysis is the persisted counterpart

**Decision**: Heatmap (FR-020) renders entirely client-side over data
already fetched into the existing `useFeatures` React Query cache — no new
Route Handler, no new persisted result — using the same "transient UI
feedback" carve-out 004's `MeasurementToolbar` already relies on for live
distance/area readouts. Density Analysis (FR-021) is a distinct, real
Analysis Run computed via PostGIS (Decision 4) whose grid/contour result can
be saved as a new layer.

**Rationale**: A heatmap is fundamentally a rendering technique over
already-loaded points, not a new spatial calculation — treating it as an
Analysis Run would mean persisting a "result" that is really just a
different draw style. Keeping it client-side matches spec.md's own
Assumption and Constitution Principle IV's explicit "transient UI feedback"
allowance.

**Alternatives considered**: Persisting heatmap parameters/output as an
Analysis Run (rejected — no authoritative spatial result exists to persist;
it would be storing a visualization preference, not an analysis outcome).
