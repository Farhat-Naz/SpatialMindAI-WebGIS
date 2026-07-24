---

description: "Task list for feature implementation"
---

# Tasks: Spatial Analysis & Geoprocessing

**Input**: Design documents from `specs/005-spatial-analysis-geoprocessing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Explicitly requested (unit, API, hook, integration, performance, accessibility, build verification) — included throughout.

**Organization**: Tasks are grouped by user story (US1–US8, priority order from spec.md) so each story is independently implementable and testable, per Constitution Principle VII and this feature's plan.md.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[Story]**: Which user story this task belongs to (US1–US8); Setup/Foundational/Polish tasks carry no story label
- Every task lists exact file paths

---

## Phase 1: Setup

**Purpose**: Schema, module scaffold, and shared contracts every later phase depends on.

- [X] T001 Add `AnalysisRun` model + `Project.analysisRuns`/`Layer.resultOfAnalysisRuns` back-relations to `prisma/schema.prisma`
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting)
  - **Files**: `prisma/schema.prisma`
  - **Goal**: Add exactly the one new model described in data-model.md — `id`, `projectId`/`project` relation (cascade), `operationType`, `status`, `parameters` (Json), `inputLayerIds` (Json), `resultLayerId`/`resultLayer` relation (set-null), `resultData` (Json?), `errorMessage`?, `batchId`?, `createdAt`, `updatedAt`, plus `@@index([projectId, createdAt])` and `@@index([batchId])`.
  - **Acceptance Criteria**: Schema compiles (`prisma validate`); no existing model's fields, indexes, or relations change.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: None

- [ ] T002 Generate and apply the `AnalysisRun` migration
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_add_analysis_run/migration.sql`
  - **Goal**: Run `prisma migrate dev` to produce a purely additive migration (one `CREATE TABLE`, two indexes, two FK constraints).
  - **Acceptance Criteria**: Migration applies cleanly against the test database; no data loss or column change to any existing table.
  - **Verification**: `npm run test:db:up` (or existing DB migration command) completes with no errors
  - **Dependencies**: T001

- [X] T003 [P] Scaffold `src/features/analysis/` module structure
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/{components,hooks,services,store,types,__tests__}/`, `src/features/analysis/index.ts` (placeholder)
  - **Goal**: Create the empty directory structure matching every existing feature module's shape (`database`/`search`/`map`), per plan.md's Structure Decision.
  - **Acceptance Criteria**: Directory tree exists; `index.ts` exists (empty exports for now).
  - **Verification**: Manual — directories present
  - **Dependencies**: None

- [X] T004 [P] Write `src/shared/contracts/analysis.schema.ts` — full 22-variant discriminated union + batch/list schemas
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/analysis.schema.ts`
  - **Goal**: One Zod discriminated union keyed by `operationType` covering all 22 operations from `api-contracts.md`'s parameter table (buffer, intersect, union, difference, clip, dissolve, merge, split, spatialJoin, pointInPolygon, nearAnalysis, distanceMatrix, areaCalculation, lengthCalculation, centroid, convexHull, boundingBox, densityAnalysis, coordinateConversion, crsTransformation), each with its documented `inputLayerIds` count and `parameters` shape; plus `analysisBatchRequestSchema` and `listAnalysisRunsQuerySchema`.
  - **Acceptance Criteria**: Every operation type from spec.md has exactly one corresponding schema variant; TypeScript's inferred types cover all 22 discriminants.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T005 [P] Write `src/features/analysis/types/analysis.types.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/types/analysis.types.ts`
  - **Goal**: Re-export `analysis.schema.ts`'s inferred types (`AnalysisRequestInput`, `AnalysisBatchRequestInput`, `OperationType`, etc.) for internal feature use, matching `database.types.ts`'s existing re-export pattern.
  - **Acceptance Criteria**: No type is hand-duplicated from the schema module.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [X] T006 **Checkpoint** — Setup quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the schema/migration/module scaffold is sound before any repository or UI code is written.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, `prisma validate` all pass clean.
  - **Verification**: Commands run clean.
  - **Dependencies**: T001–T005

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared repository, Route Handler, store, service, and hook layer every user story phase plugs an operation into. **No user story work may begin until this phase is complete.**

- [X] T007 `analysisRepository.ts` — ownership-scoped read helpers + `getAnalysisRunById`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: A `getRunScopedToOwner(runId, ownerId)` helper (join through `Project.ownerId`, mirroring `getFeatureScopedToOwner`), and `getAnalysisRunById(runId, ownerId): Promise<AnalysisRunRecord | null>` built on it.
  - **Acceptance Criteria**: Returns `null` (not an error) for a run that doesn't exist or belongs to a different owner — matching the existing non-disclosure convention.
  - **Verification**: Covered by T027.
  - **Dependencies**: T002

- [X] T008 `analysisRepository.ts` — `listAnalysisRunsForProject`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Cursor (keyset) pagination ordered by `createdAt DESC, id`, with an optional `batchId` filter, scoped via project ownership — mirrors `listFeaturesForLayer`'s pattern exactly.
  - **Acceptance Criteria**: Returns `{ runs, nextCursor }`; `batchId` filter returns only that batch's member runs.
  - **Verification**: Covered by T027.
  - **Dependencies**: T007

- [X] T009 `analysisRepository.ts` — `deleteAnalysisRun`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Deletes only the `AnalysisRun` row; never touches `resultLayerId`'s layer (relies on the `SetNull` relation from T001).
  - **Acceptance Criteria**: Throws `NotFoundError` for a non-owned/non-existent run; a run's result layer still exists and is unaffected after deletion.
  - **Verification**: Covered by T027.
  - **Dependencies**: T007

- [X] T010 `analysisRepository.ts` — `createAnalysisRun` shell with operation dispatch
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Validates every `inputLayerIds` entry via project-scoped ownership lookup (throws `NotFoundError` otherwise); wraps a dispatch map (`Record<OperationType, OperationHandler>`, initially empty) keyed by `operationType`; on an unregistered `operationType`, throws `ValidationError` ("operation not yet supported"); on success, writes the `AnalysisRun` row with `status: "succeeded"` and either `resultLayerId` or `resultData`; on a handler-thrown `ValidationError`, still writes the row with `status: "failed"` and `errorMessage` instead of propagating the throw (spec.md — a run always appears in history, even failed ones). Each user story phase below registers its own operations into this map (never edits this shell function's own logic).
  - **Acceptance Criteria**: Calling with any unregistered `operationType` returns a `400 INVALID_INPUT` (via the Route Handler) before any PostGIS call.
  - **Verification**: Covered by T027 (shell path) and each user story's own API tests (registered-operation path).
  - **Dependencies**: T007

- [X] T011 [P] `analysisOperations.ts` — skeleton + shared builder-signature convention
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: Establish the shared function-signature convention every operation builder in later phases follows: `(params: <OperationParams>, context: { inputLayerIds: string[] }) => Prisma.Sql`, returning a SQL fragment `analysisRepository.ts` executes — this file never imports `prismaClient` (Research Decision 1/plan.md Repository Layer).
  - **Acceptance Criteria**: File compiles with zero exports yet (populated per user story phase); confirmed to have no `@prisma/client` import.
  - **Verification**: `npx tsc --noEmit`; manual review confirms no Prisma import.
  - **Dependencies**: None

- [ ] T012 Route Handler: `POST /api/projects/:projectId/analysis`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/analysis/route.ts`
  - **Goal**: `getCurrentUser` → `assertWriteRateLimit(user.id, "analysis:write")` → parse body with `analysisRequestSchema` (Zod) → `createAnalysisRun` → `handleRouteError` on throw, matching every existing Route Handler's shape exactly.
  - **Acceptance Criteria**: Malformed body → `400`; valid body with an unregistered `operationType` → `400` (via T010); missing/foreign-owned input layer → `404`.
  - **Verification**: Covered by T027.
  - **Dependencies**: T004, T010

- [ ] T013 Route Handler: `GET /api/projects/:projectId/analysis` (same file as T012)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/analysis/route.ts`
  - **Goal**: `GET` handler in the same route file — parses `cursor`/`limit`/`batchId` query params, calls `listAnalysisRunsForProject`.
  - **Acceptance Criteria**: Returns `{ runs, nextCursor }`; empty project returns `{ runs: [], nextCursor: null }`, not an error.
  - **Verification**: Covered by T027.
  - **Dependencies**: T008

- [ ] T014 [P] Route Handler: `GET /api/analysis/:runId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/analysis/[runId]/route.ts`
  - **Goal**: `GET` handler calling `getAnalysisRunById`; `404` for a missing/non-owned run.
  - **Acceptance Criteria**: Matches `api-contracts.md`'s single-run response shape.
  - **Verification**: Covered by T027.
  - **Dependencies**: T007

- [ ] T015 [P] Route Handler: `DELETE /api/analysis/:runId` (same file as T014)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/analysis/[runId]/route.ts`
  - **Goal**: `DELETE` handler in the same route file, calling `deleteAnalysisRun`; `204` on success.
  - **Acceptance Criteria**: `404` for a missing/non-owned run; result layer (if any) is confirmed untouched.
  - **Verification**: Covered by T027.
  - **Dependencies**: T009

- [X] T016 `analysisRepository.ts` — `rerunAnalysis` shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Reads the original run via `getAnalysisRunById`; throws `NotFoundError` if the run itself, or any of its original `inputLayerIds`, no longer resolves; otherwise calls `createAnalysisRun` again with the original `operationType`/`parameters`/`inputLayerIds`.
  - **Acceptance Criteria**: A re-run of a run whose input layer was deleted is rejected with a message naming the missing layer, before calling `createAnalysisRun`.
  - **Verification**: Covered by T027 (missing-input path); full replay path covered per-operation once an operation is registered (US1 onward).
  - **Dependencies**: T007, T010

- [ ] T017 Route Handler: `POST /api/analysis/:runId/rerun`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/analysis/[runId]/rerun/route.ts`
  - **Goal**: Calls `rerunAnalysis`; returns a new run object (`201`).
  - **Acceptance Criteria**: Matches `api-contracts.md`'s re-run response contract.
  - **Verification**: Covered by T027.
  - **Dependencies**: T016

- [X] T018 `analysisRepository.ts` — `createBatchRun` shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Generates one `batchId`; validates `items` is 1–20 entries; calls `createAnalysisRun` once per item with the shared `batchId`, catching each item's own failure independently (never lets one item's throw abort the loop).
  - **Acceptance Criteria**: A batch with one item that references an unregistered `operationType` still returns all other items' real outcomes.
  - **Verification**: Covered by T027 (shape/cap validation); per-item success/failure covered in US7 (T112–T113) once a real operation exists to batch.
  - **Dependencies**: T010

