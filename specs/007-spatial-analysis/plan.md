# Implementation Plan: Spatial Analysis Toolset

**Branch**: `007-spatial-analysis` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-spatial-analysis/spec.md`

---

## Summary

This plan covers the full 007 spec — all ten user stories (Buffer, Spatial
Query, Measurement, Overlay, Geometry Processing, Spatial Statistics,
Raster-Ready Framework, Analysis History, Export, and the dockable Analysis
Workspace UI) — by **extending** the partially-implemented
005-spatial-analysis-geoprocessing foundation rather than building a
parallel system, and by adopting 006-collaboration's membership/role model
for authorization rather than 005's older owner-only check.

Five findings shape this plan significantly:

1. **This feature extends one existing Prisma model** (`AnalysisRun`,
   widened with background-job columns) **and adds exactly three new
   ones** (`AnalysisPreset`, `MeasurementHistory`, `ExportJob`) — it does
   not create parallel `AnalysisJob`/`AnalysisHistory`/`AnalysisResult`
   tables, because 005 already consolidated that concern into
   `AnalysisRun` (research.md Decisions 1–2).
2. **This is the first analysis capability to need real background
   execution, progress, and cancellation.** 005 deliberately chose
   synchronous-only execution with input-size caps; this spec's explicit
   100,000-feature / 100-concurrent-job targets require going beyond that,
   via DB-backed job state, chunked PostGIS execution, and
   `pg_cancel_backend` — with no new infrastructure dependency (no queue,
   no broker), so it remains deployable identically across Vercel/Railway/
   Docker/AWS/Supabase (research.md Decision 5).
3. **Authorization switches from `ownerId`-only to
   006-collaboration's `assertProjectRole`.** 006 is fully specced but not
   yet implemented in this codebase; this plan's tasks either land after
   006 merges or implement 006's already-designed auth contract as a
   prerequisite (research.md Decision 3; Complexity Tracking below).
4. **Export stays entirely client-side**, extending the one export
   pattern that already exists (`exportLayerAsGeoJson`) to CSV/KML/
   Shapefile, adding exactly one new npm dependency (a Shapefile writer)
   rather than building server-side file generation/storage that has
   never existed in this codebase (research.md Decision 10).
5. **Every analysis attempt — including permission denials — is logged
   through 006-collaboration's `Activity` model**, not a new audit table
   (research.md Decision 4).

---

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged)

**Primary Dependencies**:
- next@16, react@19/react-dom@19, @tanstack/react-query@5, zustand@5, zod
  (existing — reused, no new state/validation library)
- shadcn/ui (existing — `Dialog`, `Tabs`, and the newly-added `Slider`/
  `ToggleGroup`/`AlertDialog`/`ContextMenu` primitives already staged in
  `src/shared/components/ui/` are used for the Progress Dialog, tool
  parameter forms, and the dockable panel's resize/collapse controls)
- PostGIS functions only for persisted spatial computation — extends
  005's function table with `ST_SimplifyPreserveTopology`,
  `ST_ChaikinSmoothing`, `ST_MakeValid`, `ST_SymDifference`, `ST_Dump`,
  `ST_Touches`/`ST_Crosses`/`ST_Overlaps`, `ST_Azimuth` (research.md
  Decision 7) — **no new npm dependency for any of this**
- Turf.js (existing) reused unmodified for Heatmap and for live
  client-side measurement math (research.md Decisions 8–9)
- **One new npm dependency**: a browser-compatible Shapefile *writer*
  (e.g. `@mapbox/shp-write`) — the existing `shapefile` package only
  reads. Justified in Complexity Tracking; must clear
  `@next/bundle-analyzer` per Constitution Principle V before merge.

**Storage**: `AnalysisRun` widened (new columns + `userId` FK, additive
migration with backfill); three new models
(`AnalysisPreset`, `MeasurementHistory`, `ExportJob`) — data-model.md. One
migration for this feature. No existing column removed or retyped.

**Testing**: Vitest + React Testing Library (unchanged). New/changed Route
Handlers tested against the real ephemeral PostGIS test database,
skip-if-unavailable, per 003/004/005's established pattern. New tiers for
this feature specifically: background-job lifecycle tests (queued → running
→ terminal, including a simulated cancellation) and a large-dataset
performance tier (Testing Strategy below).

**Target Platform**: Unchanged — Node.js runtime, single Postgres/PostGIS
instance; this feature's background-execution design is deliberately
runtime-portable (research.md Decision 5) across every deployment target
in Deployment Notes below.

**Project Type**: Web application — single Next.js app. Extends the
existing (currently empty-shell) `src/features/analysis/` module in place
— same internal structure `database`/`search`/`map` already use
(`components/`, `hooks/`, `services/`, `store/`, `types/`, `__tests__/`,
`index.ts`). Adds/modifies Route Handlers under `app/api/`. No existing
feature module outside `analysis` is modified except the two `apiError.ts`/
`assertProjectRole.ts` files this feature shares a dependency on with
006-collaboration (see Complexity Tracking).

**Performance Goals** (from spec Success Criteria):
- SC-001: core operation launch-to-configured in under 60 s of UI
  interaction (a UI-responsiveness target, not a query-time target).
- SC-002: 95% of operations on ≤100,000-feature datasets return a result or
  clear failure/cancellation with visible progress throughout.
- SC-003: 100 concurrent analysis jobs platform-wide without cross-job
  correctness impact.
- SC-004: 100% of runs (success/fail/cancel) fully recoverable in History.
- SC-006: 100% of permission-denied attempts blocked, zero project data
  created.
- SC-008: every exported format opens correctly in a standard external
  tool with no manual correction.

**Constraints**:
- No message broker/queue infrastructure — DB-backed job state + chunked
  execution only (research.md Decision 5).
- All persisted geometry remains EPSG:4326; no feature in this plan
  introduces a different SRID (research.md Decision 13).
- Heatmap remains the only implemented raster-adjacent capability;
  Elevation/DEM/Slope/Aspect/Hillshade are catalog placeholders only
  (research.md Decision 9).
- Export never stores a generated file server-side (research.md Decision
  10) — the browser is the only place a full export file exists.
- Undo of an analysis result is single-level (discard this run's output
  only), not a general undo/redo stack (research.md Decision 14).

**Scale/Scope**: One extended Prisma model, three new ones, two extended
+ nine new Route Handlers, three new small repository files (plus
extending the two existing ones), roughly 12–16 new UI components across
the dockable panel, and one new npm dependency.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design —
see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | All new/changed client code stays inside `src/features/analysis/`'s existing barrel; only `analysisRepository.ts` + 3 new sibling repository files import `@prisma/client` for this feature's concerns |
| II. Type Safety | ✅ PASS | `analysisRequestSchema`'s discriminated union extends (not replaces) 005's pattern; new `presetRequest.schema.ts`/`measurementRequest.schema.ts` follow the same Zod-first, no-`any` convention |
| III. Database | ✅ PASS | Additive migration only; every new geometry column (`MeasurementHistory.geometry`) gets a GiST index per Principle III; `prisma migrate dev` is the only schema-change path used |
| IV. GIS Principles | ✅ PASS | Every persisted spatial result (including all new operations) is computed via PostGIS (research.md Decision 7); live measurement math is the constitution's own transient-UI-feedback carve-out, with server recomputation before persistence (Decision 8); SRID stays fixed at 4326 (Decision 13) |
| V. Performance | ✅ PASS | The one new dependency (Shapefile writer) is client-side, export-path-only, and must clear bundle-analyzer before merge; heavy libraries remain dynamically imported with `ssr: false`, unchanged from existing convention |
| VI. Security | ✅ PASS | Every endpoint follows `getCurrentUser` → `assertProjectRole` → rate-limit → Zod-validate → scoped-repository-call → `handleRouteError`; every analysis attempt, including denials, is logged via 006's `Activity` model (Decision 4) |
| VII. Testing | ✅ PASS | Unit/store/hook/API/integration/accessibility tiers planned per user story, plus new background-job-lifecycle and large-dataset performance tiers (Testing Strategy) |
| VIII. Documentation | ✅ PASS | spec→plan→(tasks→implementation→tests→docs) lifecycle in progress; JSDoc required on every new exported function |
| IX. Git Workflow | ✅ PASS (process) | Standard workflow applies |
| X. Quality Gates | ✅ PASS | TypeScript/ESLint/tests/`next build` all gate merge; the one new dependency triggers a mandatory bundle-analyzer run before merge (Principle V) |

**One flagged, justified item — not a violation**: this feature's
authorization depends on 006-collaboration's not-yet-implemented
`assertProjectRole`/`ProjectMember`/`Activity` infrastructure. This is
recorded in Complexity Tracking below as a sequencing dependency, not a
principle violation — the constitution does not forbid one feature's
implementation depending on another's having landed first; it forbids
skipping the check entirely, which this plan does not do.

**No other violations.**

**Re-check after Phase 1 design**: Confirmed still PASS. `data-model.md`
and `contracts/` confirm the scope stays at one extended model, three new
ones, and one new npm dependency — no further deviation surfaced during
design.

---

## Project Structure

### Documentation (this feature)

```text
specs/007-spatial-analysis/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── api-contracts.md
│   ├── client-api.md
│   └── repository-api.md
└── tasks.md               # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root) — additions/changes only

