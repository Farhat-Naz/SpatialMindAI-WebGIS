# Implementation Plan: Spatial Analysis & Geoprocessing

**Branch**: `005-spatial-analysis-geoprocessing` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-spatial-analysis-geoprocessing/spec.md`

---

## Summary

This plan covers the complete `005-spatial-analysis-geoprocessing` spec: all
22 requested operations (Buffer, Intersect, Union, Difference, Clip,
Dissolve, Merge, Split, Spatial Join, Point in Polygon, Near Analysis,
Distance Matrix, Area Calculation, Length Calculation, Centroid, Convex
Hull, Bounding Box, Heatmap, Density Analysis, Coordinate Conversion, CRS
Transformation), plus Batch Processing and Analysis History, grouped into
the spec's 8 prioritized user stories (US1–US8).

Four findings shape this plan significantly:

1. **This feature adds exactly one new Prisma model** (`AnalysisRun`) and
   **exactly one new repository file** (`analysisRepository.ts`) — every
   one of the 22 operations, the batch workflow, and the history view are
   served by that single table plus five new Route Handlers, not a
   parallel schema (research.md Decisions 1–2).
2. **Every persisted spatial result is computed in PostGIS**, reusing the
   exact `assertGeometryIsValid`/transaction pattern
   `featureRepository.ts` already established — no operation recomputes an
   authoritative result in JavaScript (Constitution Principle IV;
   research.md Decision 4).
3. **This feature is a new client module, `src/features/analysis/`**, not
   an extension of `src/features/database/` — it consumes `database`'s
   public barrel (`useLayers`, `useFeatures`, `useDatabaseStore`) rather
   than reaching into its internals, and introduces its own store
   (`analysisStore`) for a genuinely new concern (in-progress analysis
   configuration), not a duplicate of `editingStore`/`databaseStore`
   (research.md Decision 6).
4. **No background job queue.** Every run — including each item of a
   Batch Run — executes synchronously within its Route Handler's
   request/response cycle, with fixed per-operation input-size caps
   enforcing the 15-second budget in SC-001 (research.md Decision 7).

---

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged)

**Primary Dependencies**:
- next@16, react@19/react-dom@19 (unchanged)
- @tanstack/react-query@5, zustand@5, zod (existing — reused, no new
  state/validation library)
- shadcn/ui (existing — `Dialog`/form primitives for the operation
  configuration panel, `Table` pattern for Distance Matrix/History display)
- PostGIS functions only for spatial computation (`ST_Buffer`,
  `ST_Intersection`, `ST_Union`, `ST_Difference`, `ST_Split`,
  `ST_Centroid`, `ST_ConvexHull`, `ST_Envelope`, `ST_Area`, `ST_Length`,
  `ST_Distance`, `ST_DWithin`, `ST_Within`, `ST_Contains`, `ST_Transform`,
  `ST_SquareGrid`/`ST_HexagonGrid` — research.md Decision 4) — **no new
  npm dependency is introduced by this feature**
- Turf.js (existing, `database` feature) is reused, unmodified, only for
  Heatmap's client-side rendering (research.md Decision 9) — this feature
  never adds a new client-side geometry-math dependency

**Storage**: One new Prisma model, `AnalysisRun` (data-model.md), plus
additive back-relations on `Project` and `Layer`. One migration. No
existing column, index, or model changes.

**Testing**: Vitest + React Testing Library (unchanged). New Route
Handlers tested against the real ephemeral PostGIS test database,
skip-if-unavailable, matching 003/004's established pattern — this matters
more here than in prior features since every operation's correctness
depends on an actual PostGIS function's output, not a mock.

**Target Platform**: Unchanged — Node.js runtime, single Postgres/PostGIS
instance.

**Project Type**: Web application — single Next.js app. Adds one new
top-level client feature module, `src/features/analysis/`, following the
exact same internal structure as `database`/`search`/`map`
(`components/`, `hooks/`, `services/`, `store/`, `types/`, `__tests__/`,
`index.ts`). Adds five Route Handlers under `app/api/`. No existing
feature module, Route Handler, or repository function is rewritten.

**Performance Goals** (from spec Success Criteria):
- A single-/two-input analysis on a 1,000-feature layer completes in
  under 15 s (SC-001).
- Zero invalid geometry ever persisted (SC-002).
- A 10-item batch reports a per-item outcome for every item, zero silent
  failures (SC-003).
- Any analysis from the last 30 days is re-runnable directly from history
  with no re-entry of inputs/parameters (SC-004).
- Coordinate Conversion/CRS Transformation accurate to source precision
  (SC-006).

**Constraints**:
- Every operation runs synchronously in one request/response cycle; no
  job queue (research.md Decision 7).
- Fixed per-operation input-size caps (e.g., 5,000 features for
  single/two-layer operations, 500×500 for Distance Matrix's cross
  product) reject oversized requests up front rather than running
  unbounded.
- All persisted geometry remains EPSG:4326; CRS Transformation is an
  export/display-time conversion only, never a way to store non-default
  SRID geometry (Constitution GIS Principle IV; research.md Decision 8).
- Heatmap has no persisted representation — client-side only (research.md
  Decision 9).
- Batch Processing applies one operation/one parameter set across
  multiple inputs; multi-step pipeline chaining is out of scope
  (spec.md Assumptions).

**Scale/Scope**: One new Prisma model, one new repository file plus one
sibling SQL-builder helper file, five new Route Handlers, one new Zod
contract module, one new client feature module (`src/features/analysis/`)
with its own store, services, and hooks, and roughly 10–14 new UI
components. No existing Route Handler, repository function, store, or
hook is modified.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design —
see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | New client code lives entirely in a new `src/features/analysis/` module with its own barrel; the five new Route Handlers live under `app/api/`; only one new repository file (`analysisRepository.ts`) imports `@prisma/client`, matching 003's already-accepted repository-layer interpretation of this principle (research.md Decision 1) |
| II. Type Safety | ✅ PASS | The 22-variant request body is a single Zod discriminated union (`analysisRequestSchema`), mirroring `geometrySchema`'s existing pattern; no `any` introduced |
| III. Database | ✅ PASS | One new model (`AnalysisRun`), added via `prisma migrate dev`; every geometry-bearing result reuses `Feature.geometry`'s existing PostGIS column — no new geometry-typed column is introduced |
| IV. GIS Principles | ✅ PASS | Every persisted spatial result (Buffer, overlay, measurement, join, density, CRS transform) is computed via a PostGIS function, never recomputed in JavaScript (research.md Decision 4); Heatmap is the one explicitly client-side "transient UI feedback" case the constitution itself carves out; all persisted geometry remains EPSG:4326 (Decision 8) |
| V. Performance | ✅ PASS | No new heavy client dependency is introduced at all; per-operation input caps bound PostGIS query cost; React Query caches Analysis History and run results with centralized query keys (`analysis`'s own `queryKeys.ts`, never an inline literal — see the fix already applied to `database` in 004 Phase 9) |
| VI. Security | ✅ PASS | Every new Route Handler follows the identical `getCurrentUser` → `assertWriteRateLimit` → Zod validate → ownership-scoped repository call → `handleRouteError` pattern as every existing endpoint; cross-owner requests return `404`, never `401`/`403` (non-disclosure pattern, unchanged) |
| VII. Testing | ✅ PASS | Unit/store/hook/API/integration tiers planned for every operation category; API tests run against the real PostGIS test database since correctness here is inseparable from actual PostGIS function behavior |
| VIII. Documentation | ✅ PASS | spec→plan→(tasks→implementation→tests→docs) lifecycle in progress; JSDoc required on every new exported function, including each `analysisOperations.ts` SQL-fragment builder |
| IX. Git Workflow | ✅ PASS (process) | Standard workflow applies |
| X. Quality Gates | ✅ PASS | TypeScript, ESLint, tests, `next build` all gate merge; no new dependency means no new bundle-analyzer concern |

**No violations.**

**Re-check after Phase 1 design**: Confirmed still PASS. `data-model.md`
and `contracts/` confirm the scope introduces exactly one new persisted
entity and exactly five new Route Handlers, with zero new npm
dependencies.

---

## Project Structure

### Documentation (this feature)

```text
specs/005-spatial-analysis-geoprocessing/
├── spec.md                # Approved
├── plan.md                # This file
├── research.md            # Phase 0 output (9 decisions)
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   ├── api-contracts.md
│   ├── repository-api.md
│   └── client-api.md
├── checklists/
│   └── requirements.md
└── tasks.md               # Generated by /speckit-tasks (NOT this command)
```

### Source Code (repository root) — additions only

```text
prisma/
└── schema.prisma                        # MODIFIED: + AnalysisRun model, + back-relations

