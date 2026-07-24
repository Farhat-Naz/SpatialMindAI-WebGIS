# Research: Spatial Analysis Toolset (007)

**Input**: `specs/007-spatial-analysis/spec.md`

**Context**: This feature ships into a codebase that already contains a
partially-implemented, closely related feature —
`specs/005-spatial-analysis-geoprocessing/` — which added the `AnalysisRun`
Prisma model, `analysisRepository.ts`/`analysisOperations.ts`, the
`analysis.schema.ts` Zod contracts, and two Route Handlers
(`/api/analysis/:runId`, `/api/analysis/:runId/rerun`), plus the empty
`src/features/analysis/` client module shell. It also ships alongside
`specs/006-collaboration/` (fully specced/planned, not yet implemented),
which introduces project membership (`ProjectMember`, roles Owner/Editor/
Viewer, `assertProjectRole`) and an append-only `Activity` audit model. Every
decision below is made in light of both.

---

## Decision 1: Extend `AnalysisRun`; do not create parallel `AnalysisJob`/`AnalysisHistory`/`AnalysisResult` tables

**Decision**: The spec's Key Entities ("Analysis Run," "Analysis Result,"
"Analysis History Entry") map onto **one extended `AnalysisRun` table**, the
same consolidation 005 already chose (its research.md Decision 2) — not
three separate tables. `AnalysisRun` gains the columns needed for real
background-job semantics (Decision 7 below) but keeps serving as the single
row that *is* the job, *is* the result reference, and *is* the history
entry, viewed through different queries.

**Rationale**: 005's Decision 2 already established this pattern in a
migration that exists in the database today (`20260723040000_add_analysis_run`).
Introducing separate `AnalysisJob`/`AnalysisHistory`/`AnalysisResult` tables
now would (a) directly contradict "reuse existing architecture," (b)
require a data migration reconciling two overlapping schemas for what is
conceptually one run's lifecycle, and (c) violate Constitution Principle I's
spirit of one clear owning table per concern. `GeometryOperation` (US5) and
`AnalysisStatistics` (US6) likewise need no new table: every one of their
operations (Simplify, Smooth, Split, Merge, Dissolve, Multipart↔Singlepart,
Repair Geometry, feature count, total/average area/length, density,
bounding box, centroid, convex hull, extent) is simply a new
`operationType` value on the existing `AnalysisRun`/`analysisOperations.ts`
pattern, exactly like `buffer` or `centroid` already are.

**Alternatives considered**: Separate tables per the plan prompt's literal
model list (rejected — duplicates 005's already-shipped design and forces
an awkward "which table is authoritative" reconciliation with no
correctness benefit); a fully generic polymorphic `Job` table shared by
every feature in the app (rejected — over-abstracted for a single feature,
not requested by any other feature today).

---

## Decision 2: `AnalysisPreset`, `MeasurementHistory`, and `ExportJob` are genuinely new tables

**Decision**: Three of the plan prompt's eight named models have no
existing counterpart and are added as new Prisma models:

- **`AnalysisPreset`** — a named, reusable `(operationType, parameters)`
  pair scoped to a user and project (US8/FR-021). No existing table
  represents "a saved parameter set," and it has a different lifecycle
  (created once, read many times, never tied to a specific run).
- **`MeasurementHistory`** — an explicit "save this measurement" record
  (US3). Measurements are synchronous, instant, client-computed-for-display
  readouts (Constitution Principle IV — transient UI feedback), structurally
  unlike `AnalysisRun` (no `inputLayerIds`, no background-job columns, no
  PostGIS-computed result to persist as authoritative — the persisted value
  is a user-confirmed snapshot of an already-displayed reading). Reusing
  `AnalysisRun` for this would bolt job/cancellation columns onto a row that
  never goes through the job pipeline.
- **`ExportJob`** — tracks an export request (US9) that can outlive a
  single request/response cycle for a large result (Shapefile packaging,
  large CSV/KML serialization). It references an `AnalysisRun` result *or*
  a layer directly (a user can export any layer, not only an analysis
  output), so it is not itself an `AnalysisRun` row.

**Rationale**: Each represents a distinct entity lifecycle not already
covered; creating them is additive, not a redesign of any existing model.