- [ ] T019 Route Handler: `POST /api/projects/:projectId/analysis/batch`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/analysis/batch/route.ts`
  - **Goal**: Parses body with `analysisBatchRequestSchema`, calls `createBatchRun`, returns `{ batchId, runs }` (`201`).
  - **Acceptance Criteria**: Empty or >20-item `items` array rejected as `400` before any repository call.
  - **Verification**: Covered by T027.
  - **Dependencies**: T004, T018

- [ ] T020 [P] `analysisStore.ts` (Zustand)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts`
  - **Goal**: `selectedOperationType`, `draftParameters`, `stagedInputLayerIds`, `isHistoryPanelOpen`, `lastError`, and their actions (`setSelectedOperationType` clears `draftParameters` on switch, `setDraftParameters`, `stageInputLayer`/`unstageInputLayer`/`clearStagedInputLayers`, `toggleHistoryPanel`, `setLastError`/`clearLastError`) — per `client-api.md`.
  - **Acceptance Criteria**: Store never duplicates `database`'s `databaseStore`/`editingStore` fields.
  - **Verification**: Covered by T025.
  - **Dependencies**: T005

- [ ] T021 [P] `analysisService.ts` + `queryKeys.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/analysisService.ts`, `src/features/analysis/services/queryKeys.ts`
  - **Goal**: Six thin `fetch` wrappers (`runAnalysis`, `runBatchAnalysis`, `listRuns`, `getRun`, `rerunAnalysis`, `deleteRun`) via the same `apiFetch` pattern `database`'s services use; centralized `queryKeys.analysisRuns(projectId, params?)`/`queryKeys.analysisRun(runId)` — never an inline array literal (matching the fix already applied in `database`'s `queryKeys.featuresList`).
  - **Acceptance Criteria**: No service function contains business logic beyond request shaping/response parsing.
  - **Verification**: Covered by T026.
  - **Dependencies**: T012, T013, T014, T015, T017, T019

- [ ] T022 `useAnalysis.ts` hooks
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts`
  - **Goal**: `useRunAnalysis(projectId)`, `useRunBatchAnalysis(projectId)`, `useAnalysisRuns(projectId, params)`, `useAnalysisRun(runId)`, `useRerunAnalysis()`, `useDeleteAnalysisRun(projectId)` — per `client-api.md`'s invalidation rules (a successful run with a `resultLayerId` also invalidates `database`'s `queryKeys.layers(projectId)`, imported from `database`'s public barrel; delete invalidates only `analysisRuns`).
  - **Acceptance Criteria**: `useDeleteAnalysisRun`'s `onSuccess` never invalidates `database`'s layer query key.
  - **Verification**: Covered by T026.
  - **Dependencies**: T020, T021

- [ ] T023 Public barrel `src/features/analysis/index.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/index.ts`
  - **Goal**: Export `analysisService`, `queryKeys`, every hook from T022, `useAnalysisStore`, and every type from `analysis.types.ts` intended for external use (initially none — components are added per user story phase and exported as they land).
  - **Acceptance Criteria**: `tsc --noEmit` passes with the barrel importable from elsewhere in the app.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T020, T021, T022

- [ ] T024 [P] Unit test: `analysis.schema.ts` discriminated union
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/__tests__/analysis.schema.test.ts`
  - **Goal**: One valid + one invalid case per operation type (22 pairs), plus the batch and list-query schemas.
  - **Acceptance Criteria**: All 22 operation types covered; an unrecognized `operationType` fails validation.
  - **Verification**: `npm run test -- analysis.schema` passes.
  - **Dependencies**: T004

- [ ] T025 [P] Unit test: `analysisStore` actions
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/__tests__/analysisStore.test.ts`
  - **Goal**: Operation-type switch clears draft parameters; stage/unstage/clear staged inputs; history-panel toggle; error set/clear.
  - **Acceptance Criteria**: Every exported action has at least one direct assertion.
  - **Verification**: `npm run test -- analysisStore` passes.
  - **Dependencies**: T020

- [ ] T026 Hook test: `useAnalysis.ts` against mocked `analysisService`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/__tests__/useAnalysis.test.tsx`
  - **Goal**: Each of the six hooks tested against a mocked `analysisService`, asserting correct query-key invalidation per `client-api.md` (including the `resultLayerId`-present-vs-absent branch for `useRunAnalysis`).
  - **Acceptance Criteria**: `useDeleteAnalysisRun` is asserted to NOT invalidate `database`'s layer query key.
  - **Verification**: `npm run test -- useAnalysis` passes.
  - **Dependencies**: T022

- [ ] T027 API test: list/get/delete/rerun-shell against the real test database
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/analysis.api.test.ts`, `app/api/analysis/[runId]/__tests__/analysisRun.api.test.ts`
  - **Goal**: Skip-if-unavailable tests seeding `AnalysisRun` rows directly via `prismaClient` (bypassing the not-yet-implemented dispatch map) to exercise list (pagination + `batchId` filter), get, delete (result-layer untouched), and rerun's missing-input-rejection and unregistered-operationType paths.
  - **Acceptance Criteria**: All paths pass or skip cleanly; deleting a run with a `resultLayerId` leaves that layer's row intact.
  - **Verification**: `npm run test -- analysis.api` / `analysisRun.api` pass or skip cleanly.
  - **Dependencies**: T007–T019

- [ ] T028 API test: cross-owner security spot-check for every Foundational endpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/analysis.security.test.ts`
  - **Goal**: Every one of the five new endpoints returns `404` (never `401`/`403`) for a project/run owned by a different user — matching 003/004's established non-disclosure pattern.
  - **Acceptance Criteria**: All five endpoints covered.
  - **Verification**: `npm run test -- analysis.security` passes or skips cleanly.
  - **Dependencies**: T007–T019

- [ ] T029 **Checkpoint** — Foundational quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the entire shared repository/route/store/service/hook layer is sound before any user story registers an operation.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T028 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T007–T028

---

## Phase 3: User Story 1 - Buffer and Proximity Analysis (Priority: P1) 🎯 MVP

**Goal**: Buffer, Near Analysis, and Distance Matrix, end to end.