src/
├── server/
│   └── repositories/
│       ├── analysisRepository.ts        # NEW — the only file here importing @prisma/client
│       └── analysisOperations.ts        # NEW — PostGIS SQL-fragment builders (not a repository)
│
├── shared/
│   └── contracts/
│       └── analysis.schema.ts           # NEW — 22-variant discriminated union + batch/history schemas
│
└── features/
    └── analysis/                        # NEW top-level feature module
        ├── components/
        │   ├── OperationPicker.tsx      # NEW (US1–US6) — choose operation type + input layers
        │   ├── ParameterForm.tsx        # NEW — per-operation parameter inputs (distance, unit, attribute, relationship, …)
        │   ├── BufferProximityPanel.tsx # NEW (US1)
        │   ├── OverlayPanel.tsx         # NEW (US2)
        │   ├── MeasurementPanel.tsx     # NEW (US3)
        │   ├── RelationshipPanel.tsx    # NEW (US4)
        │   ├── CrsConversionPanel.tsx   # NEW (US5)
        │   ├── HeatmapLayer.tsx         # NEW (US6) — client-side-only, Turf.js/Leaflet.heat rendering
        │   ├── DensityAnalysisPanel.tsx # NEW (US6)
        │   ├── BatchRunPanel.tsx        # NEW (US7)
        │   ├── AnalysisHistoryPanel.tsx # NEW (US8)
        │   └── DistanceMatrixTable.tsx  # NEW (US1) — tabular, non-layer result display
        ├── hooks/
        │   └── useAnalysis.ts           # NEW: useRunAnalysis, useRunBatchAnalysis, useAnalysisRuns, useAnalysisRun, useRerunAnalysis, useDeleteAnalysisRun
        ├── services/
        │   ├── analysisService.ts       # NEW
        │   └── queryKeys.ts             # NEW — centralized, per client-api.md
        ├── store/
        │   └── analysisStore.ts         # NEW: selectedOperationType/draftParameters/stagedInputLayerIds/history-panel/lastError
        ├── types/
        │   └── analysis.types.ts        # NEW — re-exports of analysis.schema.ts's inferred types
        ├── index.ts                     # NEW — public barrel
        └── __tests__/                   # new tests co-located, per existing convention