**Alternatives considered**: Folding presets into `AnalysisRun.parameters`
via a `isPreset` flag (rejected — a preset is never executed itself, so it
does not belong in the execution-history table); folding measurements into
`AnalysisRun` as another `operationType` (rejected per above — awkward
column fit, and measurements must remain queryable/exportable independent
of the analysis-job list per FR-008/FR-009).

---

## Decision 3: Reuse 006-collaboration's permission model, not 005's owner-only check

**Decision**: Every new/changed Route Handler in this feature authorizes
with the same shape 006-collaboration's plan already defines:
`getCurrentUser` → `assertProjectRole(projectId, userId, minimumRole)` →
rate limit → Zod validate → repository call → `handleRouteError`. Read
operations (running an analysis a Viewer should be able to see) require
**Viewer**; anything that writes new project data (every analysis
operation, since each creates an `AnalysisRun`/result) requires **Editor or
above**, matching 006's stated rule ("Editor-or-above data writes").

**Rationale**: The spec's FR-034/FR-035 ("only project members," "respect
permission levels") are exactly what 006-collaboration's role model exists
to answer, and per the "reuse existing architecture" instruction the
newest, most specific decision in the codebase for "who may act on a
project" wins over the older `ownerId`-only check 005 used (which predates
006 and was already flagged in 006's own plan as being broadened).

**Sequencing dependency (flagged, not resolved here)**: `assertProjectRole`
and `ProjectMember` do not exist in the codebase yet — 006-collaboration is
fully specced but 0% implemented at the time this plan is written. This
plan's tasks phase must either (a) land after 006's role infrastructure
merges, or (b) implement against 006's *already-designed* contract
(`src/server/auth/assertProjectRole.ts`, `membershipRepository.ts`) as part
of this feature if 006 has not yet merged when 007 implementation starts,
so the two features do not both redefine it. This is a Complexity Tracking
item (see plan.md) — no code in this feature falls back to the older
`ownerId`-only check.

**Alternatives considered**: Building 007 against 005's `ownerId`-only
`getProjectById(id, ownerId)` (rejected — contradicts the spec's own
membership-aware permission requirement and would need a second migration
the moment 006 lands); inventing a third, 007-specific permission check
(rejected — direct architecture duplication).

---

## Decision 4: Every analysis attempt is logged via 006's `Activity` model, not a new audit table