**Independent Test**: Select a layer, run Buffer with a distance, confirm a new layer with correctly-buffered geometry appears — independent of every other operation.

- [ ] T030 [P] [US1] `analysisOperations.ts` — `buildBufferSql`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Buffer(geom, distance)` per feature in the input layer, distance normalized to meters from the request's `unit` (Research Decision 4).
  - **Acceptance Criteria**: Output geometry passes `ST_IsValid`; distance unit conversion is correct for all four supported units.
  - **Verification**: Covered by T038.
  - **Dependencies**: T011

- [ ] T031 [P] [US1] `analysisOperations.ts` — `buildNearAnalysisSql`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: For each source feature, `ST_Distance` ordered `LIMIT 1` against the reference layer (optionally filtered by `ST_DWithin` when `maxDistance` is given), returning the nearest reference id + distance per source feature.
  - **Acceptance Criteria**: A source feature with no reference feature within `maxDistance` (when given) is reported as having no match, not an error.
  - **Verification**: Covered by T038.
  - **Dependencies**: T011

- [ ] T032 [P] [US1] `analysisOperations.ts` — `buildDistanceMatrixSql`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: Cross-joined `ST_Distance(a, b)` across both input sets, capped at 500×500 pairs (Research Decision 7), producing a tabular result for `resultData`.
  - **Acceptance Criteria**: A request whose cross product exceeds the cap is rejected as `INVALID_INPUT` before any query runs.
  - **Verification**: Covered by T038.
  - **Dependencies**: T011

- [ ] T033 [US1] Register `buffer`/`nearAnalysis`/`distanceMatrix` in `createAnalysisRun`'s dispatch map
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Wire T030–T032's builders into T010's dispatch map; `distanceMatrix` writes to `resultData`, `buffer`/`nearAnalysis` produce/update via the existing `createFeature`/`updateFeature` insert path.
  - **Acceptance Criteria**: `POST .../analysis` with `operationType: "buffer"` now succeeds end to end.
  - **Verification**: Covered by T039–T040.
  - **Dependencies**: T010, T030, T031, T032

- [ ] T034 [US1] `OperationPicker.tsx`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/OperationPicker.tsx`
  - **Goal**: shadcn-based control to choose an operation type and stage input layer(s) via `analysisStore`, reading available layers from `database`'s `useLayers` (via its public barrel).
  - **Acceptance Criteria**: Selecting an operation updates `analysisStore.selectedOperationType`; staged inputs respect the operation's required input count.
  - **Verification**: Covered by T041.
  - **Dependencies**: T020

- [ ] T035 [US1] `ParameterForm.tsx`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/ParameterForm.tsx`
  - **Goal**: Renders the correct input fields for the currently-selected operation type's `parameters` shape (starting with Buffer's `distance`/`unit`; extended per later user story phase); writes to `analysisStore.draftParameters`.
  - **Acceptance Criteria**: Submitting calls `useRunAnalysis` with `analysisStore`'s current `selectedOperationType`/`draftParameters`/`stagedInputLayerIds`.
  - **Verification**: Covered by T041.
  - **Dependencies**: T020, T022, T034

- [ ] T036 [US1] `BufferProximityPanel.tsx`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/BufferProximityPanel.tsx`
  - **Goal**: Hosts `OperationPicker` + `ParameterForm` scoped to Buffer/Near Analysis/Distance Matrix, plus a result summary area.
  - **Acceptance Criteria**: A successful Buffer submission clears the form and shows a success indicator.
  - **Verification**: Covered by T041.
  - **Dependencies**: T034, T035

- [ ] T037 [US1] `DistanceMatrixTable.tsx`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/DistanceMatrixTable.tsx`
  - **Goal**: Renders a Distance Matrix run's `resultData` as a table; exposes a download/export action.
  - **Acceptance Criteria**: Renders correctly for an empty result and a populated one.
  - **Verification**: Covered by T041.
  - **Dependencies**: T022

- [ ] T038 [P] [US1] Unit test: Buffer/Near Analysis/Distance Matrix SQL builders
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/server/repositories/__tests__/analysisOperations.test.ts`
  - **Goal**: Assert the generated `Prisma.Sql` text/params for `buildBufferSql`/`buildNearAnalysisSql`/`buildDistanceMatrixSql` across each supported unit and the `maxDistance`-present/absent branches.
  - **Acceptance Criteria**: All three builders covered independently of a live database.
  - **Verification**: `npm run test -- analysisOperations` passes.
  - **Dependencies**: T030, T031, T032

- [ ] T039 [US1] API test: Buffer success + rejection paths
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/buffer.api.test.ts`
  - **Goal**: Against the real test database: successful buffer on a polygon layer produces a new, valid layer; empty input layer and an oversized input are both rejected before processing.
  - **Acceptance Criteria**: Matches spec.md User Story 1's acceptance scenario 1.
  - **Verification**: `npm run test -- buffer.api` passes or skips cleanly.
  - **Dependencies**: T033

- [ ] T040 [US1] API test: Near Analysis + Distance Matrix
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/proximity.api.test.ts`
  - **Goal**: Against the real test database: Near Analysis annotates each source feature with nearest id/distance; Distance Matrix produces the full pairwise table and rejects an oversized cross product.
  - **Acceptance Criteria**: Matches spec.md User Story 1's acceptance scenarios 2–3.
  - **Verification**: `npm run test -- proximity.api` passes or skips cleanly.
  - **Dependencies**: T033

- [ ] T041 [US1] Component test: `OperationPicker`, `ParameterForm` (Buffer fields), `BufferProximityPanel`, `DistanceMatrixTable`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/analysis/__tests__/BufferProximityPanel.test.tsx`, `src/features/analysis/__tests__/DistanceMatrixTable.test.tsx`
  - **Goal**: Cover operation selection, parameter entry, submission wiring, and table rendering.
  - **Acceptance Criteria**: Both files' tests pass against mocked `analysisService`.
  - **Verification**: `npm run test -- BufferProximityPanel DistanceMatrixTable` passes.
  - **Dependencies**: T036, T037

- [ ] T042 [US1] Integration test: Buffer → new layer appears in `database`'s Layer Tree
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/analysis/__tests__/bufferToLayer.integration.test.tsx`
  - **Goal**: Confirm `useRunAnalysis`'s success invalidates `database`'s `queryKeys.layers`, and a subsequent `useLayers` read includes the new layer — a genuine cross-feature integration check.
  - **Acceptance Criteria**: Matches FR-029.
  - **Verification**: `npm run test -- bufferToLayer.integration` passes.
  - **Dependencies**: T033, T036

- [ ] T043 [US1] Accessibility check: `OperationPicker`/`ParameterForm`/`BufferProximityPanel`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/analysis/__tests__/BufferProximityPanel.test.tsx` (extended)
  - **Goal**: Every control keyboard-operable with an accessible name; live result region uses `aria-live="polite"`.
  - **Acceptance Criteria**: Zero critical/serious findings (WCAG 2.2 AA baseline).
  - **Verification**: Manual/code review, consistent with 004's accessibility-audit approach (no axe dependency added — see Polish phase T128).
  - **Dependencies**: T036

- [ ] T044 **Checkpoint** — US1 quality gate
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: N/A
  - **Goal**: Confirm Buffer/Near Analysis/Distance Matrix are fully functional and independently testable — the MVP slice.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T043 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T030–T043

---

## Phase 4: User Story 2 - Overlay and Set Operations (Priority: P2)

**Goal**: Intersect, Union, Difference, Clip, Dissolve, Merge, Split.

**Independent Test**: Select two overlapping polygon layers, run Intersect, confirm a new layer with only the overlapping area — independent of Buffer/Proximity.

- [ ] T045 [P] [US2] `analysisOperations.ts` — `buildIntersectSql`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Intersection(a, b)` filtered by `ST_Intersects`, per feature pair.
  - **Acceptance Criteria**: Two non-overlapping layers produce a valid, empty result layer, not an error (spec.md Edge Cases).
  - **Verification**: Covered by T054.
  - **Dependencies**: T011

- [ ] T046 [P] [US2] `analysisOperations.ts` — `buildUnionSql`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Union(geom)` aggregate across both input layers' features.
  - **Acceptance Criteria**: Overlapping areas represented once in the output.
  - **Verification**: Covered by T054.
  - **Dependencies**: T011

- [ ] T047 [P] [US2] `analysisOperations.ts` — `buildDifferenceSql`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Difference(a, b)`.
  - **Acceptance Criteria**: Result contains only the portion of layer A not covered by layer B.
  - **Verification**: Covered by T054.
  - **Dependencies**: T011