```text
prisma/
└── schema.prisma                              # MODIFIED: AnalysisRun widened; + AnalysisPreset, MeasurementHistory, ExportJob

src/
├── server/
│   ├── auth/
│   │   └── assertProjectRole.ts                # REUSED from 006 (or implemented here first if 006 hasn't landed — Complexity Tracking)
│   └── repositories/
│       ├── analysisRepository.ts                # MODIFIED: +executeInBackground, +cancelRun, +discardResult, widened createAnalysisRun
│       ├── analysisOperations.ts                # MODIFIED: + new operationType SQL builders (research.md Decision 7)
│       ├── analysisPresetRepository.ts           # NEW
│       ├── measurementRepository.ts              # NEW
│       └── exportLogRepository.ts                # NEW
│
├── app/api/
│   ├── projects/[projectId]/
│   │   ├── analysis/route.ts                     # MODIFIED: 202 response, status filter
│   │   ├── analysis/presets/route.ts             # NEW
│   │   ├── measurements/route.ts                 # NEW
│   │   └── exports/route.ts                      # NEW
│   ├── analysis/[runId]/
│   │   ├── route.ts                              # MODIFIED: extended fields
│   │   ├── cancel/route.ts                       # NEW
│   │   ├── discard-result/route.ts               # NEW
│   │   └── stream/route.ts                       # NEW, optional/additive (SSE)
│   ├── analysis/presets/[presetId]/route.ts      # NEW
│   └── measurements/[measurementId]/route.ts     # NEW
│
├── shared/
│   ├── contracts/
│   │   ├── analysis.schema.ts                    # MODIFIED: new operationType variants
│   │   ├── presetRequest.schema.ts               # NEW
│   │   └── measurementRequest.schema.ts          # NEW
│   └── errors/apiError.ts                        # MODIFIED (shared with 006): + ForbiddenError/FORBIDDEN
│
└── features/analysis/                            # EXTENDED (005 left this as an empty shell)
    ├── components/
    │   ├── AnalysisPanel.tsx                     # NEW — dockable shell (US10)
    │   ├── AnalysisToolbox.tsx                   # NEW
    │   ├── OperationConfigForm.tsx                # NEW
    │   ├── ProgressDialog.tsx                     # NEW
    │   ├── ResultPanel.tsx                        # NEW
    │   ├── PropertyPanel.tsx                      # NEW
    │   ├── AnalysisSummary.tsx                    # NEW
    │   ├── HistoryPanel.tsx                        # NEW
    │   ├── PresetPicker.tsx                        # NEW
    │   └── MeasureToolbar.tsx                      # NEW
    ├── hooks/
    │   ├── useAnalysis.ts                          # NEW (005 never built this)
    │   ├── useAnalysisPresets.ts                    # NEW
    │   ├── useMeasurements.ts                       # NEW
    │   ├── useExportHistory.ts                      # NEW
    │   └── useAnalysisPanel.ts                       # NEW
    ├── services/
    │   ├── analysisService.ts                        # NEW (005 never built this)
    │   ├── exportService.ts                           # NEW
    │   ├── measurementService.ts                       # NEW
    │   └── queryKeys.ts                                # NEW
    ├── store/
    │   ├── analysisStore.ts                             # NEW (005 never built this)
    │   └── analysisPanelStore.ts                         # NEW
    ├── types/analysis.types.ts                           # MODIFIED: extended re-exports
    └── index.ts                                          # MODIFIED: extended public barrel

src/features/dashboard/components/DashboardLayout.tsx      # MODIFIED: mounts <AnalysisPanel /> alongside existing <RightSidebar />
```