**Decision**: FR-036 ("every analysis attempt — successful, failed,
cancelled, and permission-denied — MUST be logged for audit purposes") is
satisfied by writing one `Activity` row (006-collaboration's append-only,
project-scoped audit entity) per attempt, in addition to the detailed
`AnalysisRun` row created for attempts that pass authorization.
Permission-denied attempts — which never reach far enough to create an
`AnalysisRun` — still write an `Activity` row so the denial itself is
audited.

**Rationale**: 006 already defines the project's one audit trail; adding a
second, analysis-specific audit table would fragment "what happened in this
project" across two places a reviewer has to check.

**Alternatives considered**: A dedicated `AnalysisAuditLog` table (rejected
— duplicates `Activity`'s exact shape and purpose); logging only to the
structured request logger (`shared/lib/logger.ts`) (rejected — that logger
is not project-scoped, queryable, or user-facing, and the spec requires the
log to support an audit review, not just ops-level tracing).

---

## Decision 5: Background execution via DB-backed job state + chunked, cancellable PostGIS queries — no message broker

**Decision**: Analysis jobs run as follows, introducing **no new
infrastructure dependency**:

1. `POST` creates an `AnalysisRun` row with `status: "queued"` and returns
   immediately (`202 Accepted` with the run id).
2. The same Node.js process continues execution *after* the response is
   sent, using the request-scoped async continuation the runtime already
   supports (Next.js Route Handlers may keep working after `return` as long
   as the returned `Promise` chain is not abandoned — this feature uses a
   fire-and-forget `void executeInBackground(...)` call guarded by
   structured error handling so a rejection can never become an unhandled
   crash). On Vercel this executes under Fluid Compute, which explicitly
   supports continued execution and graceful shutdown; on Railway/Docker/AWS
   (a long-lived Node process) the same code path runs identically with no
   platform-specific branch.
3. Execution updates `status → "running"`, `startedAt`, and `progress`
   (0–100) as it advances through chunks.
4. **Large inputs are processed in chunks** (keyset-paginated by feature
   `id`, page size tuned per operation) rather than one unbounded PostGIS
   statement, so: (a) progress can be reported between chunks, (b) a
   cancellation flag can be checked between chunks, and (c) memory stays
   bounded regardless of the 100,000-feature target.
5. **Cancellation** has two layers: between chunks, the loop checks
   `cancelRequestedAt` on the row (set instantly by `DELETE`/cancel
   endpoint) and stops before starting the next chunk; for a single
   long-running chunk already in flight, the repository additionally
   records the query's `pg_backend_pid()` and issues
   `SELECT pg_cancel_backend($pid)` from the connection pool when a cancel
   is requested, so a single expensive `ST_Union` does not have to finish
   before cancellation takes effect.
6. The client polls `GET /api/analysis/:runId` (React Query
   `refetchInterval`, active only while `status` is `queued`/`running`) for
   progress — the same polling shape already used for other "check current
   state" reads elsewhere in the app, so no streaming transport is required
   to be portable across all five deployment targets.

**Rationale**: The spec requires background execution, live progress, and
cancellation (FR-024, FR-027, FR-028, FR-029) at a scale (100k features, 100
concurrent analyses) that 005's synchronous-with-size-caps model (005
research.md Decision 7) cannot meet — this is a deliberate, spec-driven
scope increase specific to this feature, not a platform-wide redesign.
`pg_cancel_backend` is PostgreSQL's own built-in query-cancellation
mechanism (no extension, no new dependency); DB-backed polling requires
nothing beyond what Prisma/PostgreSQL already provide, and works
identically whether the process is a Vercel Function, a Railway/Docker
container, or an AWS ECS task — a message broker (SQS, Redis/BullMQ, Vercel
Queues) would only work cleanly on a subset of the five required deployment
targets and is a new dependency requiring a constitution amendment, which
is disproportionate for this feature's needs.

**Alternatives considered**: A real message queue / worker pool (rejected —
new infra dependency, platform-specific on serverless targets, and
disproportionate to "extend one existing table" scope); no chunking, one
big PostGIS statement per run relying only on `pg_cancel_backend` (rejected
— gives no progress feedback during a single very long statement, and risks
a single statement exceeding a platform request-execution ceiling on
serverless targets); Server-Sent Events instead of polling for progress
(considered viable and not excluded — noted in Decision 6 as an optional
enhancement, not the required baseline, because SSE connection-lifetime
behavior is not uniformly guaranteed across all five deployment targets the
way request/response polling is).

---

## Decision 6: SSE progress stream is optional/additive; polling is the guaranteed baseline

**Decision**: `GET /api/analysis/:runId` (poll) is the contract every
client path must support. A `GET /api/analysis/:runId/stream` (Server-Sent
Events, `text/event-stream`) endpoint MAY be added as a nicer-UX progress
channel for the Progress Dialog, falling back to polling automatically if
the stream errors or is unsupported by the hosting platform's request
timeout behavior.

**Rationale**: Keeps the feature fully functional on every one of the five
listed deployment targets even if one of them terminates long-lived
streaming responses more aggressively than others; SSE is additive sugar,
not a load-bearing requirement.

**Alternatives considered**: WebSockets (rejected — heavier, and
006-collaboration already reserves real-time transport decisions for
presence/live-cursor use cases; introducing a second real-time mechanism
for this feature alone is unjustified); SSE as the *only* mechanism
(rejected — breaks portability guarantee).

---

## Decision 7: Spatial predicates and overlay operations map directly to existing PostGIS functions

**Decision**: Every US2/US4 operation maps to one already-standard PostGIS
function, following 005's Decision 4 pattern exactly:

| Capability | PostGIS function(s) |
|---|---|
| Intersects / Within / Contains / Touches / Crosses / Overlaps | `ST_Intersects`, `ST_Within`, `ST_Contains`, `ST_Touches`, `ST_Crosses`, `ST_Overlaps` |
| Nearest / Distance | `ST_Distance`, `<->` KNN operator with a GiST index, `ST_DWithin` |
| Union | `ST_Union` |
| Intersection | `ST_Intersection` |
| Difference / Erase | `ST_Difference` |
| Clip | `ST_Intersection` against the clip boundary, re-attributed from the input only |
| Identity | `ST_Union`/`ST_Intersection` combination preserving all input geometry with overlay attributes appended |
| Symmetrical Difference | `ST_SymDifference` |
| Simplify | `ST_SimplifyPreserveTopology` (topology-safe by default over bare `ST_Simplify`) |
| Smooth | `ST_ChaikinSmoothing` (PostGIS ≥ 3.2) |
| Split | `ST_Split` |
| Merge | `ST_Collect` + `ST_Union` |
| Dissolve | `ST_Union` grouped by attribute |
| Multipart → Singlepart | `ST_Dump` |
| Singlepart → Multipart | `ST_Collect`/`ST_Multi` |
| Repair Geometry | `ST_MakeValid`, gated by `ST_IsValid` |
| Feature count/area/length/density/bbox/centroid/convex hull/extent | `COUNT(*)`, `ST_Area`, `ST_Length`, `ST_Envelope`, `ST_Centroid`, `ST_ConvexHull`, `ST_Extent` |
| Buffer | `ST_Buffer` (unchanged from 005) |

**Rationale**: Constitution Principle IV requires authoritative spatial
math to live in PostGIS; every function above is a stable, standard PostGIS
function with no new extension required beyond the `postgis` extension
already enabled.

**Alternatives considered**: Computing any of the above with Turf.js
server-side (rejected outright by Principle IV); a bespoke `ST_ChaikinSmoothing`
polyfill for older PostGIS (rejected — out of scope; deployment
documentation instead states the minimum PostGIS version required).

---

## Decision 8: Measurement tools compute live in the client (Leaflet/Turf.js); only "Save to History" persists via PostGIS

**Decision**: The interactive Measure tools (US3) compute distance, area,
perimeter, radius, bearing, azimuth, and coordinates client-side, live, as
the user draws — the same transient-UI-feedback carve-out Constitution
Principle IV already grants Leaflet/Turf.js. When (and only when) a user
explicitly saves a measurement, the save action re-computes the
authoritative value server-side via PostGIS (`ST_Length`, `ST_Area`,
`ST_Azimuth`, `ST_Distance` against the submitted geometry) before writing
the `MeasurementHistory` row — the persisted number is never simply the
client's live estimate taken on faith.

**Rationale**: Matches how the constitution already resolves this exact
tension (transient preview vs. persisted source of truth); avoids a
round-trip to the server on every mouse move (which would make live
measurement unusably laggy) while still guaranteeing FR-019-style
correctness for anything actually saved.

**Alternatives considered**: Server-round-trip on every drag point
(rejected — unacceptable latency for a live readout); trusting the
client's value at save time with no server recomputation (rejected —
violates Principle IV's "never the persisted source of truth" rule for
client math).