- [ ] T048 [P] [US2] `analysisOperations.ts` — `buildClipSql`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Intersection(target, clipBoundary)` — Clip is Intersect with a fixed second-operand role (Research Decision 4); reuses `buildIntersectSql`'s core logic internally rather than duplicating it.
  - **Acceptance Criteria**: Result contains only the portion of the target layer inside the clip boundary.
  - **Verification**: Covered by T054.
  - **Dependencies**: T045

- [ ] T049 [P] [US2] `analysisOperations.ts` — `buildDissolveSql`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Union(geom)` grouped by the chosen `attributeKey`'s value.
  - **Acceptance Criteria**: A missing `attributeKey` on the input layer is rejected with a message naming it, before any query runs (spec.md Edge Cases).
  - **Verification**: Covered by T054.
  - **Dependencies**: T011

- [ ] T050 [P] [US2] `analysisOperations.ts` — `buildMergeSql`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `UNION ALL` of the input layers' feature rows unchanged — concatenation only, no geometry function.
  - **Acceptance Criteria**: Rejects two layers with incompatible geometry types before any insert (spec.md Edge Cases).
  - **Verification**: Covered by T054.
  - **Dependencies**: T011

- [ ] T051 [P] [US2] `analysisOperations.ts` — `buildSplitSql`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Split(target, blade)`.
  - **Acceptance Criteria**: Output features pass `ST_IsValid`.
  - **Verification**: Covered by T054.
  - **Dependencies**: T011

- [ ] T052 [US2] Register overlay operations in `createAnalysisRun`'s dispatch map
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Wire T045–T051 into T010's dispatch map.
  - **Acceptance Criteria**: All seven operation types now succeed end to end via `POST .../analysis`.
  - **Verification**: Covered by T055–T056.
  - **Dependencies**: T010, T045–T051

- [ ] T053 [US2] `OverlayPanel.tsx`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/OverlayPanel.tsx`
  - **Goal**: One shared UI for all seven overlay operations, reusing `OperationPicker`/`ParameterForm`; shows the `attributeKey` field only for Dissolve, and the correct 1/2/2+ input-count requirement per operation.
  - **Acceptance Criteria**: Switching operation type updates the required input count and visible parameter fields.
  - **Verification**: Covered by T057.
  - **Dependencies**: T034, T035

- [ ] T054 [P] [US2] Unit test: seven overlay SQL builders
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/__tests__/analysisOperations.test.ts` (extended)
  - **Goal**: Assert generated SQL/params for Intersect/Union/Difference/Clip/Dissolve/Merge/Split, including Dissolve's missing-attribute rejection and Merge's geometry-type-mismatch rejection.
  - **Acceptance Criteria**: All seven builders covered.
  - **Verification**: `npm run test -- analysisOperations` passes.
  - **Dependencies**: T045–T051

- [ ] T055 [US2] API test: Intersect/Union/Difference/Clip
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/overlay.api.test.ts`
  - **Goal**: Against the real test database, matching spec.md User Story 2's acceptance scenarios 1–3, plus the empty-intersection edge case.
  - **Acceptance Criteria**: All four operations covered.
  - **Verification**: `npm run test -- overlay.api` passes or skips cleanly.
  - **Dependencies**: T052

- [ ] T056 [US2] API test: Dissolve/Merge/Split
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/overlaySet.api.test.ts`
  - **Goal**: Against the real test database, matching spec.md User Story 2's acceptance scenarios 4–6.
  - **Acceptance Criteria**: All three operations covered, including Dissolve's missing-attribute and Merge's geometry-mismatch rejections.
  - **Verification**: `npm run test -- overlaySet.api` passes or skips cleanly.
  - **Dependencies**: T052

- [ ] T057 [US2] Component test: `OverlayPanel`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/analysis/__tests__/OverlayPanel.test.tsx`
  - **Goal**: Operation switching, Dissolve's attribute field, correct input-count enforcement.
  - **Acceptance Criteria**: All seven operation types render their correct fields.
  - **Verification**: `npm run test -- OverlayPanel` passes.
  - **Dependencies**: T053

- [ ] T058 [US2] Integration test: Intersect two layers → correctly-extented new layer
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/analysis/__tests__/overlayToLayer.integration.test.tsx`
  - **Goal**: End-to-end submission → layer-tree update, mirroring T042's pattern for a two-input operation.
  - **Acceptance Criteria**: New layer's extent matches the expected overlap.
  - **Verification**: `npm run test -- overlayToLayer.integration` passes.
  - **Dependencies**: T052, T053

- [ ] T059 [US2] Accessibility check: `OverlayPanel`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/analysis/__tests__/OverlayPanel.test.tsx` (extended)
  - **Goal**: Same baseline as T043, scoped to `OverlayPanel`'s controls.
  - **Acceptance Criteria**: Zero critical/serious findings.
  - **Verification**: Manual/code review.
  - **Dependencies**: T053

- [ ] T060 **Checkpoint** — US2 quality gate
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A
  - **Goal**: Confirm all seven overlay operations are fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T059 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T045–T059

---

## Phase 5: User Story 3 - Measurement and Derived Geometry (Priority: P3)

**Goal**: Area, Length, Centroid, Convex Hull, Bounding Box.

**Independent Test**: Select a polygon layer, request Area Calculation, confirm each feature reports a correct area — independent of overlay/proximity.

- [ ] T061 [P] [US3] `analysisOperations.ts` — `buildAreaSql`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Area(geog)` (cast to `geography` for a metric result at any latitude), attribute-attach path (no new layer).
  - **Acceptance Criteria**: Result matches spec.md User Story 3's acceptance scenario 1's unit/threshold expectations.
  - **Verification**: Covered by T068.
  - **Dependencies**: T011

- [ ] T062 [P] [US3] `analysisOperations.ts` — `buildLengthSql`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Length(geog)`, attribute-attach path.
  - **Acceptance Criteria**: Matches acceptance scenario 2.
  - **Verification**: Covered by T068.
  - **Dependencies**: T011

- [ ] T063 [P] [US3] `analysisOperations.ts` — `buildCentroidSql`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Centroid(geom)`, new-point-feature path.
  - **Acceptance Criteria**: Matches acceptance scenario 3.
  - **Verification**: Covered by T068.
  - **Dependencies**: T011

- [ ] T064 [P] [US3] `analysisOperations.ts` — `buildConvexHullSql`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_ConvexHull(ST_Collect(geom))`.
  - **Acceptance Criteria**: Matches acceptance scenario 4.
  - **Verification**: Covered by T068.
  - **Dependencies**: T011

- [ ] T065 [P] [US3] `analysisOperations.ts` — `buildBoundingBoxSql`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Envelope(ST_Collect(geom))`.
  - **Acceptance Criteria**: Matches acceptance scenario 5.
  - **Verification**: Covered by T068.
  - **Dependencies**: T011

- [ ] T066 [US3] Register measurement operations in the dispatch map
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Wire T061–T065 into T010's dispatch map; Area/Length write via the existing `updateFeature` attribute path (Constitution: reuse, no duplicate mutation path), Centroid/Convex Hull/Bounding Box via the new-layer path.
  - **Acceptance Criteria**: All five operation types succeed end to end.
  - **Verification**: Covered by T069–T070.
  - **Dependencies**: T010, T061–T065

- [ ] T067 [US3] `MeasurementPanel.tsx`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasurementPanel.tsx`
  - **Goal**: UI for all five measurement operations, reusing `OperationPicker`/`ParameterForm` (none of these five take extra parameters beyond input selection).
  - **Acceptance Criteria**: Result display distinguishes the attribute-attach operations (Area/Length) from the new-layer ones.
  - **Verification**: Covered by T071.
  - **Dependencies**: T034, T035

- [ ] T068 [P] [US3] Unit test: five measurement SQL builders
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/__tests__/analysisOperations.test.ts` (extended)
  - **Goal**: Assert generated SQL for Area/Length/Centroid/Convex Hull/Bounding Box.
  - **Acceptance Criteria**: All five covered.
  - **Verification**: `npm run test -- analysisOperations` passes.
  - **Dependencies**: T061–T065

- [ ] T069 [US3] API test: Area/Length (attribute-attach path)
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/measurement.api.test.ts`
  - **Goal**: Against the real test database — confirm the value is attached without creating a new layer and without altering geometry.
  - **Acceptance Criteria**: Matches acceptance scenarios 1–2.
  - **Verification**: `npm run test -- measurement.api` passes or skips cleanly.
  - **Dependencies**: T066