**Structure Decision**: Everything client-side lands inside the existing
`src/features/analysis/` module (005's shell, never built out) — no new
top-level feature module. `DashboardLayout.tsx` gains exactly one new
mount point, following the same `col-start-3`-style dock slot pattern
`RightSidebar` already established, not a redesign of the shell's grid.
Server-side, this feature owns five repository files (two extended, three
new) and eleven Route Handler files (two modified, nine new), all under
the two resource families 005 already established plus two small new
sibling families (`analysis/presets`, `measurements`).

---

## Architecture

### Repository layer

`analysisRepository.ts` remains the single file owning `AnalysisRun`'s
lifecycle, now including its background-execution and cancellation
functions (contracts/repository-api.md). Three new, equally narrow
repository files each own exactly one new table
(`analysisPresetRepository.ts`, `measurementRepository.ts`,
`exportLogRepository.ts`) — no repository spans more than one primary
table, matching `featureRepository.ts`/`layerRepository.ts`'s existing
one-file-per-primary-concern convention.

### Service layer

Route Handlers call repositories directly (unchanged convention — this
codebase has no separate server-side "service" layer between Route
Handlers and repositories; "service" in this codebase's vocabulary refers
to the *client-side* `services/*.ts` files, per Constitution Principle I).
`src/features/analysis/services/` holds the client HTTP-wrapper services
(`analysisService.ts`) plus the two services that contain real client-side
logic by design: `exportService.ts` (file assembly) and
`measurementService.ts` (live Turf.js math) — both scoped narrowly to the
one concern the constitution already carves out for client-side geometry
work.

### Analysis engine

"Analysis engine" in this codebase's terms is `analysisOperations.ts` (the
per-operation `Prisma.Sql` builder module) plus the chunked-execution loop
in `analysisRepository.executeInBackground`. There is no separate engine
process or worker — the engine *is* this pair of files, executed inline in
the same Next.js runtime that received the request, per research.md
Decision 5's portability requirement.