---

## Decision 9: Elevation/DEM/Slope/Aspect/Hillshade are catalog placeholders; Heatmap is the one implemented raster-adjacent capability

**Decision**: `AnalysisOperation` catalog entries exist for Heatmap,
Elevation/DEM, Slope, Aspect, and Hillshade (US7/FR-017), each carrying an
`implemented: boolean` flag. Only Heatmap (`implemented: true`) has a
working implementation, reusing 005's Decision 9 (client-side Turf.js
point-density rendering, no persisted raster data). The other four render
in the Toolbox with a clearly disabled/"coming soon" state and are
rejected server-side with a specific "not yet implemented" error if invoked
directly.

**Rationale**: Directly satisfies US7's explicit requirement to establish
the framework "without implementing heavy raster processing yet," and
avoids scope creep into genuine raster storage/processing (out of scope per
spec).

**Alternatives considered**: Adding an actual `RasterLayer` PostGIS
`raster`-typed column now (rejected — spec explicitly excludes heavy raster
processing this phase, and the `postgis_raster` extension is a materially
larger addition than this feature's scope justifies); omitting the
non-Heatmap entries from the Toolbox entirely until implemented (rejected —
the spec's Acceptance Scenario 1 for US7 explicitly requires them visible
in the Toolbox now).

---

## Decision 10: Export stays client-driven, extending `exportLayerAsGeoJson`'s existing pattern — no server-side export execution or file storage

**Decision**: The codebase's *only* existing export path
(`src/features/database/services/exportLayer.ts`'s `exportLayerAsGeoJson`)
is entirely client-side: it pages through the already-paginated Features
API and assembles the result in the browser, with no server route, no
generated-file storage, and no job concept at all. This feature extends
that exact pattern to all four formats rather than inventing server-side
export execution:

- **GeoJSON / CSV**: direct extensions of the existing pagination-and-
  assemble pattern; CSV is a row-per-feature flatten of the same paginated
  data.
- **KML**: a small client-side GeoJSON→KML serializer (hand-rolled; KML's
  subset needed for Point/LineString/Polygon/Multi* is simple XML, not
  worth a new dependency).
- **Shapefile**: the one format this codebase cannot already produce — the
  existing `shapefile` npm dependency only *reads* Shapefiles (used by
  `shapefileImport.ts`); writing the binary `.shp`/`.shx`/`.dbf` format
  needs a small, justified **new** client-side dependency (a
  browser-compatible Shapefile *writer*, e.g. `@mapbox/shp-write`), run
  through `@next/bundle-analyzer` per Constitution Principle V before
  merge, same as any other new dependency.
- For an `AnalysisRun` result: if it produced a `resultLayerId`, export
  reuses the same paginated Features API as any other layer; if it
  produced `resultData` only (e.g., Distance Matrix, a statistics
  summary), the export is a single already-in-memory JSON value with no
  pagination needed at all.
- Large exports (approaching the 100,000-feature scale) build the output
  as a streamed sequence of Blob parts (browser `Blob` from an array of
  chunks) rather than one giant concatenated string, and the client shows
  fetch-page progress (`"page 12 of 40"`) using the same paginated-fetch
  progress pattern already available from the cursor API — bounding memory
  without any server component.
- `ExportJob` (data-model.md) is a **lightweight, client-reported history
  record**, not an execution-managed job: the client does the work, then
  calls one endpoint to log `{ format, source, featureCount, outcome }`
  after the fact, purely for audit/history/troubleshooting parity with
  `AnalysisRun`'s history philosophy. Its `status` is always written
  already-terminal (`succeeded`/`failed`) — there is no `queued`/`running`
  phase to poll, because no server execution phase exists.

**Rationale**: Reuses the one export pattern that already exists exactly as
it already works, adds only the one genuinely-missing capability
(Shapefile *writing*) as a minimal new dependency, and avoids inventing
server-side file storage/serving infrastructure the codebase has never had
— a considerably smaller, better-justified footprint than the
background-job design this decision originally proposed.

**Alternatives considered**: Server-side export execution with generated-file
storage and a polling job lifecycle identical to `AnalysisRun`'s (the
original version of this decision — rejected on reflection: no file-storage
mechanism exists anywhere in this codebase to reuse, so building one is a
new subsystem, not a reuse, for a need the existing paginated-fetch-in-
browser pattern already meets); a server-side Route Handler that streams
a `ReadableStream` response for the file (rejected — still requires
building new server-side format serialization for GeoJSON/CSV/KML/Shapefile
that the client can already do today with data it already fetches, and
does not remove the need for the one new Shapefile-writing dependency
either way).

---

## Decision 11: Analysis history retention matches the project's own lifecycle; no independent TTL

**Decision**: `AnalysisRun`, `MeasurementHistory`, and `ExportJob` rows
cascade-delete with their `Project` (`onDelete: Cascade`), exactly like
every other project-scoped table. There is no separate time-based
auto-expiry of analysis history — the spec requires history to remain
available indefinitely for a project that still exists (US8 Acceptance
Scenario 4). `ExportJob`'s *generated file* (not its metadata row) does
expire on a short TTL, consistent with Decision 10's reuse of the existing
Import/Export file-serving retention window — the history record of
"an export happened" outlives the downloadable file itself.

**Rationale**: Matches every existing cascade rule in `schema.prisma`
(`Project → Layer → Feature → FeatureAttribute/FeatureStyle`); introducing
a bespoke auto-expiry for analysis history alone would be an unrequested,
inconsistent special case.

**Alternatives considered**: A rolling 90-day auto-purge of history rows
(rejected — not requested by the spec, and would make "re-run any past
analysis" unreliable without warning).

---

## Decision 12: Rate limiting and concurrency caps reuse `assertWriteRateLimit`, extended with a per-user concurrent-job cap

**Decision**: Every write endpoint continues to call
`assertWriteRateLimit(userId, bucket)` exactly as 004/005 already do,
adding an `"analysis:write"`-scoped bucket calibrated for job-creation
frequency (not per-chunk activity). Additionally, before creating a new
`AnalysisRun`/`ExportJob`, the repository checks the count of that user's
own `queued`/`running` rows against a small per-user concurrent-job cap
(a config constant), rejecting with a clear "too many analyses running"
message if exceeded — this is what keeps the platform-wide "100
simultaneous analyses" target (spec Performance) achievable without one
user's rapid-fire job creation starving everyone else, without needing a
global semaphore/lock service.

**Rationale**: Reuses the existing rate limiter verbatim (Constitution
Principle VI/Security) and adds the minimum additional check the new
background-job model needs, backed by a query against the same table
already being written to — no new subsystem.

**Alternatives considered**: A single global concurrency counter in a new
Redis/cache layer (rejected — new infra dependency disproportionate to the
need; a per-user DB count query is cheap at this scale and requires
nothing new).

---

## Decision 13: Coordinate systems, SRID, and geometry precision are unchanged from the established platform default

**Decision**: Every operation reads and writes `EPSG:4326` geometry via
`Feature.geometry`'s existing column type, exactly as 005 Decision 8
already established for Coordinate Conversion/CRS Transformation
(`ST_Transform`, never `proj4`, server-side). No operation in this feature
introduces a different default SRID, a new geometry precision model, or a
new coordinate system concept beyond what 003 (`003-database-foundation`)
already fixed platform-wide.

**Rationale**: Constitution Principle IV mandates one fixed default SRID;
changing or overriding it per-feature would be a platform-level
architecture change explicitly excluded from this feature's scope.

**Alternatives considered**: None seriously — this is a hard constitution
constraint, not a feature-level design choice.

---

## Decision 14: Undo of an analysis result is a targeted delete, not a generic undo stack

**Decision**: FR-031 ("undo a specific analysis result") is implemented as
a single, explicit "Discard result" action: it deletes the result
layer/features the run produced (if any) and marks the `AnalysisRun`
row's outcome accordingly, without touching any other project edit made
before or after it — matching the spec's Assumption that this is a
single-level, per-run undo, not a multi-step undo/redo stack.

**Rationale**: Matches the spec's own documented Assumption exactly; a
general undo/redo stack across unrelated edits does not exist anywhere
else in the codebase today and would be a platform-wide feature, not
something this analysis feature should introduce unilaterally.

**Alternatives considered**: A shared, cross-feature undo/redo stack
(rejected — far larger scope than this feature, not requested, and would
touch editing/styling/import-export code this feature must not redesign).

---

## Decision 15: Error handling reuses the existing five-code (plus `RATE_LIMITED`) `ApiErrorCode` vocabulary, extended with 006's planned `FORBIDDEN`

**Decision**: Every new Route Handler throws/maps to the existing
`ValidationError` → `INVALID_INPUT`, `NotFoundError` → `NOT_FOUND`,
`RateLimitedError` → `RATE_LIMITED` errors from `shared/errors/apiError.ts`,
plus the `ForbiddenError` → `403 FORBIDDEN` code that 006-collaboration's
plan already adds to that same file for role-insufficient requests. A
failed/cancelled `AnalysisRun` is not itself an HTTP error — job failure is
represented in the row's `status`/`errorMessage`, returned with `200`/`202`,
since the *request* to start or check a job succeeded even if the *job*
did not (spec Edge Cases: a failed job must be visible in history, not
just an error toast).

**Rationale**: Reuses the exact, already-adopted error contract shape; the
only addition (`FORBIDDEN`) is one 006 already plans to add for the same
reason, so 007 does not duplicate it under a different name.

**Alternatives considered**: A `DATABASE_ERROR`/`500` for a failed
analysis job (rejected — a chunk failing partway through a 100k-feature
Union is an expected, recoverable outcome the spec requires to be logged
and surfaced in history, not treated as an unexpected server fault).

---

## Summary of resolved unknowns

No `[NEEDS CLARIFICATION]` markers remain from the spec, and none were
introduced during planning — every open question above had a decision
directly supported by an existing, already-adopted pattern in this
codebase (005's operation/history model, 006's permission/audit model,
003/004's PostGIS-first principle) or by PostgreSQL's own built-in
capabilities, so no external dependency or platform-level redesign is
required to satisfy the spec.