- [ ] T070 [US3] API test: Centroid/Convex Hull/Bounding Box (new-layer path)
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/derivedGeometry.api.test.ts`
  - **Goal**: Against the real test database — confirm each produces a correctly-shaped new feature in a new layer.
  - **Acceptance Criteria**: Matches acceptance scenarios 3–5.
  - **Verification**: `npm run test -- derivedGeometry.api` passes or skips cleanly.
  - **Dependencies**: T066

- [ ] T071 [US3] Component test: `MeasurementPanel`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/analysis/__tests__/MeasurementPanel.test.tsx`
  - **Goal**: All five operations selectable and submittable; result display correctly branches attribute-attach vs. new-layer.
  - **Acceptance Criteria**: Covered as above.
  - **Verification**: `npm run test -- MeasurementPanel` passes.
  - **Dependencies**: T067

- [ ] T072 [US3] Integration test: Area Calculation attaches a value without altering geometry
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/analysis/__tests__/measurementAttach.integration.test.tsx`
  - **Goal**: Confirm the feature's geometry is byte-identical before/after, only its attributes change.
  - **Acceptance Criteria**: Matches FR-011/FR-012's "attribute-attach, not layer-producing" design.
  - **Verification**: `npm run test -- measurementAttach.integration` passes.
  - **Dependencies**: T066

- [ ] T073 [US3] Accessibility check: `MeasurementPanel`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/analysis/__tests__/MeasurementPanel.test.tsx` (extended)
  - **Goal**: Same baseline as T043/T059.
  - **Acceptance Criteria**: Zero critical/serious findings.
  - **Verification**: Manual/code review.
  - **Dependencies**: T067

- [ ] T074 **Checkpoint** — US3 quality gate
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: N/A
  - **Goal**: Confirm all five measurement operations are fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T073 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T061–T073

---

## Phase 6: User Story 4 - Spatial Relationship Queries (Priority: P4)

**Goal**: Point in Polygon, Spatial Join.

**Independent Test**: Select a point layer and a polygon layer, run Point in Polygon, confirm each point is correctly annotated — independent of overlay operations.

- [ ] T075 [P] [US4] `analysisOperations.ts` — `buildPointInPolygonSql`
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Within(point, polygon)` per point feature, attribute-attach path (annotates each point with its containing polygon's id, or "none").
  - **Acceptance Criteria**: Matches spec.md User Story 4's acceptance scenario 1.
  - **Verification**: Covered by T079.
  - **Dependencies**: T011

- [ ] T076 [P] [US4] `analysisOperations.ts` — `buildSpatialJoinSql`
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: Dispatches by `parameters.relationship` to `ST_Intersects`/`ST_Within`/`ST_Contains`/`ST_DWithin`-nearest; new-layer path combining target geometry with matched source attributes.
  - **Acceptance Criteria**: All four relationship types covered.
  - **Verification**: Covered by T079.
  - **Dependencies**: T011

- [ ] T077 [US4] Register relationship operations in the dispatch map
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Wire T075–T076 into T010's dispatch map.
  - **Acceptance Criteria**: Both operation types succeed end to end.
  - **Verification**: Covered by T080–T081.
  - **Dependencies**: T010, T075, T076

- [ ] T078 [US4] `RelationshipPanel.tsx`
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/analysis/components/RelationshipPanel.tsx`
  - **Goal**: UI for Point in Polygon and Spatial Join, the latter exposing the `relationship` selector.
  - **Acceptance Criteria**: Relationship selector only appears for Spatial Join.
  - **Verification**: Covered by T082.
  - **Dependencies**: T034, T035

- [ ] T079 [P] [US4] Unit test: Point in Polygon / Spatial Join SQL builders
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/server/repositories/__tests__/analysisOperations.test.ts` (extended)
  - **Goal**: Assert generated SQL for both operations, including all four Spatial Join relationship variants.
  - **Acceptance Criteria**: All variants covered.
  - **Verification**: `npm run test -- analysisOperations` passes.
  - **Dependencies**: T075, T076

- [ ] T080 [US4] API test: Point in Polygon
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/pointInPolygon.api.test.ts`
  - **Goal**: Against the real test database, matching acceptance scenario 1, including a point with no containing polygon.
  - **Acceptance Criteria**: Covered.
  - **Verification**: `npm run test -- pointInPolygon.api` passes or skips cleanly.
  - **Dependencies**: T077

- [ ] T081 [US4] API test: Spatial Join (all four relationship types)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/spatialJoin.api.test.ts`
  - **Goal**: Against the real test database, matching acceptance scenario 2.
  - **Acceptance Criteria**: All four relationships covered.
  - **Verification**: `npm run test -- spatialJoin.api` passes or skips cleanly.
  - **Dependencies**: T077

- [ ] T082 [US4] Component test: `RelationshipPanel`
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/analysis/__tests__/RelationshipPanel.test.tsx`
  - **Goal**: Both operations selectable; relationship selector conditionally rendered.
  - **Acceptance Criteria**: Covered as above.
  - **Verification**: `npm run test -- RelationshipPanel` passes.
  - **Dependencies**: T078

- [ ] T083 [US4] Integration test: Spatial Join produces a correctly-joined layer
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/analysis/__tests__/spatialJoinToLayer.integration.test.tsx`
  - **Goal**: End-to-end submission → layer-tree update, confirming joined attributes are present.
  - **Acceptance Criteria**: Matches FR-017.
  - **Verification**: `npm run test -- spatialJoinToLayer.integration` passes.
  - **Dependencies**: T077, T078

- [ ] T084 [US4] Accessibility check: `RelationshipPanel`
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/analysis/__tests__/RelationshipPanel.test.tsx` (extended)
  - **Goal**: Same baseline as prior phases.
  - **Acceptance Criteria**: Zero critical/serious findings.
  - **Verification**: Manual/code review.
  - **Dependencies**: T078

- [ ] T085 **Checkpoint** — US4 quality gate
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: N/A
  - **Goal**: Confirm both relationship-query operations are fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T084 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T075–T084

---

## Phase 7: User Story 5 - Coordinate System Conversion (Priority: P5)

**Goal**: Coordinate Conversion, CRS Transformation.

**Independent Test**: Submit a coordinate pair with a named source CRS, confirm the converted coordinate lands at the expected location — independent of every other operation.

- [ ] T086 [P] [US5] `analysisOperations.ts` — `buildCoordinateConversionSql`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Transform(ST_SetSRID(ST_MakePoint(x, y), sourceSrid), 4326)` per submitted coordinate — no input layer, `resultData` only (Research Decision 8).
  - **Acceptance Criteria**: An unsupported `sourceCrs` is rejected with a message identifying it, before any query runs.
  - **Verification**: Covered by T090.
  - **Dependencies**: T011

- [ ] T087 [P] [US5] `analysisOperations.ts` — `buildCrsTransformationSql`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Transform(geom, targetSrid)` for export/display only — writes to `resultData`, never rewrites `Feature.geometry` (Constitution GIS Principle IV; Research Decision 8).
  - **Acceptance Criteria**: The layer's stored geometry is confirmed byte-identical before/after.
  - **Verification**: Covered by T090, T092.
  - **Dependencies**: T011

- [ ] T088 [US5] Register CRS operations in the dispatch map
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Wire T086–T087 into T010's dispatch map.
  - **Acceptance Criteria**: Both operation types succeed end to end.
  - **Verification**: Covered by T091–T092.
  - **Dependencies**: T010, T086, T087