### Route Handlers

Unchanged shape from every existing endpoint in the codebase:
`getCurrentUser` → `assertProjectRole`/`assertWriteRateLimit` → Zod parse
→ repository call → `handleRouteError`/`respond`. The one new endpoint
category, cancellation (`POST /api/analysis/:runId/cancel`), still fits
this exact shape — cancellation is a repository call like any other, not a
special case.

### React Query

One centralized `queryKeys.ts` per feature (existing convention), extended
with factories for presets/measurements/exports. Polling for job progress
uses React Query's own `refetchInterval` option on `useAnalysisRun`,
conditional on the currently-cached `status` — no custom polling mechanism
is introduced.

### Zustand

`analysisStore` (analysis-configuration-in-progress state) and the new
`analysisPanelStore` (dockable-panel chrome state) stay deliberately
separate, mirroring the existing `editingStore`/`databaseStore` split and
`dashboard`'s own `useSidebar` precedent for panel-open state (research.md
is silent on this specific split since it is a client-only UI concern, not
a spatial-analysis decision — documented here in Architecture instead).

### Component hierarchy

See contracts/client-api.md's tree. `AnalysisPanel` mounts once from
`DashboardLayout`, exactly where `RightSidebar` already mounts, and is the
single entry point into every other component in the tree.

### Shared utilities