app/
└── api/
    ├── projects/
    │   └── [projectId]/
    │       └── analysis/
    │           ├── route.ts             # NEW: POST (single run), GET (history list)
    │           └── batch/
    │               └── route.ts         # NEW: POST (batch run)
    └── analysis/
        └── [runId]/
            ├── route.ts                 # NEW: GET (detail), DELETE
            └── rerun/
                └── route.ts             # NEW: POST
```

**Structure Decision**: A new top-level feature module
(`src/features/analysis/`) is introduced — deliberately, not as an
oversight of "follow existing folder structure." It follows the identical
internal shape every existing feature module already uses
(`components/`, `hooks/`, `services/`, `store/`, `types/`, `__tests__/`,
`index.ts`), and consumes `database`'s public barrel rather than importing
its internals, per Constitution Principle I's cross-feature-import rule.
Adding this feature's UI/state to `src/features/database/` instead would
make an unrelated module responsible for a second feature's in-progress
form state — the exact "duplicate/grab-bag store" outcome the "no
duplicate stores" requirement is meant to prevent (research.md Decision
6).

---

## 1. Buffer & Proximity Analysis (US1)

`OperationPicker` + `ParameterForm` submit to `useRunAnalysis`, which posts
to `POST /api/projects/:projectId/analysis` with `operationType: "buffer"
| "nearAnalysis" | "distanceMatrix"`. Buffer and Near Analysis results
render as a new layer / annotated existing layer via `database`'s existing
`useLayers`/`useFeatures` (invalidated by `useRunAnalysis`'s `onSuccess`).
Distance Matrix results render in `DistanceMatrixTable.tsx`, reading
`resultData` directly — no new layer, no `database` invalidation.

## 2. Overlay & Set Operations (US2)

`OverlayPanel` covers Intersect/Union/Difference/Clip/Dissolve/Merge/Split
— one shared UI, `operationType` swaps only the input-count requirement
(1, 2, or 2+) and whether a `parameters.attributeKey` field (Dissolve) is
shown. Every variant here produces a new layer.

## 3. Measurement & Derived Geometry (US3)

`MeasurementPanel` covers Area/Length/Centroid/Convex Hull/Bounding Box.
Area/Length results attach to existing features (no new layer — the
existing feature's attributes gain a computed value, via the same
`updateFeature` repository path `database` already uses for attribute
edits); Centroid/Convex Hull/Bounding Box produce new point/polygon
features in a new layer, identical to every other geometry-producing
operation.

## 4. Spatial Relationship Queries (US4)

`RelationshipPanel` covers Point in Polygon and Spatial Join. Point in
Polygon annotates the point layer's features (attribute-only, like
Area/Length above); Spatial Join produces a new layer per its contract.

## 5. Coordinate System Conversion (US5)

`CrsConversionPanel` covers both Coordinate Conversion (raw coordinate
input, no layer) and CRS Transformation (existing layer, export/display
only — `resultData` holds the transformed coordinates for
preview/download; the layer's stored `Feature.geometry` is never
rewritten, per research.md Decision 8).

## 6. Density & Heatmap Visualization (US6)

`HeatmapLayer.tsx` is the one component in this entire feature with no
Route Handler behind it — it renders directly from `database`'s
`useFeatures` cache using Turf.js, matching `MeasurementToolbar`'s existing
transient-rendering pattern in 004. `DensityAnalysisPanel` submits a real
Analysis Run producing a new (grid/contour) layer.

## 7. Batch Processing (US7)

`BatchRunPanel` reuses `OperationPicker`/`ParameterForm` for the shared
operation type/parameters, then lets the user stage multiple independent
input sets before calling `useRunBatchAnalysis`
(`POST /api/projects/:projectId/analysis/batch`). Renders one row per item
with its own status/result, per `api-contracts.md`'s per-item independence
guarantee.

## 8. Analysis History (US8)

`AnalysisHistoryPanel` lists `useAnalysisRuns(projectId)` newest-first,
each row exposing Re-run (`useRerunAnalysis`) and Delete
(`useDeleteAnalysisRun`) actions. A `batchId` groups its member rows
visually without a second query (`listAnalysisRunsForProject`'s existing
`batchId` filter, data-model.md).

---

## Database Changes

Exactly one new Prisma model (`AnalysisRun`, data-model.md) plus two
additive back-relation fields (`Project.analysisRuns`,
`Layer.resultOfAnalysisRuns`). No existing table, column, or index is
altered. `AnalysisRun.parameters`/`inputLayerIds`/`resultData` are `Json`
columns — no new PostGIS geometry column is introduced (results that are
geometry reuse the existing `Feature`/`Layer` tables via
`resultLayerId`).

## React Query Flow

`analysis`'s own `queryKeys.ts` (never an inline array literal — matching
the fix already applied to `database` in 004 Phase 9/T113) centralizes
`analysisRuns(projectId, params?)` and `analysisRun(runId)`.
`useRunAnalysis`/`useRunBatchAnalysis`/`useRerunAnalysis` all invalidate
`queryKeys.analysisRuns(projectId)` on success, plus `database`'s
`queryKeys.layers(projectId)` (imported from `database`'s public barrel)
whenever the result includes a `resultLayerId` — a new layer now exists
and the Layer Tree must reflect it without a manual refresh.
`useDeleteAnalysisRun` invalidates only `analysisRuns` — deleting a history
entry must never appear to affect its (untouched) result layer.

## Zustand Flow

`analysisStore` (research.md Decision 6) holds only in-progress workflow
state: `selectedOperationType`, `draftParameters`, `stagedInputLayerIds`,
`isHistoryPanelOpen`, `lastError`. It never duplicates `database`'s
`databaseStore`/`editingStore` state, reading `selectedProjectId`/
`selectedLayerId` from `useDatabaseStore` directly where an operation
needs to know "which project/layer is currently active" versus "which
layer(s) has the user staged as input for this analysis" (a materially
different, analysis-specific selection).

## Repository Layer

One new file, `analysisRepository.ts` (contracts/repository-api.md):
`createAnalysisRun`, `createBatchRun`, `getAnalysisRunById`,
`listAnalysisRunsForProject`, `rerunAnalysis`, `deleteAnalysisRun` — every
one ownership-scoped exactly like `featureRepository.ts`'s existing
functions, every geometry-producing path reusing `assertGeometryIsValid`
before commit. `analysisOperations.ts` sits beside it as a pure
SQL-fragment-builder helper (no Prisma import, no database connection) —
kept separate purely for the readability of 22 operations' worth of SQL,
not as a second repository.

## Route Handlers

Five new handlers (contracts/api-contracts.md), all following the
identical shape every existing handler uses: `getCurrentUser` →
`assertWriteRateLimit` (write endpoints only) → Zod-parse the
discriminated-union body → repository call → `handleRouteError`. No new
error code is introduced — every failure mode maps to the existing six
(`INVALID_INPUT`, `NOT_FOUND`, `UNAUTHORIZED`, `RATE_LIMITED`,
`DATABASE_ERROR`; `DUPLICATE_NAME` is not applicable to this feature).

## Testing Strategy

| Tier | Coverage |
|---|---|
| **Unit** | `analysis.schema.ts`'s 22-variant discriminated union (one valid + one invalid case per variant); `analysisStore` actions; `analysisOperations.ts`'s SQL-fragment builders (assert the generated `Prisma.Sql` text/params, not a live query) |
| **Store** | `analysisStore` — operation-type switching clears draft parameters; staged-input add/remove/clear; history-panel toggle; error set/clear |
| **Hook** | `useRunAnalysis`, `useRunBatchAnalysis`, `useAnalysisRuns`, `useRerunAnalysis`, `useDeleteAnalysisRun` against mocked `analysisService` |
| **API** | Every new Route Handler against the real PostGIS test database (skip-if-unavailable): one success + one rejection case per operation category (buffer/overlay/measurement/relationship/CRS/density), batch partial-failure, cross-owner 404, malformed-body 400, re-run-after-input-deleted 404 |
| **Component** | `OperationPicker`, `ParameterForm` (per-operation field rendering), `DistanceMatrixTable`, `BatchRunPanel` (per-item status rendering), `AnalysisHistoryPanel` (list/re-run/delete), `HeatmapLayer` (renders without a network call) |
| **Integration** | Run an overlay operation → confirm new layer appears in `database`'s Layer Tree; submit a 3-item batch with one invalid item → confirm 2 succeed, 1 fails, all 3 appear in history; re-run a history entry → confirm identical inputs/parameters; delete a history entry → confirm its result layer is unaffected |
| **Accessibility** | Every new panel/dialog/table checked against WCAG 2.2 AA; keyboard operability for `OperationPicker` and `AnalysisHistoryPanel`'s row actions |

## Migration Strategy

A single `prisma migrate dev` migration adding `AnalysisRun` and the two
back-relation fields — purely additive (`CREATE TABLE`, two new indexes),
no data backfill needed since no prior data exists for a brand-new table.
Applied the same way every prior feature's migration was
(`prisma migrate deploy` in CI/production, `prisma migrate dev` locally),
no new migration tooling or process introduced.

## Performance Considerations

- Per-operation input-size caps (research.md Decision 7) bound PostGIS
  query cost and give SC-001's 15 s budget a concrete enforcement
  mechanism instead of an aspiration.
- `AnalysisRun`'s `[projectId, createdAt]` index keeps Analysis History
  paginated and fast at any history size (mirrors `Layer`'s
  `[projectId, order]` index shape).
- No new client-side dependency is introduced; `HeatmapLayer` reuses
  Turf.js already present in the bundle from 004 — no bundle-size impact
  to re-verify.
- Batch Run items execute sequentially within the request (not
  parallelized against the same database connection pool) to keep
  connection-pool pressure bounded and predictable under the existing
  Prisma connection-pool configuration — a deliberate, documented
  trade-off against the 20-item batch cap, not an oversight.

## Security Considerations

- Every new Route Handler is ownership-scoped identically to every
  existing one; a cross-owner request returns `404`, never a
  `401`/`403` that would disclose the resource's existence
  (Constitution Principle VI, unchanged non-disclosure pattern).
- The existing per-user rate limiter gains one new bucket,
  `analysis:write`, applied to every write endpoint in this feature —
  no new rate-limiting mechanism is introduced.
- Every request body is Zod-validated (the 22-variant discriminated
  union) before any repository call — an unrecognized `operationType` or
  malformed `parameters` shape is rejected as `INVALID_INPUT` before any
  PostGIS query runs, preventing both malformed-query errors and
  needless database load from invalid input.
- No new secret, external API, or third-party call is introduced — every
  operation is computed by the existing, already-connected PostGIS
  instance.

## Deployment Notes

- Requires PostGIS ≥ 3.1 for `ST_SquareGrid`/`ST_HexagonGrid` (Density
  Analysis) — confirm the deployed Postgres/PostGIS version before
  release; every other function used (Decision 4's table) is available in
  PostGIS ≥ 3.0, already required by 003-database-foundation.
- No new environment variable, secret, or external service dependency.
- Deploys as part of the same single Next.js application — no new
  service, container, or infrastructure component.
- The one schema migration must run before this feature's Route Handlers
  are exposed (standard migrate-then-deploy ordering, unchanged from
  003/004).

## Risks

| Risk | Mitigation |
|---|---|
| A single request/response cycle (Decision 7) may still time out for a pathological input near its size cap (e.g., a 5,000-feature Union with highly complex polygons) | Size caps are deliberately conservative starting points; `/speckit-tasks`' performance-test tier should measure actual worst-case timing per operation and tighten caps before release if needed — a documented follow-up, not a blocking unknown |
| 22 operations sharing one discriminated-union schema and one repository file is a large single surface to get right | Mitigated by grouping into the same 8 categories as the spec/plan throughout (schema variants, SQL builders, UI panels, and tests all share the same grouping), so no single file needs to be understood all at once |
| `ST_SquareGrid`/`ST_HexagonGrid` availability depends on the deployed PostGIS version (Deployment Notes) | Verified once at deploy time, not per-request; Density Analysis is the only operation with this dependency, so a version gap blocks one operation, not the feature |
| Batch Processing's sequential-execution trade-off (Performance Considerations) means a 20-item batch's total latency is roughly 20× a single run's, not parallel | Explicitly scoped to a 20-item cap for this reason; a future amendment could revisit parallelization if usage patterns demand it |

---

## Development Phases (for `/speckit-tasks`)

**Phase 1 — Setup**: `AnalysisRun` Prisma model + migration; scaffold
`src/features/analysis/` module structure and public barrel;
`analysis.schema.ts`'s discriminated union (all 22 variants) + batch/history
schemas.

**Phase 2 — Foundational**: `analysisOperations.ts` SQL-fragment builders
(grouped by category); `analysisRepository.ts`'s CRUD functions;
`analysisStore.ts`; `analysisService.ts` + `queryKeys.ts`; `useAnalysis.ts`
hooks.

**Phase 3 — Buffer & Proximity (US1)**: single-run + batch Route Handlers
first pass (Buffer only); `OperationPicker`, `ParameterForm`, Buffer/Near
Analysis/Distance Matrix UI, `DistanceMatrixTable.tsx`.

**Phase 4 — Overlay & Set Operations (US2)**: `OverlayPanel.tsx`; remaining
`analysisOperations.ts` builders for Intersect/Union/Difference/Clip/
Dissolve/Merge/Split.

**Phase 5 — Measurement & Derived Geometry (US3)**: `MeasurementPanel.tsx`;
Area/Length attribute-attach path; Centroid/Convex Hull/Bounding Box
new-layer path.

**Phase 6 — Spatial Relationship Queries (US4)**: `RelationshipPanel.tsx`;
Point in Polygon attribute-attach path; Spatial Join new-layer path.

**Phase 7 — Coordinate System Conversion (US5)**: `CrsConversionPanel.tsx`;
`ST_Transform`-based builders for both Coordinate Conversion and CRS
Transformation.

**Phase 8 — Density & Heatmap (US6)**: `HeatmapLayer.tsx` (client-only, no
Route Handler); `DensityAnalysisPanel.tsx` + grid-based builder.

**Phase 9 — Batch Processing (US7)**: `createBatchRun` repository
function + batch Route Handler; `BatchRunPanel.tsx`.

**Phase 10 — Analysis History (US8)**: `AnalysisHistoryPanel.tsx`;
re-run/delete Route Handlers and hooks.

**Phase 11 — Testing & Polish**: full test-tier pass across all 22
operations; accessibility audit; `quickstart.md` full run-through;
Constitution Check re-verification.

Phases 3–8 are largely parallelizable once Phase 2 lands, since each adds
its own operations/panels against the shared `AnalysisRun` table and
`analysisStore` shape; Phase 9 depends on at least one operation from
Phases 3–8 existing to batch; Phase 10 depends on Phases 3–9 having
produced runs worth listing.

---

## Quality Gates

- **TypeScript**: `tsc --noEmit` — zero errors
- **ESLint**: `eslint src --max-warnings 0` — zero errors/warnings
- **Vitest**: all applicable tiers above passing
- **Production build**: `next build` succeeds (no new dependency, so no
  new bundle-analyzer finding is expected)

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations — table intentionally left empty. The two decisions most
likely to be questioned in review (a new top-level feature module instead
of extending `database`; a single wide repository file for 22 operations)
are addressed directly in Project Structure's Structure Decision and
research.md Decisions 1, 3, and 6, not as constitution exceptions but as
the correct application of existing, already-approved patterns.