- [ ] T089 [US5] `CrsConversionPanel.tsx`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/analysis/components/CrsConversionPanel.tsx`
  - **Goal**: UI for both Coordinate Conversion (raw coordinate input) and CRS Transformation (layer + target CRS export/preview).
  - **Acceptance Criteria**: Coordinate Conversion never shows a layer picker; CRS Transformation never shows a raw coordinate input.
  - **Verification**: Covered by T093.
  - **Dependencies**: T034, T035

- [ ] T090 [P] [US5] Unit test: Coordinate Conversion / CRS Transformation SQL builders
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/server/repositories/__tests__/analysisOperations.test.ts` (extended)
  - **Goal**: Assert generated SQL against a known reference point (matching SC-006's accuracy requirement) for both builders.
  - **Acceptance Criteria**: Both covered.
  - **Verification**: `npm run test -- analysisOperations` passes.
  - **Dependencies**: T086, T087

- [ ] T091 [US5] API test: Coordinate Conversion accuracy
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/coordinateConversion.api.test.ts`
  - **Goal**: Against the real test database, verify a known source-CRS coordinate converts to the expected WGS84 location within source precision.
  - **Acceptance Criteria**: Matches SC-006.
  - **Verification**: `npm run test -- coordinateConversion.api` passes or skips cleanly.
  - **Dependencies**: T088

- [ ] T092 [US5] API test: CRS Transformation leaves stored geometry unchanged
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/crsTransformation.api.test.ts`
  - **Goal**: Against the real test database, fetch a layer's features before and after a CRS Transformation export request; assert byte-identical stored geometry.
  - **Acceptance Criteria**: Matches acceptance scenario 2.
  - **Verification**: `npm run test -- crsTransformation.api` passes or skips cleanly.
  - **Dependencies**: T088

- [ ] T093 [US5] Component test: `CrsConversionPanel`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/analysis/__tests__/CrsConversionPanel.test.tsx`
  - **Goal**: Both modes render their correct, mutually-exclusive fields.
  - **Acceptance Criteria**: Covered as above.
  - **Verification**: `npm run test -- CrsConversionPanel` passes.
  - **Dependencies**: T089

- [ ] T094 [US5] Integration test: CRS Transformation export doesn't mutate stored geometry
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/analysis/__tests__/crsExport.integration.test.tsx`
  - **Goal**: End-to-end UI submission → confirm the export/preview reflects transformed coordinates while `database`'s own feature cache is untouched.
  - **Acceptance Criteria**: Matches FR-019.
  - **Verification**: `npm run test -- crsExport.integration` passes.
  - **Dependencies**: T088, T089

- [ ] T095 [US5] Accessibility check: `CrsConversionPanel`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/analysis/__tests__/CrsConversionPanel.test.tsx` (extended)
  - **Goal**: Same baseline as prior phases.
  - **Acceptance Criteria**: Zero critical/serious findings.
  - **Verification**: Manual/code review.
  - **Dependencies**: T089

- [ ] T096 **Checkpoint** — US5 quality gate
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: N/A
  - **Goal**: Confirm both CRS operations are fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T095 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T086–T095

---

## Phase 8: User Story 6 - Density and Heatmap Visualization (Priority: P6)

**Goal**: Heatmap (client-side only), Density Analysis (persisted).

**Independent Test**: Select a point layer, enable Heatmap, confirm a density-shaded overlay renders with no new layer created — independent of every other operation.

- [ ] T097 [US6] `HeatmapLayer.tsx`
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/analysis/components/HeatmapLayer.tsx`
  - **Goal**: Client-side-only rendering over `database`'s existing `useFeatures` cache via Turf.js, matching `MeasurementToolbar`'s transient-rendering precedent (Research Decision 9) — no Route Handler, no `analysisService` call.
  - **Acceptance Criteria**: Enabling Heatmap makes zero network requests.
  - **Verification**: Covered by T101.
  - **Dependencies**: None (reads `database`'s barrel directly)

- [ ] T098 [P] [US6] `analysisOperations.ts` — `buildDensityAnalysisSql`
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts`
  - **Goal**: `ST_Collect` + `ST_SquareGrid`/`ST_HexagonGrid` (PostGIS ≥ 3.1) with a per-cell count aggregate; new-layer path.
  - **Acceptance Criteria**: On a PostGIS version lacking grid functions, the operation is rejected with a clear, specific message (not a generic database error).
  - **Verification**: Covered by T102.
  - **Dependencies**: T011

- [ ] T099 [US6] Register `densityAnalysis` in the dispatch map
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Wire T098 into T010's dispatch map.
  - **Acceptance Criteria**: Operation succeeds end to end where PostGIS ≥ 3.1 is available.
  - **Verification**: Covered by T103.
  - **Dependencies**: T010, T098

- [ ] T100 [US6] `DensityAnalysisPanel.tsx`
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/analysis/components/DensityAnalysisPanel.tsx`
  - **Goal**: UI for Density Analysis, reusing `OperationPicker`/`ParameterForm` with `cellSize`/`unit` fields.
  - **Acceptance Criteria**: Submission calls `useRunAnalysis` with `operationType: "densityAnalysis"`.
  - **Verification**: Covered by T104.
  - **Dependencies**: T034, T035

- [ ] T101 [US6] Component test: `HeatmapLayer` renders without a network call
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/analysis/__tests__/HeatmapLayer.test.tsx`
  - **Goal**: Mount over a mocked `database` feature cache; assert no `analysisService`/`featureService` network method is called.
  - **Acceptance Criteria**: Matches Research Decision 9.
  - **Verification**: `npm run test -- HeatmapLayer` passes.
  - **Dependencies**: T097

- [ ] T102 [P] [US6] Unit test: `buildDensityAnalysisSql`
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/server/repositories/__tests__/analysisOperations.test.ts` (extended)
  - **Goal**: Assert generated SQL for both grid types and the unsupported-PostGIS-version rejection path.
  - **Acceptance Criteria**: Covered.
  - **Verification**: `npm run test -- analysisOperations` passes.
  - **Dependencies**: T098

- [ ] T103 [US6] API test: Density Analysis
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/densityAnalysis.api.test.ts`
  - **Goal**: Against the real test database (additionally skip-if-PostGIS-version-insufficient); confirm a new grid/contour layer is produced.
  - **Acceptance Criteria**: Matches acceptance scenario 2.
  - **Verification**: `npm run test -- densityAnalysis.api` passes or skips cleanly.
  - **Dependencies**: T099

- [ ] T104 [US6] Component test: `DensityAnalysisPanel`
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/analysis/__tests__/DensityAnalysisPanel.test.tsx`
  - **Goal**: Parameter entry and submission wiring.
  - **Acceptance Criteria**: Covered as above.
  - **Verification**: `npm run test -- DensityAnalysisPanel` passes.
  - **Dependencies**: T100

- [ ] T105 [US6] Integration test: Heatmap creates no layer; Density Analysis creates one
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/analysis/__tests__/densityVsHeatmap.integration.test.tsx`
  - **Goal**: Confirm the two capabilities' fundamentally different persistence behavior in one comparative test.
  - **Acceptance Criteria**: Matches acceptance scenarios 1–2.
  - **Verification**: `npm run test -- densityVsHeatmap.integration` passes.
  - **Dependencies**: T097, T099

- [ ] T106 [US6] Accessibility check: `DensityAnalysisPanel` + Heatmap toggle control
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/analysis/__tests__/DensityAnalysisPanel.test.tsx` (extended)
  - **Goal**: Same baseline as prior phases.
  - **Acceptance Criteria**: Zero critical/serious findings.
  - **Verification**: Manual/code review.
  - **Dependencies**: T100

- [ ] T107 **Checkpoint** — US6 quality gate
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: N/A
  - **Goal**: Confirm Heatmap and Density Analysis are both fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T106 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T097–T106

---

## Phase 9: User Story 7 - Batch Processing (Priority: P7)

**Goal**: Apply one operation across multiple inputs in one submission.

**Independent Test**: Select three layers and submit one Buffer batch run, confirm three correctly-buffered output layers are created from one submission.

- [ ] T108 [US7] `analysisRepository.createBatchRun` full implementation
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Activate T018's shell against a real registered operation (Buffer, from US1) — confirm per-item independence: one item's failure (e.g., wrong geometry type) does not abort the others.
  - **Acceptance Criteria**: Matches FR-022/FR-023.
  - **Verification**: Covered by T112–T113.
  - **Dependencies**: T018, T033

- [ ] T109 [US7] Activate the batch Route Handler end to end
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `app/api/projects/[projectId]/analysis/batch/route.ts`
  - **Goal**: Confirm T019's handler now returns real per-item results via T108.
  - **Acceptance Criteria**: Matches `api-contracts.md`'s batch response contract.
  - **Verification**: Covered by T112–T113.
  - **Dependencies**: T019, T108

- [ ] T110 [US7] `BatchRunPanel.tsx`
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/analysis/components/BatchRunPanel.tsx`
  - **Goal**: Reuses `OperationPicker`/`ParameterForm` for the shared operation/parameters, lets the user stage multiple independent input sets, calls `useRunBatchAnalysis`, renders one row per item with its own status/result.
  - **Acceptance Criteria**: Matches acceptance scenario 1.
  - **Verification**: Covered by T114.
  - **Dependencies**: T022, T034, T035

- [ ] T111 [US7] Unit test: `createBatchRun` per-item independence
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/server/repositories/__tests__/analysisRepository.test.ts`
  - **Goal**: Mock one item to throw; assert the other items still return their real, independent outcomes.
  - **Acceptance Criteria**: Covered.
  - **Verification**: `npm run test -- analysisRepository` passes.
  - **Dependencies**: T108

- [ ] T112 [US7] API test: batch success (3 valid inputs)
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/batch.api.test.ts`
  - **Goal**: Against the real test database — 3-layer Buffer batch, confirm 3 independent output layers.
  - **Acceptance Criteria**: Matches acceptance scenario 1.
  - **Verification**: `npm run test -- batch.api` passes or skips cleanly.
  - **Dependencies**: T109

- [ ] T113 [US7] API test: batch partial failure (1 invalid among 3)
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/batchPartialFailure.api.test.ts`
  - **Goal**: Against the real test database — one item with an incompatible geometry type reports `status: "failed"` with a specific reason; the other two still complete.
  - **Acceptance Criteria**: Matches acceptance scenario 2 / FR-023.
  - **Verification**: `npm run test -- batchPartialFailure.api` passes or skips cleanly.
  - **Dependencies**: T109

- [ ] T114 [US7] Component test: `BatchRunPanel` per-item status rendering
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/analysis/__tests__/BatchRunPanel.test.tsx`
  - **Goal**: Renders a mix of succeeded/failed items correctly, each with its own message.
  - **Acceptance Criteria**: Covered as above.
  - **Verification**: `npm run test -- BatchRunPanel` passes.
  - **Dependencies**: T110

- [ ] T115 [US7] Integration test: 3-item batch → 3 layers created independently
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/analysis/__tests__/batchToLayers.integration.test.tsx`
  - **Goal**: End-to-end UI submission → confirm `database`'s Layer Tree gains exactly 3 new layers.
  - **Acceptance Criteria**: Matches acceptance scenario 1.
  - **Verification**: `npm run test -- batchToLayers.integration` passes.
  - **Dependencies**: T109, T110

- [ ] T116 [US7] Accessibility check: `BatchRunPanel`
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/analysis/__tests__/BatchRunPanel.test.tsx` (extended)
  - **Goal**: Same baseline as prior phases, including per-item status announced via `aria-live`.
  - **Acceptance Criteria**: Zero critical/serious findings.
  - **Verification**: Manual/code review.
  - **Dependencies**: T110

- [ ] T117 **Checkpoint** — US7 quality gate
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: N/A
  - **Goal**: Confirm Batch Processing is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T116 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T108–T116

---

## Phase 10: User Story 8 - Analysis History (Priority: P8)

**Goal**: View, re-run, and delete past analyses.

**Independent Test**: Run any one analysis operation, confirm it appears in Analysis History with its parameters and result — independent of which operation was run.

- [ ] T118 [US8] `analysisRepository.rerunAnalysis` full implementation
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/server/repositories/analysisRepository.ts`
  - **Goal**: Activate T016's shell against real registered operations — full replay path (not just the missing-input rejection path already covered in Foundational).
  - **Acceptance Criteria**: Matches FR-025.
  - **Verification**: Covered by T122.
  - **Dependencies**: T016, T033

- [ ] T119 [US8] Activate the rerun Route Handler end to end
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `app/api/analysis/[runId]/rerun/route.ts`
  - **Goal**: Confirm T017's handler now returns a real replayed run via T118.
  - **Acceptance Criteria**: New run has a new `id`/`createdAt`; original row unchanged.
  - **Verification**: Covered by T122.
  - **Dependencies**: T017, T118

- [ ] T120 [US8] `AnalysisHistoryPanel.tsx`
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/AnalysisHistoryPanel.tsx`
  - **Goal**: Lists `useAnalysisRuns(projectId)` newest-first; each row exposes Re-run (`useRerunAnalysis`) and Delete (`useDeleteAnalysisRun`); groups rows sharing a `batchId` visually.
  - **Acceptance Criteria**: Matches acceptance scenario 1.
  - **Verification**: Covered by T124.
  - **Dependencies**: T022

- [ ] T121 [US8] Unit test: `rerunAnalysis` missing-input rejection (full path)
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/server/repositories/__tests__/analysisRepository.test.ts` (extended)
  - **Goal**: Extends T027's Foundational-phase shell test now that a real operation exists to replay.
  - **Acceptance Criteria**: Covered.
  - **Verification**: `npm run test -- analysisRepository` passes.
  - **Dependencies**: T118

- [ ] T122 [US8] API test: re-run success + re-run-after-input-deleted 404
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `app/api/analysis/[runId]/__tests__/rerun.api.test.ts`
  - **Goal**: Against the real test database — successful re-run with identical inputs/parameters; re-run after deleting the original input layer rejected with a message naming it.
  - **Acceptance Criteria**: Matches acceptance scenario 2 and spec.md's Edge Cases.
  - **Verification**: `npm run test -- rerun.api` passes or skips cleanly.
  - **Dependencies**: T119

- [ ] T123 [US8] API test: delete history entry doesn't affect result layer
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `app/api/analysis/[runId]/__tests__/deleteHistory.api.test.ts`
  - **Goal**: Against the real test database — delete a run with a `resultLayerId`; confirm the layer and its features still exist afterward.
  - **Acceptance Criteria**: Matches acceptance scenario 3 / FR-026.
  - **Verification**: `npm run test -- deleteHistory.api` passes or skips cleanly.
  - **Dependencies**: T009

- [ ] T124 [US8] Component test: `AnalysisHistoryPanel`
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/analysis/__tests__/AnalysisHistoryPanel.test.tsx`
  - **Goal**: List rendering, re-run action, delete action, `batchId` grouping.
  - **Acceptance Criteria**: Covered as above.
  - **Verification**: `npm run test -- AnalysisHistoryPanel` passes.
  - **Dependencies**: T120

- [ ] T125 [US8] Integration test: full history lifecycle
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/analysis/__tests__/historyLifecycle.integration.test.tsx`
  - **Goal**: Run an operation → confirm it appears in history → re-run it → confirm both entries exist → delete one → confirm its result layer is unaffected.
  - **Acceptance Criteria**: Matches all three of User Story 8's acceptance scenarios in one flow.
  - **Verification**: `npm run test -- historyLifecycle.integration` passes.
  - **Dependencies**: T119, T120

- [ ] T126 [US8] Accessibility check: `AnalysisHistoryPanel`
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/analysis/__tests__/AnalysisHistoryPanel.test.tsx` (extended)
  - **Goal**: Same baseline as prior phases, including row-action keyboard operability.
  - **Acceptance Criteria**: Zero critical/serious findings.
  - **Verification**: Manual/code review.
  - **Dependencies**: T120

- [ ] T127 **Checkpoint** — US8 quality gate
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: N/A
  - **Goal**: Confirm Analysis History (view/re-run/delete) is fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T126 pass, `next build` succeeds.
  - **Verification**: Commands run clean.
  - **Dependencies**: T118–T126

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass across every user story, per Constitution Principles VII/VIII/X.

- [ ] T128 [P] Full accessibility audit across every new panel/dialog/table
  - **Priority**: Must-have
  - **User Story**: None (spec FR — Constitution Additional Standards: Accessibility)
  - **Files**: All components under `src/features/analysis/components/`
  - **Goal**: Re-verify every per-phase accessibility check (T043, T059, T073, T084, T095, T106, T116, T126) together as one consolidated pass; close any remaining gap.
  - **Acceptance Criteria**: Zero critical/serious findings across the entire feature, WCAG 2.2 AA baseline (SC-equivalent to 004's SC-009).
  - **Verification**: Manual/code review consolidated pass.
  - **Dependencies**: T043, T059, T073, T084, T095, T106, T116, T126

- [ ] T129 [P] Performance test: 1,000-feature operation timing (SC-001)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisPerformance.test.ts`
  - **Goal**: Time Buffer, Intersect, and Union against a 1,000-feature layer; confirm each completes within the 15 s budget.
  - **Acceptance Criteria**: All three operations within budget, or the input cap (Technical Context) is tightened and re-verified.
  - **Verification**: `npm run test -- analysisPerformance` passes or skips cleanly (real DB required).
  - **Dependencies**: T033, T052

- [ ] T130 [P] Performance test: 20-item batch timing + per-item reporting (SC-003)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/batchPerformance.api.test.ts`
  - **Goal**: Submit a 20-item Buffer batch; confirm every item reports an outcome with zero silent failures, within a reasonable aggregate time given the sequential-execution trade-off (plan.md Performance Considerations).
  - **Acceptance Criteria**: Matches SC-003.
  - **Verification**: `npm run test -- batchPerformance.api` passes or skips cleanly.
  - **Dependencies**: T108

- [ ] T131 [P] Bundle verification: zero new npm dependency
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: N/A (build output inspection)
  - **Goal**: Confirm `package.json` gained no new dependency for this feature and `HeatmapLayer.tsx` reuses the existing Turf.js already present in the bundle from 004 — no bundle-size regression to investigate.
  - **Acceptance Criteria**: `package.json` diff for this feature shows zero new dependencies.
  - **Verification**: Manual `git diff package.json` review.
  - **Dependencies**: T097

- [ ] T132 [P] Security spot-check: cross-owner 404 across all 5 endpoints (consolidated)
  - **Priority**: Must-have
  - **User Story**: None (Constitution Principle VI)
  - **Files**: `app/api/projects/[projectId]/analysis/__tests__/analysis.security.test.ts` (extended from T028)
  - **Goal**: Re-verify T028's spot-check now that every operation type is registered, covering the batch and rerun endpoints with real operations too.
  - **Acceptance Criteria**: All five endpoints confirmed to return `404`, never `401`/`403`, for cross-owner requests.
  - **Verification**: `npm run test -- analysis.security` passes or skips cleanly.
  - **Dependencies**: T028, T108, T118

- [ ] T133 [P] JSDoc pass
  - **Priority**: Should-have
  - **User Story**: None (Constitution Principle VIII)
  - **Files**: `src/server/repositories/analysisRepository.ts`, `analysisOperations.ts`, `src/features/analysis/services/analysisService.ts`, `hooks/useAnalysis.ts`, `store/analysisStore.ts`
  - **Goal**: Single-line JSDoc summary on every exported function/hook/store action added by this feature, per the same standard applied in 003/004.
  - **Acceptance Criteria**: No exported function introduced by this feature lacks a JSDoc comment.
  - **Verification**: Manual review / code-review checklist.
  - **Dependencies**: T001–T127

- [ ] T134 [P] Feature README
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/README.md`
  - **Goal**: Document purpose, public API (barrel exports), a usage example per user story, and known limitations (synchronous execution with input-size caps, no multi-step pipeline chaining, Heatmap has no persisted representation, Batch Processing executes items sequentially).
  - **Acceptance Criteria**: Every limitation from plan.md's Constraints/Risks is called out explicitly.
  - **Verification**: Manual review.
  - **Dependencies**: T133

- [ ] T135 Full `quickstart.md` run-through (all 10 sections)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual walkthrough against `quickstart.md`)
  - **Goal**: Execute every scenario in `quickstart.md` end to end against a real running instance.
  - **Acceptance Criteria**: Every checklist item in `quickstart.md`'s Production Readiness Checklist passes.
  - **Verification**: Manual run-through; mark BLOCKED for any step requiring browser/Docker tooling unavailable in this environment, per the same convention followed throughout 004's implementation.
  - **Dependencies**: T001–T134

- [ ] T136 Final Constitution Check re-verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/005-spatial-analysis-geoprocessing/plan.md`
  - **Goal**: Re-confirm every principle in plan.md's Constitution Check table against the as-built code (not just the as-planned design).
  - **Acceptance Criteria**: No violation found; any deviation is documented in Complexity Tracking with justification.
  - **Verification**: Manual review against `plan.md`.
  - **Dependencies**: T001–T135

- [ ] T137 Production readiness checklist confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/005-spatial-analysis-geoprocessing/quickstart.md`
  - **Goal**: Confirm every item in `quickstart.md`'s Production Readiness Checklist is checked off with evidence (test names, manual verification notes).
  - **Acceptance Criteria**: All items checked or explicitly marked BLOCKED with a reason.
  - **Verification**: Manual review.
  - **Dependencies**: T135

- [ ] T138 **Checkpoint** — Full-suite final quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the entire feature — all 22 operations, batch processing, and history — passes together as one suite.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, the full test suite (`npm run test`), and `next build` all pass with zero failures (DB-dependent tests pass or skip cleanly, never silently "pass" when they didn't run).
  - **Verification**: `npm run test` full run; `next build`.
  - **Dependencies**: T001–T137

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**.
- **User Stories (Phase 3–10)**: All depend on Foundational completion. US1 (P1) is the MVP slice; US2–US6 (P2–P6) can proceed in parallel once Foundational lands, since each registers its own operations into the shared dispatch map without touching another story's builder functions. US7 (Batch, P7) depends on at least one real operation existing (US1) to batch against. US8 (History, P8) depends on at least one real operation existing (any of US1–US7) to have runs worth listing/re-running.
- **Polish (Phase 11)**: Depends on all user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Foundational only. No dependency on any other story — the MVP.
- **US2 (P2)**: Foundational only. Independently testable from US1.
- **US3 (P3)**: Foundational only. Independently testable from US1/US2.
- **US4 (P4)**: Foundational only. Independently testable from US1–US3.
- **US5 (P5)**: Foundational only. Independently testable from US1–US4.
- **US6 (P6)**: Foundational only. Independently testable from US1–US5.
- **US7 (P7)**: Foundational + at least one operation from US1–US6 registered (uses Buffer from US1 in this plan's tasks, T108).
- **US8 (P8)**: Foundational + at least one operation from US1–US7 registered (uses Buffer from US1 in this plan's tasks, T118).

### Parallel Opportunities

- All Setup tasks marked [P] (T003–T005) can run in parallel.
- Within Foundational, T011 ([P]) is independent of the repository/route tasks; T020/T021 ([P]) are independent of each other and of the repository/route tasks.
- Once Foundational (Phase 2) completes, **US2 through US6 (Phases 4–8) can all proceed in parallel** — each adds its own `analysisOperations.ts` builder functions, its own dispatch-map registration line, and its own UI panel, touching disjoint file regions (aside from the same two shared files, `analysisRepository.ts`/`analysisOperations.ts`, where each phase's additions are append-only and do not conflict with another phase's).
- Every builder-function task marked [P] within a user story phase (e.g., T045–T051 in US2) can run in parallel — each is a new, independent export.
- US7 and US8 should follow after at least US1 lands, since both tasks lists in this plan build their tests against Buffer specifically (though either could be re-pointed at any other already-landed operation).

---

## Parallel Example: User Story 2 (Overlay & Set Operations)

```bash
# Launch all seven overlay builder tasks together:
Task: "buildIntersectSql in src/server/repositories/analysisOperations.ts"
Task: "buildUnionSql in src/server/repositories/analysisOperations.ts"
Task: "buildDifferenceSql in src/server/repositories/analysisOperations.ts"
Task: "buildClipSql in src/server/repositories/analysisOperations.ts"
Task: "buildDissolveSql in src/server/repositories/analysisOperations.ts"
Task: "buildMergeSql in src/server/repositories/analysisOperations.ts"
Task: "buildSplitSql in src/server/repositories/analysisOperations.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (Buffer & Proximity)
4. **STOP and VALIDATE**: Test User Story 1 independently via `quickstart.md` Section 2
5. Deploy/demo if ready — Buffer, Near Analysis, and Distance Matrix are already a usable geoprocessing MVP

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 (Buffer & Proximity) → Test independently → Deploy/Demo (MVP!)
3. Add US2 (Overlay & Set Operations) → Test independently → Deploy/Demo
4. Add US3–US6 in any order (each independent) → Test → Deploy/Demo
5. Add US7 (Batch Processing) once at least one operation category exists
6. Add US8 (Analysis History) once at least one operation category exists
7. Phase 11 Polish → final release

### Parallel Team Strategy

With multiple developers, once Foundational is done:
- Developer A: US1 (P1, the MVP critical path)
- Developer B: US2 (P2)
- Developer C: US3–US6 (P3–P6, lower priority, can be split further)
- US7/US8 picked up by whoever finishes first, once one operation category has landed

---

## Notes

- [P] tasks = different files (or independent, append-only exports in the same shared file), no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story phase is independently completable and testable, per its own Checkpoint
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
- If verification cannot be completed because of Docker, browser tooling, or environment limitations, mark the task BLOCKED explicitly rather than claiming success — matching the convention already established during `004-map-editing-ui`'s implementation