No new `src/shared/` utility beyond the two new Zod contract files and the
`FORBIDDEN` error code addition (shared with, not duplicated from,
006-collaboration's plan for the same addition).

### Background execution

Covered in full by research.md Decision 5 and contracts/repository-api.md's
`executeInBackground`/`cancelRun`. Summarized: DB-backed `status`/
`progress` columns, chunked keyset-paginated execution, `pg_cancel_backend`
for immediate query-level cancellation, client polling via React Query as
the guaranteed-portable progress channel, with an optional SSE endpoint as
enhancement only.

### History management

Unchanged from 005's Decision 2 philosophy: History is a query
(`listAnalysisRunsForProject`, now filterable by `status`) over the same
table that *is* the job record, not a separately maintained log — extended
identically for `MeasurementHistory` and `ExportJob`'s own listing
functions.

---

## Database Changes

See data-model.md in full. Summary: one migration widening `AnalysisRun`
(9 new columns + 1 required FK with backfill) and creating
`AnalysisPreset`, `MeasurementHistory` (with a GiST-indexed geometry
column), and `ExportJob`. Cascade rules follow the existing
`Project → child` pattern throughout; no existing cascade rule changes.
Retention: indefinite, matching every other project-scoped table
(research.md Decision 11).

## React Query Flow

`useRunAnalysis` mutation → `POST` → cache the returned `run` immediately
under `queryKeys.analysisRun(id)` → if `status` is non-terminal,
`useAnalysisRun(id, { poll: true })` takes over with `refetchInterval`
until a terminal status is cached → on terminal `succeeded` with a
`resultLayerId`, invalidate `database`'s `queryKeys.layers(projectId)` so
the new layer appears in the Layers panel without a manual refresh —
identical invalidation shape to 005's original (unbuilt) contract, now
actually implemented.

## Zustand Flow

`AnalysisToolbox` selection → `analysisStore.setSelectedOperationType` →
`OperationConfigForm` reads/writes `analysisStore.draftParameters` →
submit calls `useRunAnalysis`, which on success sets
`analysisStore.activeRunId` so `ProgressDialog`/`ResultPanel` know which
run to display, independent of `analysisPanelStore`'s dock/tab state.

## Repository Layer

See contracts/repository-api.md in full for every function signature.

## Route Handlers

See contracts/api-contracts.md in full for every endpoint, request/response
shape, and error table.

---

## Background Processing

- **Job queue**: none — DB-backed `status`/`progress` on `AnalysisRun`;
  none needed for `ExportJob` (client-driven, no queue). See research.md
  Decision 5.
- **Progress updates**: written after each chunk completes; polled by the
  client via `refetchInterval`; an optional SSE stream mirrors the same
  data for a nicer UX without being load-bearing (Decision 6).
- **Cancellation**: `cancelRequestedAt` checked between chunks +
  `pg_cancel_backend` for the in-flight chunk (Decision 5).
- **Retry**: not automatic — a failed run is terminal
  (`status: "failed"`) and surfaced with `errorMessage`; the user-facing
  recovery path is **Re-run** (already-existing endpoint), which creates a
  fresh attempt deliberately, not a silent automatic retry that could mask
  a real data problem.
- **Timeout**: each chunk's PostGIS statement is bounded by Postgres's
  `statement_timeout` (a connection-level setting, already configurable in
  the existing `prismaClient.ts` connection string) — a chunk that exceeds
  it fails that run with a clear timeout `errorMessage`, rather than
  hanging indefinitely.
- **Failure recovery**: any thrown error inside `executeInBackground` is
  caught at the top level and written as `status: "failed"` — it can never
  propagate as an unhandled rejection, per contracts/repository-api.md.

## Performance

- Chunked, keyset-paginated execution (research.md Decision 5) keeps
  per-chunk memory and query cost bounded regardless of total input size,
  which is what makes the 100,000-feature target achievable without a
  worker pool.
- `@@index([projectId, status])` on `AnalysisRun` keeps "show running
  jobs" queries fast without scanning full history.
- The per-user concurrent-job cap (research.md Decision 12) is what makes
  "100 simultaneous analyses" platform-wide achievable without one user
  starving the rest — enforced by a cheap indexed count query, not a new
  subsystem.
- Large polygons/multipolygons: PostGIS's own GiST spatial indexes
  (already present on `Feature.geometry` since 003) bound overlay/query
  cost; no client-side geometry simplification is applied before sending
  data to PostGIS, since Principle IV requires the authoritative
  computation to happen there, not on a pre-simplified approximation.
- Streaming responses: not used for Route Handler responses (every
  response remains a bounded JSON `AnalysisRun`/list payload); "streaming"
  in this feature's scope is the client-side chunked export assembly
  (research.md Decision 10), not an HTTP streaming response format.
- Pagination: every history listing (`AnalysisRun`, `MeasurementHistory`,
  `ExportJob`) uses the same cursor/keyset pattern already established.
- Caching: React Query's existing per-feature query-key caching; no new
  server-side cache layer introduced.

## Security

- **Authorization**: `assertProjectRole` on every endpoint (research.md
  Decision 3); read = Viewer minimum, write (anything creating an
  `AnalysisRun`/preset/measurement) = Editor minimum, preset/measurement
  delete = creator-or-Owner.
- **Ownership**: unchanged `Project.ownerId` remains the source of truth
  for who the Owner is (006's existing design); this feature never
  introduces a second ownership concept.
- **Role permissions**: identical Owner/Editor/Viewer enforcement as every
  other 006-aligned endpoint — no analysis-specific role tier is invented.
- **Analysis logging**: every attempt (success/fail/cancel/denied) writes
  an `Activity` row (research.md Decision 4); denials are the one case
  that writes *only* the `Activity` row, since no `AnalysisRun` is created
  for a request that never passed authorization.
- **Input validation**: every request Zod-validated before any repository
  call, extending 005's discriminated-union pattern.
- **Rate limiting**: `assertWriteRateLimit`'s `analysis:write` bucket
  (reused from 005) plus the new per-user concurrent-job cap (Decision
  12) — two independent, complementary limits (burst-rate vs.
  concurrently-open).
- **Audit trail**: the combination of `AnalysisRun`'s detailed record and
  006's `Activity` feed together satisfy FR-036 in full.

## Testing Strategy

| Tier | Coverage |
|---|---|
| **Repository** | Every new/changed function in `analysisRepository.ts`, `analysisPresetRepository.ts`, `measurementRepository.ts`, `exportLogRepository.ts` — success, not-found, forbidden, and (for `AnalysisRun`) full status-transition paths, against the real PostGIS test database |
| **Route Handler (API)** | Every endpoint in api-contracts.md: success, validation failure, `403`, `404`, `429`, and (new) a background-job's `202`-then-poll-to-terminal flow |
| **Service** | `exportService.ts`'s per-format assembly logic (unit-testable independent of the network — feed it a fixed feature set, assert output shape per format); `measurementService.ts`'s Turf.js calculations against known geometries with known expected values |
| **Hook** | `useAnalysisRun`'s polling start/stop behavior around status transitions (mocked timers); every mutation hook's cache-invalidation targets |
| **Store** | `analysisStore` and `analysisPanelStore` actions/selectors |
| **Integration** | One full run-through per user story matching quickstart.md's ten sections, mounted within the app shell |
| **Performance** | A dedicated large-dataset tier: a 100,000-feature seeded layer exercising Buffer/Union/Simplify, asserting the operation completes via the background path with progress observed at least twice before a terminal status, and a 100-concurrent-job harness asserting no cross-job data corruption |
| **Accessibility** | `AnalysisPanel` and every dialog/panel within it against WCAG 2.2 AA (axe + RTL a11y assertions), keyboard-only run-through matching quickstart.md's US10 section |
| **Large dataset** | Folded into the Performance tier above — not a separate harness |

## Deployment Notes

| Target | Notes |
|---|---|
| **Vercel** | Runs under Fluid Compute; the fire-and-forget `executeInBackground` continuation is explicitly supported by Fluid Compute's graceful-shutdown/continued-execution model (session context). No Vercel-specific code path is required — the same function works unmodified. |
| **Railway** | Long-lived Node process — background execution runs identically to local dev, no special handling. |
| **Docker** | Same as Railway; the provided `docker-compose.test.yml` PostGIS service already used for testing extends directly to a production-shaped Postgres+PostGIS container. |
| **AWS** | Whether ECS/Fargate (long-lived process, identical to Railway/Docker) or Lambda (would need the same fire-and-forget caveat Vercel's model already covers) — no feature code branches on which. |
| **Supabase** | Supabase Postgres already ships PostGIS; confirm the project's PostGIS version supports `ST_ChaikinSmoothing` (PostGIS ≥ 3.2, tightening 005's existing ≥ 3.1 requirement) before release. |

No new environment variable, secret, or external service dependency is
introduced by this feature. The one schema migration must run before this
feature's Route Handlers are exposed, standard migrate-then-deploy
ordering unchanged from every prior feature.

## Risks

| Risk | Mitigation |
|---|---|
| Fire-and-forget background execution has no guaranteed re-entry if the process is killed mid-chunk (e.g., a serverless function recycled between chunks) | A run stuck in `"running"` past a generous staleness threshold (e.g., no `progress` update in N minutes) is treated as failed by a lightweight staleness check on read (`getAnalysisRunById`/list queries lazily mark it `"failed"` with a "did not complete" message rather than leaving it `"running"` forever) — no separate watchdog process required |
| Large geometry memory usage — a single very complex polygon (many vertices) within one chunk could still be expensive even with feature-count chunking | Chunking is by feature count, not vertex count; the plan documents this as a known follow-up (a future per-operation vertex-aware chunk sizing), not a blocking unknown for this release |
| Database locking / connection-pool pressure from many concurrent background continuations | Bounded by the existing Prisma connection pool configuration and the per-user concurrent-job cap (Decision 12); chunked queries are short enough individually to avoid holding a connection for a run's entire duration |
| Concurrency: two users cancelling/re-running the same shared-project run simultaneously | `cancelRun`/`discardResult` are idempotent no-ops on an already-terminal run (contracts/api-contracts.md), so a race resolves safely either order |
| Precision loss in chunked vs. single-statement execution (e.g., a Dissolve whose grouping spans chunk boundaries) | Grouping/dissolve operations aggregate across all chunks before the final `ST_Union`, never partially dissolve per-chunk and merge the partial results — documented explicitly in `analysisOperations.ts`'s dissolve builder to prevent a future contributor from "optimizing" this incorrectly |
| Cancellation edge cases: a cancel request arriving after the last chunk already wrote a terminal status | Handled by `cancelRun`'s no-op-on-terminal rule (contracts/api-contracts.md) |
| Export failures on very large in-browser assemblies (memory limits) | Streamed Blob-part assembly (research.md Decision 10) plus a documented soft warning threshold in the UI before attempting a very large single-file export |
| The `assertProjectRole` dependency on 006-collaboration landing first | Explicitly tracked in Complexity Tracking below, not silently assumed |

---

## Development Phases (for `/speckit-tasks`)

**Phase 1 — Setup**: `AnalysisRun` migration (widen) + `AnalysisPreset`/
`MeasurementHistory`/`ExportJob` migration (create); extend
`analysis.schema.ts`; new `presetRequest.schema.ts`/
`measurementRequest.schema.ts`; add the Shapefile-writer dependency +
bundle-analyzer check.

**Phase 2 — Foundational**: `assertProjectRole` (reuse if 006 has landed,
else implement per 006's already-designed contract as a shared
prerequisite); widen `analysisRepository.ts`'s core functions;
`analysisOperations.ts` new builders; `analysisStore.ts`/
`analysisPanelStore.ts`; `analysisService.ts` + `queryKeys.ts`;
`useAnalysis.ts` foundational hooks; `AnalysisPanel.tsx` shell mounted
into `DashboardLayout.tsx`.

**Phase 3 — Buffer (US1)**: already-existing `buffer` operationType
wired through the new background-job path; `AnalysisToolbox`'s Buffer
category; `OperationConfigForm` for Buffer.

**Phase 4 — Spatial Query (US2)**: new predicate builders
(Touches/Crosses/Overlaps); `selectByLocation`/`selectByAttribute`
operations; Select-by-Location/Attribute UI.

**Phase 5 — Measurement (US3)**: `measurementService.ts`;
`MeasureToolbar.tsx`; `measurementRepository.ts` + save/list/delete
endpoints.

**Phase 6 — Overlay (US4)**: `erase`/`identity`/`symmetricalDifference`
builders (union/intersection/difference/clip already exist from 005);
Overlay category UI.

**Phase 7 — Geometry Processing (US5)**: simplify/smooth/multipart-
conversion/repair builders (split/merge/dissolve already exist);
Geometry Processing category UI.

**Phase 8 — Spatial Statistics (US6)**: featureCount/totalLength/
averageLength/averageArea/extent builders (area/length/centroid/
convexHull/boundingBox/density already exist); Summarize UI.

**Phase 9 — Raster-Ready Framework (US7)**: catalog entries for all five
raster operations with `implemented` flags; Raster & Surface Analysis
Toolbox category; Heatmap wiring reused from 005 unchanged.

**Phase 10 — Analysis History & Presets (US8)**: `executeInBackground`/
`cancelRun`/`discardResult`; `analysisPresetRepository.ts` + endpoints;
`HistoryPanel.tsx`, `PropertyPanel.tsx`, `PresetPicker.tsx`,
`ProgressDialog.tsx`.

**Phase 11 — Export (US9)**: `exportService.ts` per-format assembly;
`exportLogRepository.ts` + endpoints; export UI in `ResultPanel.tsx`.

**Phase 12 — Analysis Workspace UI polish (US10)**: `AnalysisSummary.tsx`;
dock/resize/collapse behavior in `analysisPanelStore`; full keyboard/ARIA
pass across every component in the tree.

**Phase 13 — Testing & Polish**: full test-tier pass (Testing Strategy
above); large-dataset and concurrent-job performance tests; accessibility
audit; quickstart.md full run-through; Constitution Check re-verification.

Phase 2 (background-job foundation) blocks every operation phase (3–9)
from running at meaningful scale, though each can still be developed
against the synchronous fast-path first and wired into chunked execution
once Phase 2 lands. Phase 10 depends on Phases 3–9 having produced runs
worth showing history for. Phase 11 depends on at least one
result-producing operation existing. Phase 12 can proceed in parallel with
3–11 once Phase 2's `AnalysisPanel` shell exists.

---

## Quality Gates

- **TypeScript**: `tsc --noEmit` — zero errors
- **ESLint**: `eslint src --max-warnings 0` — zero errors/warnings
- **Vitest**: all applicable tiers above passing
- **Production build**: `next build` succeeds
- **Bundle analyzer**: mandatory run given the one new dependency
  (Shapefile writer) — must stay under the 20 KB gzipped threshold or
  carry a documented exception (Constitution Principle V)

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Dependency on 006-collaboration's `assertProjectRole`/`ProjectMember`/`Activity` (not yet implemented in this codebase) | The spec's own Security requirements (FR-034/FR-035/FR-036) require project-membership-and-role-aware permission checks and project-scoped audit logging — 006 is the only place in this codebase already designing that, and building a second, 007-specific permission/audit system would be a direct architecture duplication the "reuse existing architecture" instruction explicitly rules out | Falling back to 005's older `ownerId`-only check (rejected — does not satisfy "only project members," ignores role distinctions the spec requires, and would need a breaking follow-up migration the moment 006 lands anyway) |
| Background execution (chunked, DB-backed job state + `pg_cancel_backend`) instead of 005's synchronous-only model | This spec's explicit 100,000-feature / 100-concurrent-job targets (Performance section) and explicit FR-024/027/028/029 (progress, cancellation, background execution) cannot be met by 005's synchronous-with-size-caps design, which was itself scoped correctly for 005's smaller, explicitly-synchronous spec | A message queue/worker pool (rejected — new infrastructure dependency, not portable across all five required deployment targets, disproportionate to what DB-backed chunking + Postgres's own `pg_cancel_backend` already achieve) |
| One new npm dependency (client-side Shapefile writer) | Shapefile *export* (FR-022) has no existing implementation anywhere in this codebase — the existing `shapefile` package only reads — and hand-rolling a binary `.shp`/`.shx`/`.dbf` writer is disproportionate engineering effort for a well-solved, narrow problem | Omitting Shapefile export (rejected — explicitly required by FR-022 and US9's acceptance scenarios, which the spec has already been approved with) |
