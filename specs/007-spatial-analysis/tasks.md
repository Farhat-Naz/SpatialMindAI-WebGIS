---

description: "Task list for feature implementation"
---

# Tasks: Spatial Analysis Toolset

**Input**: Design documents from `specs/007-spatial-analysis/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present and approved)

**Tests**: Explicitly requested (unit, API, hook, store, integration, performance, accessibility, large-dataset, build verification) — included throughout.

**Organization**: This roadmap uses the 20-phase, layer-first structure explicitly requested for this feature (Foundation → Database → Repository → Route Handlers → Client Services → Hooks → Stores → per-user-story operation phases → UI → Performance → Accessibility → Testing → Docs), rather than this repo's usual story-first template. Phases 8–16 each correspond to one spec.md user story (labelled `[US#]`); Phases 1–7 and 17–20 are cross-cutting infrastructure and carry no story label, per the Task Generation Rules' own convention.

**Architecture note (read before starting)**: Per the **approved** research.md/data-model.md, several concepts named in this roadmap's phase outline are **not** separate Prisma models or separate repository files — they are already-decided consolidations onto the extended `AnalysisRun` table and the existing `analysisRepository.ts`/`analysisOperations.ts` files (research.md Decisions 1–2). Specifically: "AnalysisJob" and "AnalysisHistory" = `AnalysisRun`'s job/history fields and queries; "AnalysisStatistics" and "GeometryOperation" = new `operationType` values on `AnalysisRun`, not new tables; "BufferRepository"/"OverlayRepository"/"StatisticsRepository"/"HistoryRepository" = functions/builders inside `analysisRepository.ts`/`analysisOperations.ts`, not separate files. Tasks below implement each named concept faithfully to what it actually is per the approved documents, and say so explicitly wherever the roadmap's phase-outline name could otherwise be read as "create a new table/file."

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[Story]**: US1–US10 per spec.md, applied only to Phases 8–16; Phases 1–7/17–20 carry no story label
- Every task lists exact file paths and the fields required by this roadmap: Priority, User Story, Files, Goal, Acceptance Criteria (traceable to a spec.md FR-/SC- id), Verification, Dependencies

---

## Phase 1: Foundation

**Purpose**: Configuration, shared types, spatial/PostGIS/geometry helper utilities, constants, error types, validation scaffolding, and the job-framework primitives every later phase builds on.

- [X] T001 Add analysis background-job configuration constants
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/analysis/types/analysisConfig.constants.ts` (new)
  - **Goal**: Define the chunk page size per operation category, the per-user concurrent-job cap (research.md Decision 12), and the polling interval default (research.md Decision 5) as named, typed constants — no magic numbers scattered through later phases.
  - **Acceptance Criteria**: Every later task that needs a chunk size, concurrency cap, or poll interval imports from this file (spec FR-024/027/028/029, Performance section: 100k features / 100 concurrent jobs).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T002 [P] Extend shared analysis types
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/types/analysis.types.ts` (modify)
  - **Goal**: Add re-exported types for the widened `AnalysisRun` shape (status enum, `progress`, timing fields), `AnalysisPreset`, `MeasurementHistory`, `ExportJob` per data-model.md — mirrors the existing re-export-only pattern already in this file.
  - **Acceptance Criteria**: Types compile with no `any`; every field in data-model.md's four entities has a corresponding TypeScript type (Constitution Principle II).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T003 [P] Create the client-side spatial utility library entry point
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/spatialMath.ts` (new)
  - **Goal**: A pure-function module wrapping Turf.js for the live, transient client-side calculations Constitution Principle IV permits (distance/area/perimeter/bearing/azimuth/radius) — no store or hook dependency, so it is independently unit-testable.
  - **Acceptance Criteria**: Exports one named function per measurement type from spec.md US3 (FR-007); no function reads from or writes to a Zustand store.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T004 [P] Add PostGIS helper SQL-fragment utilities
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify)
  - **Goal**: Add small shared helpers alongside the existing `toMeters`: a `toSquareMeters`/area-unit helper and a generic keyset `buildChunkPageSql(layerId, afterId, pageSize)` fragment builder (research.md Decision 5) that every chunked operation builder in later phases reuses.
  - **Acceptance Criteria**: No existing export in this file changes signature; new exports carry a one-line JSDoc summary (Constitution Principle VIII).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T001

- [X] T005 [P] Add client-side geometry helper functions
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/spatialMath.ts` (modify, same file as T003)
  - **Goal**: Add coordinate-formatting helpers (project's configured coordinate display format, per FR-007's "Coordinates" tool) reused by `MeasureToolbar` in Phase 10.
  - **Acceptance Criteria**: Formatting matches the project's existing coordinate-display convention used elsewhere on the map (no new format invented).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T006 [P] Add the analysis operation catalog constant
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/types/analysisOperations.constants.ts` (new)
  - **Goal**: One typed catalog (`AnalysisOperationCatalog`) listing every `operationType`, its category (Buffer/Query/Measurement/Overlay/Geometry/Statistics/Raster), and an `implemented: boolean` flag (research.md Decision 9) — the single source `AnalysisToolbox` (Phase 16) renders from.
  - **Acceptance Criteria**: Every operation named across spec.md US1–US7 appears exactly once; the five raster-adjacent entries (Heatmap, Elevation/DEM, Slope, Aspect, Hillshade) are present with `implemented: false` except Heatmap (`true`) (FR-017/FR-018).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T001

- [X] T007 [P] Add `ForbiddenError`/`FORBIDDEN` to the shared error vocabulary
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/errors/apiError.ts` (modify)
  - **Goal**: Add the `403 FORBIDDEN` code and `ForbiddenError` class per research.md Decision 15 — **skip this task with a no-op verification note if 006-collaboration has already landed this addition** (shared dependency; must not be defined twice).
  - **Acceptance Criteria**: Exactly one `ForbiddenError` class and one `FORBIDDEN` entry in `STATUS_BY_CODE` exists in the codebase after this task, regardless of whether 006 or 007 added it.
  - **Verification**: `npx tsc --noEmit` and `npx eslint src/shared/errors/apiError.ts --max-warnings 0`
  - **Dependencies**: None

- [X] T008 Create new Zod request contract files (schema shells)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/presetRequest.schema.ts` (new), `src/shared/contracts/measurementRequest.schema.ts` (new), `src/shared/contracts/exportLogRequest.schema.ts` (new)
  - **Goal**: Create the three new Zod schema files per contracts/api-contracts.md's preset/measurement/export request bodies — shells only in this task (full field validation lands with each phase that needs it, to keep this task reviewable).
  - **Acceptance Criteria**: Each file exports one Zod schema + one `z.infer` type, matching Constitution Principle II's "Zod schema is the single source of truth" rule.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T009 [P] Extend `analysis.schema.ts` with new `operationType` literals (enum shell)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/analysis.schema.ts` (modify)
  - **Goal**: Add every new `operationType` key from data-model.md's "New operationType values" list to `operationDefinitions` with a placeholder `parameters: noParameters` shape — full per-operation parameter shapes are filled in by each operation's own phase (8–13) so this task stays reviewable as pure enum scaffolding.
  - **Acceptance Criteria**: `OperationType` (the inferred union) includes every value data-model.md lists; existing 20 operationType entries from 005 are untouched.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T010 Define the shared job-status type
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/types/analysis.types.ts` (modify, same file as T002)
  - **Goal**: Export one `AnalysisJobStatus` union type (`"queued" | "running" | "succeeded" | "failed" | "cancelled"`) reused by both `AnalysisRun` and `ExportJob` types so the two never define the status union independently and drift apart.
  - **Acceptance Criteria**: Both `AnalysisRunRecord` and `ExportJobRecord` types reference the same exported union.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T002

- [X] T011 Add the chunked-execution keyset pagination helper
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify, same file as T004)
  - **Goal**: Implement `buildChunkPageSql`'s SQL body (declared in T004) — keyset pagination ordered by feature `id`, bounded by the chunk size from T001's constants (research.md Decision 5).
  - **Acceptance Criteria**: Given a layer with N features and a page size P, calling the builder ⌈N/P⌉ times with the previous page's last id covers every feature exactly once.
  - **Verification**: `npx tsc --noEmit`; unit test added in T014
  - **Dependencies**: T004

- [X] T012 Add the `pg_cancel_backend` cancellation wrapper
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/db/pgCancel.ts` (new)
  - **Goal**: One small function, `cancelBackendPid(pid: number): Promise<void>`, wrapping `SELECT pg_cancel_backend($1)` on a pooled connection (research.md Decision 5) — kept separate from `analysisRepository.ts` so it has no analysis-specific knowledge and is trivially unit-testable with a mocked client.
  - **Acceptance Criteria**: Function never throws for an already-completed backend pid (Postgres itself no-ops in that case); JSDoc documents this.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T013 [P] Extend structured request logging for job lifecycle fields
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/shared/lib/logger.ts` (modify, only if a typed field addition is needed beyond its existing generic shape)
  - **Goal**: Confirm/extend `logger.request`'s structured fields so `jobId`/`status`/`progress` can be logged for the new background-job endpoints without inventing a second logging call shape (Constitution Additional Standards — Logging).
  - **Acceptance Criteria**: No raw `console.*` call is introduced anywhere in this feature (Constitution rule, audited again in Phase 20).
  - **Verification**: `npx eslint src/shared/lib/logger.ts --max-warnings 0`
  - **Dependencies**: None

- [X] T014 [P] Unit tests for Phase 1 utilities
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/__tests__/spatialMath.test.ts` (new), `src/server/repositories/__tests__/analysisOperations.chunking.test.ts` (new), `src/server/db/__tests__/pgCancel.test.ts` (new)
  - **Goal**: Unit-test T003/T005's spatial math against known geometries with known expected values, T011's chunk-pagination coverage property, and T012's cancel-wrapper no-throw behavior.
  - **Acceptance Criteria**: All new tests pass; each test file is co-located under its module's `__tests__/` directory (Constitution Principle VII).
  - **Verification**: `npm run test -- spatialMath analysisOperations.chunking pgCancel`
  - **Dependencies**: T003, T005, T011, T012

- [X] T015 Checkpoint (Phase 1)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm Foundation phase is complete and green before Phase 2 (Database) begins.
  - **Acceptance Criteria**: All of T001–T014 complete; no `TODO`/stub left in a non-test file from this phase.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T001–T014

---

## Phase 2: Database

**Purpose**: Schema changes — widen `AnalysisRun`, add `AnalysisPreset`/`MeasurementHistory`/`ExportJob`, indexes, relations, migration, and seed data. Every "AnalysisJob"/"AnalysisHistory"/"AnalysisStatistics"/"GeometryOperation" item from the roadmap outline is implemented here as the data-model.md-approved consolidation onto `AnalysisRun` — see the Architecture note above.

- [X] T016 Widen `AnalysisRun` — background-job columns (covers "AnalysisJob")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify)
  - **Goal**: Add `userId` (FK → `User`, cascade), widen `status` to the 5-state enum (T010's type), and add `progress`, `startedAt`, `completedAt`, `executionTimeMs`, `cancelRequestedAt`, `backendPid`, `presetId` (FK → `AnalysisPreset`, set-null) exactly per data-model.md's `AnalysisRun (MODIFIED)` table.
  - **Acceptance Criteria**: No existing `AnalysisRun` field is renamed, retyped, or removed; `prisma validate` passes.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T002, T010

- [X] T017 [P] Confirm history-query readiness on `AnalysisRun` (covers "AnalysisHistory")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Per research.md Decision 1/data-model.md, "Analysis History" is a query over `AnalysisRun`, not a table — this task's concrete output is adding the `@@index([projectId, status])` index (T023 covers the rest) that makes the status-filtered history listing (contracts/api-contracts.md) performant.
  - **Acceptance Criteria**: Index present in schema; documented in the model's doc comment as serving both job-status lookups and History Panel filtering.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T018 [P] Add `AnalysisPreset` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add the `AnalysisPreset` model exactly per data-model.md — `id`, `projectId`/`project`, `userId`/`user`, `name`, `operationType`, `parameters` (Json), `createdAt`/`updatedAt`, `@@unique([projectId, name])`, `@@index([projectId, operationType])`.
  - **Acceptance Criteria**: `prisma validate` passes; matches `Layer`'s existing per-project-unique-name convention.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T019 [P] Add `MeasurementHistory` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add the `MeasurementHistory` model exactly per data-model.md, including the `Unsupported("geometry(Geometry, 4326)")` column matching `Feature.geometry`'s existing pattern.
  - **Acceptance Criteria**: `prisma validate` passes; geometry column uses the identical PostGIS type declaration `Feature.geometry` already uses (Constitution Principle III).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T020 Add statistics operationType literals to the catalog (covers "AnalysisStatistics")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/types/analysisOperations.constants.ts` (modify, from T006), `prisma/schema.prisma` (modify — doc comment only)
  - **Goal**: Per research.md Decision 1, "AnalysisStatistics" is not a table — add `featureCount`/`totalLength`/`averageLength`/`averageArea`/`extent` to T006's catalog (category: Statistics) and note in `AnalysisRun`'s doc comment that statistics results live in `resultData`.
  - **Acceptance Criteria**: No new Prisma model added by this task; catalog entries present.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T006, T017

- [X] T021 [P] Add `ExportJob` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add the `ExportJob` model exactly per data-model.md's revised (lightweight, client-reported) design — `status` limited to `"succeeded" | "failed"` only, no `progress`/`cancelRequestedAt` columns (research.md Decision 10).
  - **Acceptance Criteria**: `prisma validate` passes; model has no execution-tracking columns, matching the "history log, not a job" design.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T022 Document the Geometry Processing operationType consolidation (covers "GeometryOperation")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/types/analysisOperations.constants.ts` (modify), `prisma/schema.prisma` (modify — doc comment only)
  - **Goal**: Add `simplify`/`smoothGeometry`/`multipartToSinglepart`/`singlepartToMultipart`/`repairGeometry`/`erase`/`identity`/`symmetricalDifference`/`touches`/`crosses`/`overlaps`/`selectByLocation`/`selectByAttribute` to T006's catalog; document in `AnalysisRun`'s doc comment that "GeometryOperation" is this same `operationType` mechanism, per research.md Decision 1.
  - **Acceptance Criteria**: No new Prisma model added; every operationType from data-model.md's "New operationType values" list (T009) has a matching catalog entry.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T006, T009

- [X] T023 [P] Add remaining `AnalysisRun` indexes
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `@@index([userId])` and `@@index([presetId])` (data-model.md) alongside T017's `[projectId, status]` index; confirm the existing `[projectId, createdAt]`/`[batchId]` indexes are untouched.
  - **Acceptance Criteria**: `prisma validate` passes; exactly 4 indexes total on `AnalysisRun` after this task.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016, T017

- [X] T024 [P] Add GiST spatial index migration step for `MeasurementHistory.geometry`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_analysis_toolset/migration.sql` (generated by T027, edited by this task)
  - **Goal**: Add the raw-SQL `CREATE INDEX ... USING GIST` step for `MeasurementHistory.geometry`, matching `Feature.geometry`'s original migration's exact approach (Constitution Principle III — every geometry column MUST have a spatial index).
  - **Acceptance Criteria**: Migration includes the GiST index statement; `prisma migrate status` shows it applied.
  - **Verification**: `npx prisma migrate status`
  - **Dependencies**: T019, T027

- [X] T025 Add back-relations to `Project`, `Layer`, `User`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `analysisPresets`, `measurementHistory`, `exportJobs` to `Project`; `sourceOfExportJobs` to `Layer`; `analysisRuns`, `analysisPresets`, `measurementHistory`, `exportJobs` to `User`, exactly per data-model.md's back-relations block.
  - **Acceptance Criteria**: `prisma validate` passes; no existing field on any of these three models is altered.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016, T018, T019, T021

- [X] T026 Add defense-in-depth `CHECK` constraints
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_analysis_toolset/migration.sql` (edited, same migration as T024)
  - **Goal**: Add raw-SQL `CHECK (progress IS NULL OR progress BETWEEN 0 AND 100)` on `AnalysisRun.progress` (data-model.md's validation rule, enforced at the DB layer as defense in depth beyond the repository-layer check).
  - **Acceptance Criteria**: Constraint present in the generated migration; inserting `progress = 150` via raw SQL fails.
  - **Verification**: `npx prisma migrate status`; manual `psql` check documented in T031
  - **Dependencies**: T016, T027

- [X] T027 Generate and apply the additive migration
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_analysis_toolset/migration.sql` (generated)
  - **Goal**: Run `prisma migrate dev` to produce one migration widening `AnalysisRun` and creating `AnalysisPreset`/`MeasurementHistory`/`ExportJob`, per data-model.md's Migration Notes.
  - **Acceptance Criteria**: Migration applies cleanly against the test database; no data loss to any existing table.
  - **Verification**: `npx prisma migrate status`
  - **Dependencies**: T016, T018, T019, T021, T023, T025

- [X] T028 Backfill `AnalysisRun.userId` before tightening to `NOT NULL`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_analysis_toolset/migration.sql` (edited, same migration as T027)
  - **Goal**: Add the backfill step (`userId = ` the owning project's `ownerId`) before the `NOT NULL` constraint is added, per data-model.md's Migration Notes — standard add-nullable→backfill→tighten shape for a non-empty table.
  - **Acceptance Criteria**: Every pre-existing `AnalysisRun` row has a non-null `userId` after migration; migration fails loudly (not silently) if any row cannot be backfilled.
  - **Verification**: `npx prisma migrate status`; row-count spot check documented in T031
  - **Dependencies**: T027

- [X] T029 [P] Update `prisma/seed.ts` — analysis-toolset sample rows
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `prisma/seed.ts` (modify)
  - **Goal**: Seed one sample `AnalysisPreset`, one `MeasurementHistory` row, one `ExportJob` row, and add `userId` to every existing seeded `AnalysisRun` row, so quickstart.md's manual walkthrough has realistic starting data.
  - **Acceptance Criteria**: `npm run db:seed` (or the project's existing seed command) completes with no errors.
  - **Verification**: Run the project's seed command against the test database
  - **Dependencies**: T027, T028

- [X] T030 [P] Update `prisma/seed.ts` — second project member for permission scenarios
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `prisma/seed.ts` (modify, same file as T029)
  - **Goal**: Seed a second `User` who is an Editor (and, if 006-collaboration's `ProjectMember` model has landed by this point, a Viewer too) on the sample project, so quickstart.md's permission-denied scenario is runnable out of the box. If 006's membership model has not landed yet, seed the second `User` directly and document the interim gap inline with a comment referencing this task.
  - **Acceptance Criteria**: quickstart.md's "Permission denied" scenario has a ready-made non-Owner user to sign in as.
  - **Verification**: Run the project's seed command against the test database
  - **Dependencies**: T029

- [X] T031 [P] Database-level tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/__tests__/schema.migration.test.ts` (new, or the project's existing DB-test location/convention)
  - **Goal**: Automated smoke test asserting the migration applies cleanly, the `CHECK` constraint (T026) rejects an out-of-range `progress`, and the `userId` backfill (T028) leaves zero null rows.
  - **Acceptance Criteria**: Test passes against the real ephemeral PostGIS test database, skip-if-unavailable per existing convention.
  - **Verification**: `npm run test:db` (if present) or `npm run test -- schema.migration`
  - **Dependencies**: T024, T026, T027, T028

- [X] T032 Checkpoint (Phase 2)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the schema/migration/seed layer is complete and green before Phase 3 (Repository Layer) begins.
  - **Acceptance Criteria**: All of T016–T031 complete; `prisma validate` and `prisma migrate status` both clean.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T016–T031

---

## Phase 3: Repository Layer

**Purpose**: Server-side data access. "AnalysisRepository"/"BufferRepository"/"OverlayRepository"/"StatisticsRepository"/"HistoryRepository" from the roadmap outline are all implemented inside the existing `analysisRepository.ts`/`analysisOperations.ts` pair per research.md Decision 1 (see Architecture note above) — this phase's tasks say exactly which function/builder each named concept becomes. "PresetRepository"/"MeasurementRepository"/"ExportRepository" are genuinely new, narrow files.

- [X] T033 Widen `analysisRepository.createAnalysisRun` — queued/running lifecycle
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts` (modify)
  - **Goal**: Change `createAnalysisRun` to write `status: "queued"` + `userId` immediately, then dispatch to either the existing fast synchronous path (small input) or `executeInBackground` (T034) for input past the chunking threshold from T001's constants, per contracts/repository-api.md.
  - **Acceptance Criteria**: A run for a small input still resolves to a terminal status within the same call (no regression to 005's existing fast-path tests); a large-input run returns `"queued"`/`"running"` immediately (FR-024).
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T016, T027, T033 self (T001 for constants)

- [X] T034 [P] Add `analysisRepository.executeInBackground`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts` (modify, same file as T033)
  - **Goal**: Implement chunked execution per contracts/repository-api.md — sets `status`/`startedAt`, iterates chunks via T011's keyset pagination, writes `progress` after each, checks `cancelRequestedAt` between chunks, records `backendPid`, writes terminal fields on completion, and catches every thrown error into `status: "failed"` (never an unhandled rejection).
  - **Acceptance Criteria**: FR-024 (background execution), FR-027 (progress feedback), FR-030 (graceful failure recovery) all satisfied by this function's behavior.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T011, T033

- [X] T035 [P] Add `analysisRepository.cancelRun`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts` (modify, same file as T033)
  - **Goal**: Implement per contracts/repository-api.md — no-op on an already-terminal run; otherwise sets `cancelRequestedAt` and calls T012's `cancelBackendPid` if `backendPid` is set (FR-028).
  - **Acceptance Criteria**: Cancelling a queued run prevents it from ever starting; cancelling a running run stops it within one chunk's duration.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T012, T034

- [X] T036 [P] Add `analysisRepository.discardResult`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts` (modify, same file as T033)
  - **Goal**: Implement per contracts/repository-api.md — throws `ValidationError` if `resultLayerId` is already null; otherwise deletes the result `Layer` (cascading its `Feature`s) in a transaction and sets `resultLayerId: null`, leaving the run row itself intact (FR-031).
  - **Acceptance Criteria**: The run remains visible in history with `resultLayerId: null` after this action; no other project data is affected (spec Edge Cases).
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T033

- [X] T037 Extend `analysisRepository.listAnalysisRunsForProject` — status filter (covers "HistoryRepository")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts` (modify, same file as T033)
  - **Goal**: Add an optional `status?: string[]` filter param to the existing cursor-paginated query, using T017/T023's new index — this function *is* "HistoryRepository" per research.md Decision 2.
  - **Acceptance Criteria**: Filtering by `["queued","running"]` returns only in-flight runs; omitting the filter is unchanged from 005's existing behavior.
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T017, T033

- [X] T038 Swap ownership scoping to `assertProjectRole` across `analysisRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisRepository.ts` (modify, same file as T033)
  - **Goal**: Replace every `ownerId`-equality scoping (`getRunScopedToOwner`, `getProjectById(id, ownerId)`) with `assertProjectRole`-based membership scoping per research.md Decision 3 — **prerequisite**: `src/server/auth/assertProjectRole.ts` must exist (reuse if 006-collaboration has landed; otherwise implement it here first, exactly per 006's already-designed contract, as the shared prerequisite plan.md's Complexity Tracking flags).
  - **Acceptance Criteria**: Any project member (Viewer+) can read; Editor+ required for any write; cross-project requests still return `404` (non-disclosure, unchanged convention).
  - **Verification**: `npx tsc --noEmit`; covered by T048
  - **Dependencies**: T033, T034, T035, T036, T037

- [X] T039 [P] "BufferRepository" — confirm/extend chunked `buildBufferSql`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify)
  - **Goal**: Confirm 005's existing `ST_Buffer`-based builder works correctly when called per-chunk (T011) rather than once over the whole input, and add the dissolve-branch (`ST_Union` over all chunks' buffered output) for FR-003.
  - **Acceptance Criteria**: A dissolved multi-chunk buffer produces one merged polygon identical in shape to a single-chunk run over the same data (spot-checked in T134).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004, T011

- [X] T040 [P] "OverlayRepository" — Erase/Identity/Symmetrical Difference builders
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify, same file as T039)
  - **Goal**: Add `buildEraseSql`, `buildIdentitySql`, `buildSymmetricalDifferenceSql` per research.md Decision 7's function table (`ST_Difference`, `ST_Union`/`ST_Intersection` combination, `ST_SymDifference`) (FR-010).
  - **Acceptance Criteria**: Each builder returns a `Prisma.Sql` fragment only — no live database connection opened in this file (Constitution Principle I, matching 005's existing convention).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T039

- [X] T041 [P] "OverlayRepository" cont'd — spatial predicate + select-by builders
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify, same file as T039)
  - **Goal**: Add `buildSpatialPredicateSql` (Touches/Crosses/Overlaps via `ST_Touches`/`ST_Crosses`/`ST_Overlaps`) and the `selectByLocation`/`selectByAttribute` builders (FR-004, FR-006).
  - **Acceptance Criteria**: `selectByAttribute`'s filter expression is passed only as a parameterized value, never string-concatenated (Constitution Principle III/VI — SQL injection prevention).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T039

- [X] T042 [P] "StatisticsRepository" — `buildStatisticsSql`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify, same file as T039)
  - **Goal**: Add `buildStatisticsSql(statType, geomColumn)` covering `featureCount`/`totalLength`/`averageLength`/`averageArea`/`extent` (FR-016) — this function *is* "StatisticsRepository" per research.md Decision 1.
  - **Acceptance Criteria**: `featureCount` uses `COUNT(*)`; area/length variants use `ST_Area`/`ST_Length` aggregates; `extent` uses `ST_Extent`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T039

- [X] T043 [P] Geometry Processing builders
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify, same file as T039)
  - **Goal**: Add `buildSimplifySql` (`ST_SimplifyPreserveTopology`), `buildSmoothSql` (`ST_ChaikinSmoothing`), `buildMultipartConversionSql` (`ST_Dump` / `ST_Collect`+`ST_Multi`), `buildRepairGeometrySql` (`ST_IsValid` gate + `ST_MakeValid`) per research.md Decision 7 (FR-011, FR-014, FR-015).
  - **Acceptance Criteria**: `buildRepairGeometrySql` returns a distinguishable "could not repair" outcome, not a thrown exception, so the caller can surface FR-015's "clearly report" requirement.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T039

- [X] T044 [P] Confirm Split/Merge/Dissolve chunk-safety
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify, same file as T039)
  - **Goal**: Audit 005's existing `split`/`merge`/`dissolve` builders against chunked execution (T011/T034) — per plan.md's Risks table, Dissolve MUST aggregate across all chunks before the final `ST_Union`, never partially dissolve per-chunk. Add a code comment documenting this invariant.
  - **Acceptance Criteria**: A Dissolve whose grouping spans chunk boundaries produces one feature per unique attribute value, not one per (chunk, value) pair.
  - **Verification**: `npx tsc --noEmit`; covered by T197
  - **Dependencies**: T039

- [X] T045 [P] Create `analysisPresetRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/analysisPresetRepository.ts` (new)
  - **Goal**: Implement `listPresetsForProject`, `createPreset`, `deletePreset` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `createPreset` throws `DuplicateNameError` on a `(projectId, name)` collision; `deletePreset` throws `ForbiddenError` unless caller is creator or project Owner (FR-021).
  - **Verification**: `npx tsc --noEmit`; covered by T049
  - **Dependencies**: T007, T018, T038

- [X] T046 [P] Create `measurementRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/measurementRepository.ts` (new)
  - **Goal**: Implement `saveMeasurement`, `listMeasurementsForProject`, `deleteMeasurement` exactly per contracts/repository-api.md — `saveMeasurement` runs `ST_IsValid` + the matching PostGIS recompute (`ST_Length`/`ST_Area`/`ST_Azimuth`/`ST_Distance`) before insert, never trusting a client-supplied value (research.md Decision 8, FR-008).
  - **Acceptance Criteria**: The persisted `value` always comes from a PostGIS computation inside this function, never copied directly from the request body.
  - **Verification**: `npx tsc --noEmit`; covered by T049
  - **Dependencies**: T019, T038

- [X] T047 [P] Create `exportLogRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/exportLogRepository.ts` (new)
  - **Goal**: Implement `logExport`, `listExportsForProject` exactly per contracts/repository-api.md — pure insert/list, no execution logic (research.md Decision 10).
  - **Acceptance Criteria**: `logExport` validates at most one of `sourceAnalysisRunId`/`sourceLayerId` is set.
  - **Verification**: `npx tsc --noEmit`; covered by T049
  - **Dependencies**: T021, T038

- [X] T048 [P] Repository tests — `analysisRepository.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisRepository.test.ts` (modify/extend existing 005 test file)
  - **Goal**: Test T033–T044's full lifecycle (queued→running→succeeded/failed/cancelled), `discardResult`, `cancelRun`'s idempotent-on-terminal behavior, and the new membership-scoped visibility rules from T038, against the real PostGIS test database.
  - **Acceptance Criteria**: Every function in contracts/repository-api.md's `analysisRepository.ts` section has at least one passing success test and one failure/edge-case test.
  - **Verification**: `npm run test:db -- analysisRepository` (or `npm run test -- analysisRepository`, skip-if-unavailable)
  - **Dependencies**: T033–T044

- [X] T049 [P] Repository tests — preset/measurement/export
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisPresetRepository.test.ts` (new), `src/server/repositories/__tests__/measurementRepository.test.ts` (new), `src/server/repositories/__tests__/exportLogRepository.test.ts` (new)
  - **Goal**: Test every function in T045–T047 — success, not-found, forbidden, and (measurement) the server-recompute-not-client-value guarantee.
  - **Acceptance Criteria**: Matches contracts/repository-api.md's documented behavior for each function.
  - **Verification**: `npm run test:db -- analysisPresetRepository measurementRepository exportLogRepository`
  - **Dependencies**: T045, T046, T047

- [X] T050 Checkpoint (Phase 3)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the repository layer is complete and green before Phase 4 (Route Handlers) begins.
  - **Acceptance Criteria**: All of T033–T049 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T033–T049

---

## Phase 4: Route Handlers

**Purpose**: HTTP surface. Per contracts/api-contracts.md and research.md Decision 1, "Buffer API"/"Spatial Query API"/"Overlay API"/"Geometry Processing API"/"Statistics API"/"History API" are **not** separate route files — they are `operationType` variants flowing through the one existing `POST`/`GET /api/projects/:projectId/analysis` endpoint family. This phase's tasks wire each named category through that shared endpoint and build the genuinely new endpoints (cancel, discard-result, presets, measurements, exports) as real new route files.

- [X] T051 Modify `POST /api/projects/:projectId/analysis` — 202 response + role check
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/analysis/route.ts` (modify)
  - **Goal**: Return `202` (was `201`), include the widened `run` shape (T016's fields), and swap the auth check to `assertProjectRole(..., "editor")` per contracts/api-contracts.md.
  - **Acceptance Criteria**: Response body matches contracts/api-contracts.md's `POST` response shape exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T033, T038, T070

- [X] T052 Modify `GET /api/projects/:projectId/analysis` — status filter
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/analysis/route.ts` (modify, same file as T051)
  - **Goal**: Add the optional `status` query param (comma-separated), wired to T037's repository filter; swap auth check to `assertProjectRole(..., "viewer")`.
  - **Acceptance Criteria**: `?status=queued,running` returns only in-flight runs.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T037, T038

- [X] T053 [P] "Buffer API" — verify buffer flows through the background-job path
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/analysis/route.ts` (verification only, no new file)
  - **Goal**: Confirm the existing `buffer` operationType, unchanged in shape, correctly triggers T033's queued/chunked path for a large input and the fast path for a small one.
  - **Acceptance Criteria**: No regression to 005's existing buffer contract test.
  - **Verification**: Covered by T074/T134
  - **Dependencies**: T039, T051

- [X] T054 [P] "Spatial Query API" — wire new predicate/select operationType variants
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/analysis.schema.ts` (modify — full parameter shapes, see T070)
  - **Goal**: Confirm `touches`/`crosses`/`overlaps`/`selectByLocation`/`selectByAttribute` (T041) are reachable end-to-end through `POST .../analysis` once T070 fills in their parameter shapes.
  - **Acceptance Criteria**: FR-004/FR-005/FR-006 all reachable via this one endpoint.
  - **Verification**: Covered by T074/T151
  - **Dependencies**: T041, T051, T070

- [X] T055 [P] "Overlay API" — wire Erase/Identity/Symmetrical Difference
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/analysis.schema.ts` (modify, see T070)
  - **Goal**: Confirm `erase`/`identity`/`symmetricalDifference` (T040) are reachable end-to-end (FR-010).
  - **Acceptance Criteria**: All 7 overlay operations (4 from 005 + 3 new) reachable via this one endpoint.
  - **Verification**: Covered by T074/T180
  - **Dependencies**: T040, T051, T070

- [X] T056 [P] "Geometry Processing API" — wire Simplify/Smooth/Multipart/Repair
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/analysis.schema.ts` (modify, see T070)
  - **Goal**: Confirm T043's builders are reachable end-to-end (FR-011, FR-014, FR-015).
  - **Acceptance Criteria**: All 8 geometry-processing operations (3 existing from 005 + 5 new) reachable via this one endpoint.
  - **Verification**: Covered by T074/T197
  - **Dependencies**: T043, T051, T070

- [X] T057 [P] "Statistics API" — wire feature/length/area/extent stats
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/analysis.schema.ts` (modify, see T070)
  - **Goal**: Confirm T042's `buildStatisticsSql`-backed operations are reachable end-to-end (FR-016).
  - **Acceptance Criteria**: All 8 statistics operations (3 existing from 005 + 5 new) reachable via this one endpoint.
  - **Verification**: Covered by T074/T213
  - **Dependencies**: T042, T051, T070

- [X] T058 "History API" — confirm extended response fields
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/analysis/route.ts` (verification only, paired with T052)
  - **Goal**: Confirm `GET .../analysis`'s `runs[]` entries include every T016 field the History Panel (Phase 14) needs (FR-019).
  - **Acceptance Criteria**: Response shape matches contracts/api-contracts.md exactly.
  - **Verification**: Covered by T074
  - **Dependencies**: T052

- [X] T059 [P] "Preset API" — list/create route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/analysis/presets/route.ts` (new)
  - **Goal**: Implement `GET`/`POST` exactly per contracts/api-contracts.md (FR-021).
  - **Acceptance Criteria**: Matches the documented request/response/error shapes exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T008, T045, T071

- [X] T060 [P] "Preset API" — delete route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/presets/[presetId]/route.ts` (new)
  - **Goal**: Implement `DELETE` exactly per contracts/api-contracts.md.
  - **Acceptance Criteria**: `403` for a non-creator, non-Owner caller.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T045

- [X] T061 [P] "Measurement API" — list/create route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/measurements/route.ts` (new)
  - **Goal**: Implement `GET`/`POST` exactly per contracts/api-contracts.md (FR-008).
  - **Acceptance Criteria**: `POST` response's `value`/`unit` come from T046's server recompute, never the request body's raw value.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T008, T046, T071

- [X] T062 [P] "Measurement API" — delete route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/measurements/[measurementId]/route.ts` (new)
  - **Goal**: Implement `DELETE` exactly per contracts/api-contracts.md.
  - **Acceptance Criteria**: `403` for a non-creator, non-Owner caller.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T046

- [X] T063 [P] "Export API" — list/create (log) route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/exports/route.ts` (new)
  - **Goal**: Implement `GET`/`POST` exactly per contracts/api-contracts.md — `POST` is a pure history-log write, no execution (research.md Decision 10, FR-022).
  - **Acceptance Criteria**: Matches the documented request/response/error shapes exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T008, T047, T071

- [X] T064 "Job Status API" — extend `GET /api/analysis/:runId`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/[runId]/route.ts` (modify)
  - **Goal**: Extend the response to the full widened `run` shape; swap auth to `assertProjectRole(..., "viewer")` — this is the polling target for Progress Dialog (research.md Decision 5).
  - **Acceptance Criteria**: Response shape matches contracts/api-contracts.md exactly.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T038

- [X] T065 [P] "Job Status API" optional — SSE stream endpoint
  - **Priority**: Nice-to-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/[runId]/stream/route.ts` (new)
  - **Goal**: Implement the optional `text/event-stream` progress channel per contracts/api-contracts.md/research.md Decision 6 — additive only, polling remains the required baseline.
  - **Acceptance Criteria**: Falls back gracefully (client never depends on this endpoint succeeding).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T064

- [X] T066 "Cancel Job API" — cancel route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/[runId]/cancel/route.ts` (new)
  - **Goal**: Implement `POST /api/analysis/:runId/cancel` exactly per contracts/api-contracts.md (FR-028).
  - **Acceptance Criteria**: No-op success on an already-terminal run, matching T035's repository behavior.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T035, T038

- [X] T067 "Cancel Job API" cont'd — discard-result route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/[runId]/discard-result/route.ts` (new)
  - **Goal**: Implement `POST /api/analysis/:runId/discard-result` exactly per contracts/api-contracts.md (FR-031).
  - **Acceptance Criteria**: `400 INVALID_INPUT` when there is no result to discard.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T036, T038

- [X] T068 Modify `POST /api/analysis/:runId/rerun` — role check swap
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/[runId]/rerun/route.ts` (modify)
  - **Goal**: Swap `ownerId` scoping for `assertProjectRole(..., "editor")` (FR-020, FR-025).
  - **Acceptance Criteria**: Behavior otherwise unchanged from 005.
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T038

- [X] T069 Modify `DELETE /api/analysis/:runId` — role check swap
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/[runId]/route.ts` (modify, same file as T064)
  - **Goal**: Swap `ownerId` scoping for `assertProjectRole(..., "editor")`, or the run's own creator (FR-026 unchanged behavior otherwise).
  - **Acceptance Criteria**: Deleting a history entry never touches its result layer (unchanged from 005).
  - **Verification**: `npx tsc --noEmit`; covered by T074
  - **Dependencies**: T038, T064

- [X] T070 [P] Fill in full `operationType` parameter shapes
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/analysis.schema.ts` (modify)
  - **Goal**: Replace T009's placeholder `noParameters` shapes with the real, fully-validated `parameters`/`inputLayerIds` shape for every new operationType, per each operation's builder signature from Phase 3.
  - **Acceptance Criteria**: Every operationType added in T009 now has a complete, non-placeholder Zod variant (Constitution Principle II).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T009, T039–T044

- [X] T071 [P] Fill in preset/measurement/export request validation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/presetRequest.schema.ts`, `src/shared/contracts/measurementRequest.schema.ts`, `src/shared/contracts/exportLogRequest.schema.ts` (all modify, from T008)
  - **Goal**: Complete full field validation for all three shells created in T008, matching contracts/api-contracts.md's request bodies exactly.
  - **Acceptance Criteria**: Every field documented in api-contracts.md has a matching Zod constraint.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T008

- [X] T072 Extend structured logging across new/modified routes
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: All route files touched in T051–T069
  - **Goal**: Confirm every route calls `logger.request` with method/path/status/duration (existing convention), and that job-lifecycle routes additionally log `jobId`/resulting `status` per T013.
  - **Acceptance Criteria**: No route in this feature skips structured logging.
  - **Verification**: `npx eslint src/app/api --max-warnings 0`
  - **Dependencies**: T013, T051–T069

- [X] T073 Confirm `ForbiddenError`/`FORBIDDEN` mapping across new/modified routes
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All route files touched in T051–T069
  - **Goal**: Confirm every route's `catch` block correctly maps a thrown `ForbiddenError` (T007) to `403 FORBIDDEN` via `handleRouteError`.
  - **Acceptance Criteria**: No route returns a bare `500` for an authorization failure.
  - **Verification**: Covered by T074
  - **Dependencies**: T007, T051–T069

- [X] T074 [P] API tests — every new/modified endpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/analysis/__tests__/analysis.api.test.ts` (modify/extend), `src/app/api/projects/__tests__/analysisPresets.api.test.ts` (new), `src/app/api/projects/__tests__/measurements.api.test.ts` (new), `src/app/api/projects/__tests__/exports.api.test.ts` (new)
  - **Goal**: Test every endpoint in contracts/api-contracts.md — success, validation failure, `403`, `404`, `429`, and (for the analysis endpoint) the `202`-then-poll-to-terminal flow.
  - **Acceptance Criteria**: Every row of every error table in contracts/api-contracts.md has a corresponding test case.
  - **Verification**: `npm run test:db -- api.test` (skip-if-unavailable) or `npm run test`
  - **Dependencies**: T051–T073

- [X] T075 Checkpoint (Phase 4)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the full HTTP surface is complete and green before Phase 5 (Client Services) begins.
  - **Acceptance Criteria**: All of T051–T074 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T051–T074

---

## Phase 5: Client Services

**Purpose**: Client-side HTTP wrappers and the two services permitted real logic (export assembly, live measurement math) per Constitution Principle I. This extends 005's never-built client shell (`src/features/analysis/` had only `index.ts`/`types/`).

- [X] T076 Create `analysisService.ts` — core run methods
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/analysisService.ts` (new)
  - **Goal**: Implement `runAnalysis`, `runBatchAnalysis`, `listRuns`, `getRun`, `cancelAnalysis`, `discardResult`, `rerunAnalysis`, `deleteRun` per contracts/client-api.md — thin `apiFetch` wrappers only, matching `database`'s existing service pattern.
  - **Acceptance Criteria**: No method contains business logic beyond request shaping/response parsing (Constitution Principle I).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T051, T052, T064, T066, T067, T068, T069

- [X] T077 [P] "Buffer service" — type-check Buffer flows through `analysisService`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/analysisService.ts` (verification only, same file as T076)
  - **Goal**: Confirm `runAnalysis`'s input type correctly narrows for `operationType: "buffer"` (distance/unit/dissolve), giving compile-time safety to the Buffer form built in Phase 8.
  - **Acceptance Criteria**: TypeScript rejects a Buffer call missing `distance`/`unit`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T076

- [X] T078 [P] "Overlay service" — type-check Overlay flows through `analysisService`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/analysisService.ts` (verification only, same file as T076)
  - **Goal**: Confirm `runAnalysis`'s input type correctly narrows for all 7 overlay operationTypes.
  - **Acceptance Criteria**: TypeScript rejects a two-layer overlay call with only one `inputLayerIds` entry.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T076, T070

- [X] T079 [P] "History service" — preset methods on `analysisService`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/analysisService.ts` (modify, same file as T076)
  - **Goal**: Add `listPresets`, `savePreset`, `deletePreset` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches api-contracts.md's preset endpoint shapes exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T059, T060, T076

- [X] T080 [P] "Measurement service" — `measurementService.ts` + save/list/delete methods
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/measurementService.ts` (new), `src/features/analysis/services/analysisService.ts` (modify — add `saveMeasurement`/`listMeasurements`/`deleteMeasurement`)
  - **Goal**: `measurementService.ts` wraps T003/T005's `spatialMath.ts` for live, client-side readouts (Constitution Principle IV carve-out); `analysisService.ts` gains the three network methods per contracts/client-api.md.
  - **Acceptance Criteria**: `measurementService.ts` never calls `fetch`/`apiFetch` directly — network calls stay in `analysisService.ts` only.
  - **Verification**: `npx tsc --noEmit`; covered by T089
  - **Dependencies**: T003, T005, T061, T062, T076

- [X] T081 [P] "Export service" — `exportService.ts` + log methods
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/exportService.ts` (new), `src/features/analysis/services/analysisService.ts` (modify — add `logExport`/`listExports`)
  - **Goal**: `exportService.ts` shell per contracts/client-api.md — method signatures only in this task; per-format bodies are built in Phase 15 (Export Results) to keep this task reviewable.
  - **Acceptance Criteria**: `exportLayerAsGeoJson` re-exports (does not duplicate) `database/services/exportLayer.ts`'s existing function.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T063, T076

- [X] T082 [P] Add the Shapefile-writer dependency
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `package.json`, `package-lock.json` (modify)
  - **Goal**: Add the one new npm dependency this feature introduces (research.md Decision 10; plan.md Complexity Tracking) — a browser-compatible Shapefile writer.
  - **Acceptance Criteria**: Dependency installs cleanly; `npm run build` still succeeds.
  - **Verification**: `npm install && npm run build`
  - **Dependencies**: None

- [X] T083 [P] "Query Keys" — extend `queryKeys.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/queryKeys.ts` (new)
  - **Goal**: Centralized factory functions for `analysisRuns`, `analysisRun`, `analysisPresets`, `measurementHistory`, `exportHistory` per contracts/client-api.md — no consumer ever builds a key with an inline array literal (matching the fix already applied to `database` in 004 Phase 9).
  - **Acceptance Criteria**: Every hook in Phase 6 imports its keys from this file.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T084 [P] "API helpers" — typed response handling for new shapes
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/analysisService.ts` (verification/typing only, same file as T076)
  - **Goal**: Confirm the existing shared `apiFetch` helper (no new helper introduced) correctly types the widened `AnalysisRun`/new entity response shapes.
  - **Acceptance Criteria**: No `any`/unchecked cast in any service method.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T076

- [X] T085 "API helpers" cont'd — typed `403 FORBIDDEN` handling
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/analysisService.ts` (modify, same file as T076)
  - **Goal**: Ensure a `403` response surfaces as a distinguishable error the UI can render as "you don't have permission," not a generic failure message.
  - **Acceptance Criteria**: `analysisStore.lastError` (Phase 7) can hold a permission-specific, safe-to-display message for this case.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T076, T084

- [X] T086 "Retry policies" — disable mutation retry for job creation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (configured in Phase 6, documented here as a service-layer contract note in `analysisService.ts`)
  - **Goal**: Document/enforce that `runAnalysis`'s React Query mutation MUST use `retry: false` — an automatic retry of a `POST` that already created a queued job would create a duplicate job.
  - **Acceptance Criteria**: No mutation that creates an `AnalysisRun`/`ExportJob` log entry auto-retries.
  - **Verification**: Covered by T104
  - **Dependencies**: T076

- [X] T087 "Retry policies" cont'd — query retry/backoff for polling
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (configured in Phase 6, documented here)
  - **Goal**: Document/enforce a small bounded retry count with backoff for `getRun` polling requests, so a single transient network blip doesn't stop the Progress Dialog from updating.
  - **Acceptance Criteria**: A simulated transient failure does not permanently stop polling; a persistent failure eventually surfaces an error state.
  - **Verification**: Covered by T104
  - **Dependencies**: T076

- [X] T088 [P] Service unit tests — `exportService.ts` shell
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/__tests__/exportService.test.ts` (new, shell — full per-format assertions land in Phase 15's T236)
  - **Goal**: Test that `exportLayerAsGeoJson` correctly re-exports `database`'s existing function with no behavior change.
  - **Acceptance Criteria**: Test passes; no duplicated GeoJSON-assembly logic exists between the two modules.
  - **Verification**: `npm run test -- exportService`
  - **Dependencies**: T081

- [X] T089 [P] Service unit tests — `measurementService.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/__tests__/measurementService.test.ts` (new)
  - **Goal**: Test live readouts against known geometries with known expected distance/area/bearing/azimuth values.
  - **Acceptance Criteria**: Values match expected results within a reasonable floating-point tolerance.
  - **Verification**: `npm run test -- measurementService`
  - **Dependencies**: T080

- [X] T090 Checkpoint (Phase 5)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the client service layer is complete and green before Phase 6 (React Query Hooks) begins.
  - **Acceptance Criteria**: All of T076–T089 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T076–T089

---

## Phase 6: React Query Hooks

**Purpose**: Data-fetching/mutation hooks over Phase 5's services. Per contracts/client-api.md, "Buffer hooks"/"Overlay hooks"/"Statistics hooks" are all the same `useRunAnalysis`/`useAnalysisRuns`/`useAnalysisRun` hooks (operation-agnostic) — this phase's tasks build the real hook set and verify each named category flows through it.

- [X] T091 Create `useAnalysis.ts` — core hooks
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (new)
  - **Goal**: Implement `useRunAnalysis(projectId)` and `useAnalysisRuns(projectId, params)` per contracts/client-api.md, with T086's `retry: false` applied to the mutation.
  - **Acceptance Criteria**: `useRunAnalysis`'s `onSuccess` invalidates `queryKeys.analysisRuns(projectId)`, and `database`'s `queryKeys.layers(projectId)` when `resultLayerId` is present.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T076, T083, T086

- [X] T092 [P] "Job hooks" — `useAnalysisRun` with polling
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (modify, same file as T091)
  - **Goal**: Implement `useAnalysisRun(runId, { poll? })` — sets `refetchInterval` from T001's constant while cached `status` is `"queued"`/`"running"`, stopping automatically at a terminal status (research.md Decision 5), with T087's bounded retry/backoff.
  - **Acceptance Criteria**: This is the Progress Dialog's sole data source.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T001, T064, T087, T091

- [X] T093 [P] "Job hooks" cont'd — cancel/discard mutations
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (modify, same file as T091)
  - **Goal**: Implement `useCancelAnalysis()` and `useDiscardAnalysisResult(projectId)` per contracts/client-api.md.
  - **Acceptance Criteria**: `useDiscardAnalysisResult`'s `onSuccess` invalidates both `analysisRuns(projectId)` and `database`'s `layers(projectId)`.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T066, T067, T091

- [X] T094 [P] "Buffer hooks" — confirm Buffer flows through `useRunAnalysis`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (verification only, same file as T091)
  - **Goal**: Type-check that `useRunAnalysis` correctly narrows for Buffer's parameter shape, giving Phase 8's form compile-time safety.
  - **Acceptance Criteria**: No `any` in the Buffer call path.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T077, T091

- [X] T095 [P] "Overlay hooks" — confirm Overlay flows through `useRunAnalysis`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (verification only, same file as T091)
  - **Goal**: Same as T094, for all 7 overlay operationTypes.
  - **Acceptance Criteria**: No `any` in any overlay call path.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T078, T091

- [X] T096 [P] "Statistics hooks" — confirm Statistics flows through `useRunAnalysis`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (verification only, same file as T091)
  - **Goal**: Same as T094, for all 8 statistics operationTypes — this is the Summarize UI's (Phase 13) data source.
  - **Acceptance Criteria**: No `any` in any statistics call path.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T057, T091

- [X] T097 [P] "Measurement hooks" — `useMeasurements.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useMeasurements.ts` (new)
  - **Goal**: Implement `useMeasurementHistory(projectId, params)`, `useSaveMeasurement(projectId)`, `useDeleteMeasurement(projectId)` per contracts/client-api.md.
  - **Acceptance Criteria**: `useSaveMeasurement`'s `onSuccess` invalidates `queryKeys.measurementHistory(projectId)` only.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T080, T083

- [X] T098 [P] "History hooks" — rerun/delete
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (modify, same file as T091)
  - **Goal**: Implement `useRerunAnalysis()`, `useDeleteAnalysisRun(projectId)` per contracts/client-api.md.
  - **Acceptance Criteria**: Matches 005's original (unbuilt) hook contract now actually implemented.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T068, T069, T091

- [X] T099 [P] "Preset hooks" — `useAnalysisPresets.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysisPresets.ts` (new)
  - **Goal**: Implement `usePresets(projectId, operationType?)`, `useSavePreset(projectId)`, `useDeletePreset(projectId)` per contracts/client-api.md.
  - **Acceptance Criteria**: Query-key-factory + invalidate-on-mutate shape matches every other hook in this feature.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T079, T083

- [X] T100 [P] "Export hooks" — `useExportHistory.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useExportHistory.ts` (new)
  - **Goal**: Implement `useExportHistory(projectId, params)` and `useExportResult()` per contracts/client-api.md.
  - **Acceptance Criteria**: `useExportResult` exposes `isPending`/`onSuccess`/`onError` even though it wraps client-side execution, not a network mutation.
  - **Verification**: `npx tsc --noEmit`; covered by T104
  - **Dependencies**: T081, T083

- [X] T101 [P] "Job hooks" cont'd — `useAnalysisPanel.ts` selector hooks
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysisPanel.ts` (new)
  - **Goal**: Thin named selector hooks over `analysisPanelStore` (Phase 7) per contracts/client-api.md — no component reaches into the raw store with an inline selector (Constitution Principle I).
  - **Acceptance Criteria**: Every field on `analysisPanelStore` has at least one corresponding selector hook.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T113

- [X] T102 Cache invalidation — cross-feature layer invalidation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysis.ts` (verification, same file as T091)
  - **Goal**: Confirm `useRunAnalysis`/`useDiscardAnalysisResult` correctly invalidate `database`'s `queryKeys.layers(projectId)` — consuming `database`'s public barrel only, never its internals (Constitution Principle I).
  - **Acceptance Criteria**: A new result layer appears in the Layers panel without a manual refresh.
  - **Verification**: Covered by T104/T133
  - **Dependencies**: T091, T093

- [X] T103 Cache invalidation cont'd — scoped invalidation for presets/measurements/exports
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysisPresets.ts`, `useMeasurements.ts`, `useExportHistory.ts` (verification, same files as T099/T097/T100)
  - **Goal**: Confirm each mutation invalidates only its own list query key — no unnecessary cross-invalidation.
  - **Acceptance Criteria**: Saving a preset does not invalidate `analysisRuns` or `measurementHistory`.
  - **Verification**: Covered by T104
  - **Dependencies**: T097, T099, T100

- [X] T104 [P] Hook tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/__tests__/useAnalysis.test.ts` (new), `src/features/analysis/hooks/__tests__/useAnalysisPresets.test.ts` (new), `src/features/analysis/hooks/__tests__/useMeasurements.test.ts` (new), `src/features/analysis/hooks/__tests__/useExportHistory.test.ts` (new)
  - **Goal**: Test `useAnalysisRun`'s polling start/stop behavior around status transitions (mocked timers) and every mutation hook's cache-invalidation targets from T102/T103.
  - **Acceptance Criteria**: Every hook exported from Phase 6 has at least one passing test.
  - **Verification**: `npm run test -- useAnalysis useAnalysisPresets useMeasurements useExportHistory`
  - **Dependencies**: T091–T103

- [X] T105 Checkpoint (Phase 6)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the hooks layer is complete and green before Phase 7 (Zustand Stores) begins.
  - **Acceptance Criteria**: All of T091–T104 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T091–T104

---

## Phase 7: Zustand Stores

**Purpose**: Client UI/configuration state. Per contracts/client-api.md and research.md's precedent (005 Decision 6 — one `analysisStore`, not many), the "Analysis Store"/"Measurement Store"/"Selection Store"/"History Store"/"Job Store"/"Preset Store" named in the roadmap outline are fields/actions on exactly **two** stores (`analysisStore`, `analysisPanelStore|`), not six separate stores — each task below says which store and field a named concept becomes.

- [X] T106 Create `analysisStore.ts` — base fields
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts` (new)
  - **Goal**: Implement `selectedOperationType`, `draftParameters`, `stagedInputLayerIds`, `isHistoryPanelOpen`, `lastError` + `setSelectedOperationType` (clears `draftParameters` on switch, mirroring `editingStore.setTool`), `setDraftParameters`, `stageInputLayer`/`unstageInputLayer`/`clearStagedInputLayers`, `toggleHistoryPanel`, `setLastError`/`clearLastError` — the 005 contract, finally built.
  - **Acceptance Criteria**: State mutations occur only through named store actions (Constitution Principle I).
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: None

- [X] T107 [P] "Analysis Store" cont'd — preset/active-run fields
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts` (modify, same file as T106)
  - **Goal**: Add `selectedPresetId`, `activeRunId` fields + `setActiveRunId`/`clearActiveRunId` actions per contracts/client-api.md.
  - **Acceptance Criteria**: `activeRunId` is what `ProgressDialog`/`ResultPanel` (Phase 16) read to know which run to display.
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T106

- [X] T108 [P] "Measurement Store" — `measurementDraft` on `analysisStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts` (modify, same file as T106)
  - **Goal**: Add `measurementDraft: { type, points } | null` + its setter — this field, not a separate store, *is* "Measurement Store" per this feature's approved consolidation.
  - **Acceptance Criteria**: `MeasureToolbar` (Phase 10) reads/writes only this field, not raw component state, for its in-progress reading.
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T106

- [X] T109 [P] "Selection Store" — `spatialQueryPredicate` on `analysisStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts` (modify, same file as T106)
  - **Goal**: Add `spatialQueryPredicate` field + setter for US2's in-progress Select-by-Location configuration — this field, not a separate store, *is* "Selection Store."
  - **Acceptance Criteria**: `stagedInputLayerIds` (T106) is reused for spatial query's source/reference layer selection, not duplicated.
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T106

- [X] T110 [P] "History Store" — `selectedHistoryRunId` on `analysisPanelStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisPanelStore.ts` (new, see T113)
  - **Goal**: Field driving the Property Panel (Phase 16) when a history row is selected — this field, not a separate store, *is* "History Store."
  - **Acceptance Criteria**: Selecting a row in `HistoryPanel` (Phase 14) sets this field via `selectHistoryRun`.
  - **Verification**: `npx tsc --noEmit`; covered by T118
  - **Dependencies**: T113

- [X] T111 [P] "Job Store" — active-job tracking actions
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts` (modify, same file as T106)
  - **Goal**: T107's `activeRunId`/`setActiveRunId`/`clearActiveRunId` *is* "Job Store" per this feature's consolidation — this task adds the wiring so `useRunAnalysis`'s `onSuccess` (Phase 6) calls `setActiveRunId` automatically.
  - **Acceptance Criteria**: After a successful `runAnalysis` call, `analysisStore.activeRunId` is set without an extra manual step in the calling component.
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T091, T107

- [X] T112 [P] "Preset Store" — apply/clear preset actions
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts` (modify, same file as T106)
  - **Goal**: Add `applyPreset(preset)` (sets `selectedPresetId` + `draftParameters` from the preset) / `clearPreset()` actions — T107's `selectedPresetId` field *is* "Preset Store."
  - **Acceptance Criteria**: `applyPreset` clears any previously staged `draftParameters` first, matching `setSelectedOperationType`'s clear-on-switch precedent (T106).
  - **Verification**: `npx tsc --noEmit`; covered by T117
  - **Dependencies**: T106, T107

- [X] T113 Create `analysisPanelStore.ts` — base fields
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisPanelStore.ts` (new)
  - **Goal**: Implement `isPanelOpen`, `dockPosition`, `panelWidth`, `activeTab` per contracts/client-api.md — deliberately separate from `analysisStore` (panel chrome vs. analysis configuration), mirroring `dashboard`'s `useSidebar` precedent.
  - **Acceptance Criteria**: This store has no knowledge of `operationType`/`parameters`/any analysis-domain concept.
  - **Verification**: `npx tsc --noEmit`; covered by T118
  - **Dependencies**: None

- [X] T114 [P] `analysisPanelStore` — actions
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisPanelStore.ts` (modify, same file as T113)
  - **Goal**: Implement `openPanel`/`closePanel`/`togglePanel`, `setDockPosition`, `setPanelWidth`, `setActiveTab`, `selectHistoryRun` per contracts/client-api.md.
  - **Acceptance Criteria**: Every field from T113/T110 has a corresponding action — no direct state mutation from any component.
  - **Verification**: `npx tsc --noEmit`; covered by T118
  - **Dependencies**: T110, T113

- [X] T115 "Persistence" — persist dock position/width
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisPanelStore.ts` (modify, same file as T113)
  - **Goal**: Wrap `analysisPanelStore` with Zustand's `persist` middleware (localStorage), persisting only `dockPosition`/`panelWidth` — matching this codebase's existing persisted-store precedent, if any (otherwise the first, documented as such).
  - **Acceptance Criteria**: A page reload restores the user's last dock position/width.
  - **Verification**: `npx tsc --noEmit`; covered by T119
  - **Dependencies**: T114

- [X] T116 "Persistence" cont'd — confirm `analysisStore` is session-only
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/analysisStore.ts` (verification, same file as T106)
  - **Goal**: Explicitly confirm `analysisStore`'s in-progress configuration fields (`draftParameters`, `stagedInputLayerIds`, `measurementDraft`, etc.) are NOT persisted — a stale draft surviving a reload would be confusing, not helpful.
  - **Acceptance Criteria**: No `persist` middleware wraps `analysisStore`.
  - **Verification**: Covered by T119
  - **Dependencies**: T106–T112

- [X] T117 [P] Store tests — `analysisStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/__tests__/analysisStore.test.ts` (new)
  - **Goal**: Test every action from T106–T112 — clear-on-switch behavior, stage/unstage, apply/clear preset, active-run tracking.
  - **Acceptance Criteria**: 100% of exported actions have at least one test.
  - **Verification**: `npm run test -- analysisStore`
  - **Dependencies**: T106–T112

- [X] T118 [P] Store tests — `analysisPanelStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/__tests__/analysisPanelStore.test.ts` (new)
  - **Goal**: Test every action from T113–T114.
  - **Acceptance Criteria**: 100% of exported actions have at least one test.
  - **Verification**: `npm run test -- analysisPanelStore`
  - **Dependencies**: T113, T114

- [X] T119 [P] Store tests — persistence round-trip
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/__tests__/analysisPanelStore.test.ts` (modify, same file as T118)
  - **Goal**: Test T115/T116 — `dockPosition`/`panelWidth` survive a simulated reload (re-instantiating the store from persisted storage); `analysisStore` fields do not.
  - **Acceptance Criteria**: Both positive (persisted) and negative (not persisted) assertions present.
  - **Verification**: `npm run test -- analysisPanelStore`
  - **Dependencies**: T115, T116

- [X] T120 Checkpoint (Phase 7)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the store layer is complete and green before Phase 8 (Buffer Analysis, US1) begins — this is the last cross-cutting phase before user-story-specific work starts.
  - **Acceptance Criteria**: All of T106–T119 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T106–T119

---

## Phase 8: Buffer Analysis (Priority: P1) 🎯 MVP — User Story 1

**Goal**: A user selects point/line/polygon features and generates a buffer at a specified distance/unit, optionally dissolved, per spec.md US1.

**Independent Test**: Select a layer, run Buffer with a distance/unit, confirm a new result layer with correctly-shaped buffered geometry appears — independent of every other operation category.

- [X] T121 [US1] Buffer parameter form
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (new — this task creates the shared form shell + the Buffer variant)
  - **Goal**: Distance input, unit selector (meters/kilometers/feet/miles), Dissolve toggle, wired to `analysisStore.draftParameters`.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US1.1/US1.4 (FR-001, FR-002).
  - **Verification**: `npx tsc --noEmit`; covered by T132
  - **Dependencies**: T094, T106

- [X] T122 [P] [US1] Point Buffer
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T039)
  - **Goal**: Confirm the buffer builder produces one circular buffer polygon per input point (spec.md Acceptance Scenario US1.1).
  - **Acceptance Criteria**: FR-001 satisfied for point geometry.
  - **Verification**: Covered by T134
  - **Dependencies**: T039, T121

- [X] T123 [P] [US1] Line Buffer
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T039)
  - **Goal**: Confirm the buffer builder produces a correct corridor polygon per input line (spec.md Acceptance Scenario US1.2).
  - **Acceptance Criteria**: FR-001 satisfied for line geometry.
  - **Verification**: Covered by T134
  - **Dependencies**: T039, T121

- [X] T124 [P] [US1] Polygon Buffer
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T039)
  - **Goal**: Confirm the buffer builder produces a correct expanded polygon per input polygon.
  - **Acceptance Criteria**: FR-001 satisfied for polygon geometry.
  - **Verification**: Covered by T134
  - **Dependencies**: T039, T121

- [X] T125 [US1] Units
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T121)
  - **Goal**: Wire the unit selector to T004's `toMeters` helper so the output reflects the correct distance regardless of the layer's stored CRS (spec.md Acceptance Scenario US1.4).
  - **Acceptance Criteria**: FR-002 satisfied.
  - **Verification**: Covered by T134
  - **Dependencies**: T004, T121

- [X] T126 [US1] Dissolve
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T121)
  - **Goal**: Wire the Dissolve toggle to T039's dissolve branch, producing one merged polygon instead of one per feature (spec.md Acceptance Scenario US1.3).
  - **Acceptance Criteria**: FR-003 satisfied.
  - **Verification**: Covered by T134
  - **Dependencies**: T039, T121

- [X] T127 [US1] Multiple selections
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T121)
  - **Goal**: Wire `analysisStore.stagedInputLayerIds`/current map selection into Buffer's `inputLayerIds`/feature-selection input (FR-026).
  - **Acceptance Criteria**: Running Buffer against a multi-feature selection (not a whole layer) works identically to a whole-layer run.
  - **Verification**: Covered by T133
  - **Dependencies**: T109, T121

- [X] T128 [US1] Preview
  - **Priority**: Should-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T121)
  - **Goal**: Live client-side Turf.js buffer preview on the map before submission — transient UI feedback only (Constitution Principle IV carve-out), never the persisted source of truth.
  - **Acceptance Criteria**: Preview updates as the user adjusts distance/unit, with no network request per keystroke.
  - **Verification**: Manual + covered by T132
  - **Dependencies**: T003, T121

- [X] T129 [US1] Result creation
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/ResultPanel.tsx` (new — this task creates the shell + wires Buffer's result)
  - **Goal**: Add to Project / Export / Discard actions functional for a Buffer result, using T093's `useDiscardAnalysisResult` and Phase 15's export hook (stubbed here, completed in Phase 15).
  - **Acceptance Criteria**: "Add to Project" makes the new layer visible in the Layers panel via T102's cache invalidation.
  - **Verification**: Covered by T133
  - **Dependencies**: T093, T121

- [X] T130 [US1] Toolbox Buffer entry
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (new — this task creates the shell + the Buffer category entry)
  - **Goal**: Buffer category entry wired to `analysisStore.setSelectedOperationType("buffer")`, reading from T006's catalog.
  - **Acceptance Criteria**: Selecting "Buffer" in the Toolbox opens T121's form.
  - **Verification**: Covered by T133
  - **Dependencies**: T006, T106, T121

- [X] T131 [US1] Progress Dialog wiring for Buffer
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/ProgressDialog.tsx` (new — this task creates the shell wired to Buffer; full build-out in Phase 16)
  - **Goal**: Subscribe to `useAnalysisRun(activeRunId, { poll: true })` (T092) so a Buffer run's progress is visible.
  - **Acceptance Criteria**: FR-027 satisfied for Buffer.
  - **Verification**: Covered by T133/T134
  - **Dependencies**: T092, T107, T121

- [X] T132 [P] [US1] Component tests — Buffer form
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/__tests__/OperationConfigForm.buffer.test.tsx` (new)
  - **Goal**: Test distance/unit/dissolve validation and ARIA labeling of T121's form.
  - **Acceptance Criteria**: Invalid distance (≤0) is rejected client-side with an accessible error message.
  - **Verification**: `npm run test -- OperationConfigForm.buffer`
  - **Dependencies**: T121

- [X] T133 [P] [US1] Integration test — full Buffer flow
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/__tests__/buffer.integration.test.tsx` (new)
  - **Goal**: Select layer → configure → run → result → add to project, matching quickstart.md §1.
  - **Acceptance Criteria**: All of spec.md's US1 Acceptance Scenarios (1–4) pass.
  - **Verification**: `npm run test -- buffer.integration`
  - **Dependencies**: T126, T127, T129, T130, T131

- [X] T134 [P] [US1] API test — Buffer through background path
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/app/api/analysis/__tests__/analysis.api.test.ts` (modify, extends T074)
  - **Goal**: Test Buffer against both a small (fast-path) and chunked-threshold (background-path) input, asserting T039's chunk-safe dissolve behavior.
  - **Acceptance Criteria**: SC-002 satisfied for Buffer specifically.
  - **Verification**: `npm run test:db -- analysis.api`
  - **Dependencies**: T039, T122, T123, T124, T125, T126

- [X] T135 [US1] Accessibility check — Buffer
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/analysis/components/__tests__/OperationConfigForm.buffer.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan of T121's form (FR-037, FR-038).
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- OperationConfigForm.buffer.a11y`
  - **Dependencies**: T121, T132

- [X] T136 [US1] Checkpoint (Phase 8) — MVP validation
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1 is fully functional and independently testable — this is the suggested MVP stopping point.
  - **Acceptance Criteria**: quickstart.md §1 passes end-to-end manually; all of T121–T135 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T121–T135

---

## Phase 9: Spatial Query (Priority: P1) — User Story 2

**Goal**: A user selects features by spatial relationship (Intersects/Within/Contains/Touches/Crosses/Overlaps/Nearest/Distance) or attribute filter, per spec.md US2.

**Independent Test**: Choose a source/reference layer and a predicate, run Select by Location, confirm the correct subset is selected — independent of Buffer/Overlay/etc.

- [X] T137 [US2] Select by Location parameter form
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, from T121 — adds the Query variant)
  - **Goal**: Source/reference layer pickers + predicate dropdown, wired to `analysisStore.spatialQueryPredicate`/`stagedInputLayerIds`.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenario US2.1.
  - **Verification**: `npx tsc --noEmit`; covered by T149
  - **Dependencies**: T054, T109, T121

- [X] T138 [P] [US2] Intersects predicate
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from 005's existing `spatialJoin` builder)
  - **Goal**: Confirm `ST_Intersects` path selects every source feature intersecting at least one reference feature (spec.md Acceptance Scenario US2.1).
  - **Acceptance Criteria**: FR-004 satisfied for Intersects.
  - **Verification**: Covered by T151
  - **Dependencies**: T137

- [X] T139 [P] [US2] Contains predicate
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification)
  - **Goal**: Confirm `ST_Contains` path (spec.md Acceptance Scenario US2.2).
  - **Acceptance Criteria**: FR-004 satisfied for Contains.
  - **Verification**: Covered by T151
  - **Dependencies**: T137

- [X] T140 [P] [US2] Within predicate
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification)
  - **Goal**: Confirm `ST_Within` path.
  - **Acceptance Criteria**: FR-004 satisfied for Within.
  - **Verification**: Covered by T151
  - **Dependencies**: T137

- [X] T141 [P] [US2] Touches predicate
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T041)
  - **Goal**: Confirm `buildSpatialPredicateSql`'s `ST_Touches` path.
  - **Acceptance Criteria**: FR-004 satisfied for Touches.
  - **Verification**: Covered by T151
  - **Dependencies**: T041, T137

- [X] T142 [P] [US2] Crosses predicate
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T041)
  - **Goal**: Confirm `ST_Crosses` path.
  - **Acceptance Criteria**: FR-004 satisfied for Crosses.
  - **Verification**: Covered by T151
  - **Dependencies**: T041, T137

- [X] T143 [P] [US2] Overlaps predicate
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T041)
  - **Goal**: Confirm `ST_Overlaps` path.
  - **Acceptance Criteria**: FR-004 satisfied for Overlaps.
  - **Verification**: Covered by T151
  - **Dependencies**: T041, T137

- [X] T144 [US2] Nearest
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T137)
  - **Goal**: Wire 005's existing `nearAnalysis` operationType to a "Nearest" mode in the Select-by-Location form, displaying the ranked id+distance per source feature (spec.md Acceptance Scenario US2.3).
  - **Acceptance Criteria**: FR-005 satisfied.
  - **Verification**: Covered by T151
  - **Dependencies**: T137

- [X] T145 [US2] Distance
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T137)
  - **Goal**: Add a search-distance parameter to the Select-by-Location form, wired to `ST_DWithin` filtering (FR-005).
  - **Acceptance Criteria**: Only features within the specified distance are selected.
  - **Verification**: Covered by T151
  - **Dependencies**: T137, T144

- [X] T146 [US2] Select by Location — map highlight wiring
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T137)
  - **Goal**: Wire predicate results into a map selection/highlight state consumed by the existing map feature-selection mechanism (reused, not duplicated).
  - **Acceptance Criteria**: Matching features visibly highlight on the map after the query runs.
  - **Verification**: Covered by T150
  - **Dependencies**: T137, T138–T145

- [X] T147 [US2] Select by Attribute
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T137 — new Attribute-filter variant)
  - **Goal**: Attribute filter expression input UI wired to T041's `selectByAttribute` builder (spec.md Acceptance Scenario US2.4).
  - **Acceptance Criteria**: FR-006 satisfied.
  - **Verification**: Covered by T151
  - **Dependencies**: T041, T137

- [X] T148 [US2] Combined spatial + attribute filter
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T137)
  - **Goal**: Allow chaining a spatial predicate and an attribute filter in one request (spec.md Acceptance Scenario US2.5).
  - **Acceptance Criteria**: FR-006 satisfied for the combined case.
  - **Verification**: Covered by T151
  - **Dependencies**: T146, T147

- [X] T149 [P] [US2] Component tests — Query forms
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/components/__tests__/OperationConfigForm.query.test.tsx` (new)
  - **Goal**: Test Select-by-Location/Select-by-Attribute form validation and ARIA labeling.
  - **Acceptance Criteria**: Every predicate option is keyboard-selectable.
  - **Verification**: `npm run test -- OperationConfigForm.query`
  - **Dependencies**: T137, T147

- [X] T150 [P] [US2] Integration test — full Spatial Query flow
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/analysis/__tests__/spatialQuery.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §2; asserts all of spec.md's US2 Acceptance Scenarios (1–5).
  - **Acceptance Criteria**: All 5 scenarios pass.
  - **Verification**: `npm run test -- spatialQuery.integration`
  - **Dependencies**: T146, T148

- [X] T151 [P] [US2] API test — every predicate
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/app/api/analysis/__tests__/analysis.api.test.ts` (modify, extends T074)
  - **Goal**: Test Touches/Crosses/Overlaps/Intersects/Within/Contains/Nearest/Distance against seeded fixtures with known expected results.
  - **Acceptance Criteria**: FR-004/FR-005 fully covered.
  - **Verification**: `npm run test:db -- analysis.api`
  - **Dependencies**: T138–T145

- [X] T152 [US2] Checkpoint (Phase 9)
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1 AND US2 both work independently.
  - **Acceptance Criteria**: quickstart.md §2 passes; all of T137–T151 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T137–T151

---

## Phase 10: Measurement Tools (Priority: P1) — User Story 3

**Goal**: A user interactively measures distance/area/perimeter/radius/bearing/azimuth/coordinates on the map, live, per spec.md US3.

**Independent Test**: Activate Measure Distance, click points, confirm live distance/bearing readouts update — independent of any saved layer or analysis job.

- [X] T153 [US3] `MeasureToolbar.tsx` shell
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (new)
  - **Goal**: Map-overlay control shell activating measurement modes, always available from the map toolbar (not gated behind the Analysis Panel), wired to `analysisStore.measurementDraft`.
  - **Acceptance Criteria**: Matches spec.md's framing of Measurement as independently available (US3 Independent Test).
  - **Verification**: `npx tsc --noEmit`; covered by T164
  - **Dependencies**: T108, T121

- [X] T154 [P] [US3] Distance
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Live cumulative distance readout via `measurementService`/`spatialMath.ts`, updating on each click with no network request (spec.md Acceptance Scenario US3.1).
  - **Acceptance Criteria**: FR-007 satisfied for Distance.
  - **Verification**: Covered by T164
  - **Dependencies**: T080, T153

- [X] T155 [P] [US3] Area
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Live area readout on closed-shape draw (spec.md Acceptance Scenario US3.2).
  - **Acceptance Criteria**: FR-007 satisfied for Area.
  - **Verification**: Covered by T164
  - **Dependencies**: T080, T153

- [X] T156 [P] [US3] Perimeter
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Live perimeter readout paired with Area (spec.md Acceptance Scenario US3.2).
  - **Acceptance Criteria**: FR-007 satisfied for Perimeter.
  - **Verification**: Covered by T164
  - **Dependencies**: T155

- [X] T157 [P] [US3] Bearing
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Per-segment bearing readout paired with Distance (spec.md Acceptance Scenario US3.1).
  - **Acceptance Criteria**: FR-007 satisfied for Bearing.
  - **Verification**: Covered by T164
  - **Dependencies**: T154

- [X] T158 [P] [US3] Radius
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Center+drag radius tool with resulting circle preview (spec.md Acceptance Scenario US3.3).
  - **Acceptance Criteria**: FR-007 satisfied for Radius.
  - **Verification**: Covered by T164
  - **Dependencies**: T153

- [X] T159 [P] [US3] Coordinates
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Click/hover coordinate readout in the project's configured format, via T005's helper (spec.md Acceptance Scenario US3.4).
  - **Acceptance Criteria**: FR-007 satisfied for Coordinates.
  - **Verification**: Covered by T164
  - **Dependencies**: T005, T153

- [X] T160 [P] [US3] Azimuth
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Azimuth readout, live client-side and server-recomputed via `ST_Azimuth` on save (research.md Decision 8).
  - **Acceptance Criteria**: FR-007 satisfied for Azimuth.
  - **Verification**: Covered by T164
  - **Dependencies**: T046, T153

- [X] T161 [US3] Elevation placeholder
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: Clearly labeled "not available" placeholder for an elevation reading, never a fabricated value (spec.md Acceptance Scenario US3.6).
  - **Acceptance Criteria**: FR-009 satisfied.
  - **Verification**: Covered by T165
  - **Dependencies**: T153

- [X] T162 [US3] Save to History
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153)
  - **Goal**: "Save to History" action wired to `useSaveMeasurement` (T097), triggering T046's server-side recompute (spec.md Acceptance Scenario US3 / research.md Decision 8).
  - **Acceptance Criteria**: FR-008 satisfied; saved value may differ negligibly from the live client readout (expected, documented).
  - **Verification**: Covered by T165
  - **Dependencies**: T097, T153

- [X] T163 [US3] Measurement History list UI
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/MeasureToolbar.tsx` (modify, same file as T153, or a small sibling `MeasurementHistoryList.tsx` if the toolbar file grows too large)
  - **Goal**: List UI wired to `useMeasurementHistory` (T097).
  - **Acceptance Criteria**: Saved measurements from T162 appear in this list.
  - **Verification**: Covered by T165
  - **Dependencies**: T097, T162

- [X] T164 [P] [US3] Component tests — `MeasureToolbar`
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/components/__tests__/MeasureToolbar.test.tsx` (new)
  - **Goal**: Test live readout accuracy against known geometries with known expected values (reusing T089's fixtures where applicable).
  - **Acceptance Criteria**: Every measurement type from FR-007 has a passing assertion.
  - **Verification**: `npm run test -- MeasureToolbar`
  - **Dependencies**: T154–T160

- [X] T165 [P] [US3] Integration test — full Measurement flow
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/analysis/__tests__/measurement.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §3, including the save/recompute-mismatch tolerance check.
  - **Acceptance Criteria**: All of spec.md's US3 Acceptance Scenarios (1–6) pass.
  - **Verification**: `npm run test -- measurement.integration`
  - **Dependencies**: T161, T162, T163

- [X] T166 [US3] Checkpoint (Phase 10)
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1, US2, AND US3 all work independently.
  - **Acceptance Criteria**: quickstart.md §3 passes; all of T153–T165 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T153–T165

---

## Phase 11: Overlay Analysis (Priority: P1) — User Story 4

**Goal**: A user combines/compares two layers via Union/Intersection/Difference/Clip/Erase/Identity/Symmetrical Difference, per spec.md US4.

**Independent Test**: Select two overlapping polygon layers, run Intersection, confirm the result contains only the shared area — independent of any other overlay operation.

- [X] T167 [US4] Overlay parameter form
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, from T121 — adds the Overlay variant)
  - **Goal**: Two-layer input picker (labelled per-operation, e.g. "target"/"clip boundary" for Clip), wired to `analysisStore.stagedInputLayerIds`.
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenarios US4.1–7.
  - **Verification**: `npx tsc --noEmit`; covered by T178
  - **Dependencies**: T055, T109, T121

- [X] T168 [P] [US4] Union
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `union` builder)
  - **Goal**: Confirm existing `union` operationType/builder wired through the new background-job path (T033–T034).
  - **Acceptance Criteria**: FR-010 satisfied for Union (spec.md Acceptance Scenario US4.2).
  - **Verification**: Covered by T180
  - **Dependencies**: T034, T167

- [X] T169 [P] [US4] Intersection
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `intersect` builder)
  - **Goal**: Confirm existing builder wired through the background-job path (spec.md Acceptance Scenario US4.1).
  - **Acceptance Criteria**: FR-010 satisfied for Intersection.
  - **Verification**: Covered by T180
  - **Dependencies**: T034, T167

- [X] T170 [P] [US4] Difference
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `difference` builder)
  - **Goal**: Confirm existing builder wired through the background-job path (spec.md Acceptance Scenario US4.3).
  - **Acceptance Criteria**: FR-010 satisfied for Difference.
  - **Verification**: Covered by T180
  - **Dependencies**: T034, T167

- [X] T171 [P] [US4] Clip
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `clip` builder)
  - **Goal**: Confirm existing builder preserves input-only attributes (spec.md Acceptance Scenario US4.4).
  - **Acceptance Criteria**: FR-010 satisfied for Clip.
  - **Verification**: Covered by T180
  - **Dependencies**: T034, T167

- [X] T172 [P] [US4] Erase
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T040)
  - **Goal**: Confirm `buildEraseSql` wired through the endpoint (spec.md Acceptance Scenario US4.5).
  - **Acceptance Criteria**: FR-010 satisfied for Erase.
  - **Verification**: Covered by T180
  - **Dependencies**: T040, T167

- [X] T173 [P] [US4] Identity
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T040)
  - **Goal**: Confirm `buildIdentitySql` wired through the endpoint (spec.md Acceptance Scenario US4.6).
  - **Acceptance Criteria**: FR-010 satisfied for Identity.
  - **Verification**: Covered by T180
  - **Dependencies**: T040, T167

- [X] T174 [P] [US4] Symmetrical Difference
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T040)
  - **Goal**: Confirm `buildSymmetricalDifferenceSql` wired through the endpoint (spec.md Acceptance Scenario US4.7).
  - **Acceptance Criteria**: FR-010 satisfied for Symmetrical Difference.
  - **Verification**: Covered by T180
  - **Dependencies**: T040, T167

- [X] T175 [US4] Toolbox Overlay entries
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (modify, from T130)
  - **Goal**: Overlay category entries for all 7 operations, reading from T006's catalog.
  - **Acceptance Criteria**: All 7 operations selectable from the Toolbox.
  - **Verification**: Covered by T179
  - **Dependencies**: T130, T167

- [X] T176 [US4] Overlay result attribute-merge display
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/analysis/components/ResultPanel.tsx` (modify, from T129)
  - **Goal**: Display attributes from both input layers where an overlay operation merges them (Union/Identity), per spec.md Acceptance Scenario US4.2/US4.6.
  - **Acceptance Criteria**: Union/Identity results visibly show both layers' attributes.
  - **Verification**: Covered by T179
  - **Dependencies**: T129, T167

- [X] T177 [US4] CRS mismatch handling
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/server/repositories/analysisRepository.ts` (modify, from T033)
  - **Goal**: Automatic reprojection between mismatched-CRS input layers before an overlay runs, per spec.md Edge Cases and research.md Decision 13 (`ST_Transform`, never silently incorrect).
  - **Acceptance Criteria**: FR-033 satisfied.
  - **Verification**: Covered by T180
  - **Dependencies**: T033, T167

- [X] T178 [P] [US4] Component tests — Overlay form
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/analysis/components/__tests__/OperationConfigForm.overlay.test.tsx` (new)
  - **Goal**: Test two-layer selection validation and per-operation labelling.
  - **Acceptance Criteria**: Selecting fewer than 2 layers is rejected client-side with an accessible message.
  - **Verification**: `npm run test -- OperationConfigForm.overlay`
  - **Dependencies**: T167

- [X] T179 [P] [US4] Integration test — full Overlay flow
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/analysis/__tests__/overlay.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §4; all 7 operations exercised.
  - **Acceptance Criteria**: All of spec.md's US4 Acceptance Scenarios (1–7) pass.
  - **Verification**: `npm run test -- overlay.integration`
  - **Dependencies**: T175, T176

- [X] T180 [P] [US4] API test — Erase/Identity/Symmetrical Difference
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/app/api/analysis/__tests__/analysis.api.test.ts` (modify, extends T074)
  - **Goal**: Test against seeded overlapping polygon fixtures with known expected results, plus T177's CRS-mismatch reprojection.
  - **Acceptance Criteria**: FR-010/FR-033 fully covered for the 3 new operations.
  - **Verification**: `npm run test:db -- analysis.api`
  - **Dependencies**: T172, T173, T174, T177

- [X] T181 [US4] Accessibility check — Overlay
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/analysis/components/__tests__/OperationConfigForm.overlay.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan of T167's form.
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- OperationConfigForm.overlay.a11y`
  - **Dependencies**: T167, T178

- [X] T182 [US4] Checkpoint (Phase 11)
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US4 all work independently.
  - **Acceptance Criteria**: quickstart.md §4 passes; all of T167–T181 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T167–T181

---

## Phase 12: Geometry Processing (Priority: P2) — User Story 5

**Goal**: A user simplifies/smooths/splits/merges/dissolves/converts multipart↔singlepart/repairs geometry, per spec.md US5.

**Independent Test**: Select a vertex-heavy feature, run Simplify with a tolerance, confirm fewer vertices while remaining valid and recognizable — independent of any other geometry operation.

- [X] T183 [US5] Geometry Processing parameter forms
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, from T121 — adds the Geometry Processing variants)
  - **Goal**: Tolerance slider (Simplify, using the `Slider` UI primitive), split-line draw trigger (Split), attribute picker (Dissolve, reused from 005), no-parameter confirm (Smooth/Repair/Multipart conversions).
  - **Acceptance Criteria**: Matches spec.md Acceptance Scenarios US5.1–7.
  - **Verification**: `npx tsc --noEmit`; covered by T195
  - **Dependencies**: T056, T121

- [X] T184 [P] [US5] Simplify
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T043)
  - **Goal**: Confirm `buildSimplifySql` wired through the endpoint with the tolerance parameter (spec.md Acceptance Scenario US5.1).
  - **Acceptance Criteria**: FR-011 satisfied for Simplify.
  - **Verification**: Covered by T197
  - **Dependencies**: T043, T183

- [X] T185 [P] [US5] Smooth
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T043)
  - **Goal**: Confirm `buildSmoothSql` wired through the endpoint; PostGIS ≥3.2 version requirement documented (spec.md Acceptance Scenario US5.2, research.md Decision 7).
  - **Acceptance Criteria**: FR-011 satisfied for Smooth.
  - **Verification**: Covered by T197
  - **Dependencies**: T043, T183

- [X] T186 [P] [US5] Merge
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `merge` builder)
  - **Goal**: Confirm existing builder wired through the background-job path (spec.md Acceptance Scenario US5.4).
  - **Acceptance Criteria**: FR-012 satisfied for Merge.
  - **Verification**: Covered by T197
  - **Dependencies**: T034, T183

- [X] T187 [P] [US5] Split
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx` (modify, same file as T183)
  - **Goal**: Confirm existing `split` builder + wire the split-line draw interaction via Leaflet-Geoman (spec.md Acceptance Scenario US5.3).
  - **Acceptance Criteria**: FR-012 satisfied for Split.
  - **Verification**: Covered by T197
  - **Dependencies**: T034, T183

- [X] T188 [P] [US5] Repair Geometry
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T043)
  - **Goal**: Confirm `buildRepairGeometrySql`'s "could not repair" path surfaces a clear message, not a silent failure (spec.md Acceptance Scenario US5.8).
  - **Acceptance Criteria**: FR-015 satisfied.
  - **Verification**: Covered by T197
  - **Dependencies**: T043, T183

- [X] T189 [P] [US5] Multipart to Singlepart
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T043)
  - **Goal**: Confirm `buildMultipartConversionSql` (`ST_Dump`) copies attributes to every resulting part (spec.md Acceptance Scenario US5.6).
  - **Acceptance Criteria**: FR-014 satisfied for Multipart→Singlepart.
  - **Verification**: Covered by T197
  - **Dependencies**: T043, T183

- [X] T190 [P] [US5] Singlepart to Multipart
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T043)
  - **Goal**: Confirm `buildMultipartConversionSql` (`ST_Collect`/`ST_Multi`) combines selected parts (spec.md Acceptance Scenario US5.7).
  - **Acceptance Criteria**: FR-014 satisfied for Singlepart→Multipart.
  - **Verification**: Covered by T197
  - **Dependencies**: T043, T183

- [X] T191 [US5] Toolbox Geometry Processing entries
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (modify, from T130)
  - **Goal**: Geometry Processing category entries for all 8 operations (3 existing + 5 new), reading from T006's catalog.
  - **Acceptance Criteria**: All 8 operations selectable from the Toolbox.
  - **Verification**: Covered by T196
  - **Dependencies**: T130, T183

- [X] T192 [US5] No-op handling
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (modify, from T043)
  - **Goal**: Simplify/Smooth/Repair on an already-simple/valid feature completes successfully with a clear "no change needed" result, not an error (spec.md Edge Cases).
  - **Acceptance Criteria**: FR requirement implied by spec Edge Cases satisfied; no thrown exception for this case.
  - **Verification**: Covered by T198
  - **Dependencies**: T043, T184, T185, T188

- [X] T193 [US5] Validation rejection
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/shared/contracts/analysis.schema.ts` (modify, from T070)
  - **Goal**: Split without a valid split line / Merge on incompatible geometry types rejected with a specific, actionable message before running (spec.md Edge Cases).
  - **Acceptance Criteria**: `400 INVALID_INPUT` with a message naming the specific problem.
  - **Verification**: Covered by T198
  - **Dependencies**: T070, T187, T186

- [X] T194 [US5] Topology validation audit
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T043)
  - **Goal**: Confirm every geometry-producing builder added in this phase runs `ST_IsValid` before persisting its result (Constitution Principle IV).
  - **Acceptance Criteria**: No builder in this phase can persist invalid geometry silently.
  - **Verification**: Covered by T197
  - **Dependencies**: T043, T184, T185, T188, T189, T190

- [X] T195 [P] [US5] Component tests — Geometry Processing forms
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/analysis/components/__tests__/OperationConfigForm.geometry.test.tsx` (new)
  - **Goal**: Test tolerance slider, split-line trigger, and repair-confirm form variants.
  - **Acceptance Criteria**: Every parameter type has a passing validation test.
  - **Verification**: `npm run test -- OperationConfigForm.geometry`
  - **Dependencies**: T183

- [X] T196 [P] [US5] Integration test — full Geometry Processing flow
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/analysis/__tests__/geometryProcessing.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §5 (Simplify + Repair + Multipart conversion).
  - **Acceptance Criteria**: quickstart.md §5's three scenarios pass.
  - **Verification**: `npm run test -- geometryProcessing.integration`
  - **Dependencies**: T191

- [X] T197 [P] [US5] API test — Split/Merge/Dissolve/Multipart/Repair
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/app/api/analysis/__tests__/analysis.api.test.ts` (modify, extends T074)
  - **Goal**: Test against seeded fixtures including one deliberately invalid geometry; asserts T044's chunk-safe Dissolve invariant.
  - **Acceptance Criteria**: All of spec.md's US5 Acceptance Scenarios (1–8) pass.
  - **Verification**: `npm run test:db -- analysis.api`
  - **Dependencies**: T044, T184–T190, T194

- [X] T198 [P] [US5] API test — no-op and validation-rejection edge cases
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/app/api/analysis/__tests__/analysis.api.test.ts` (modify, extends T074)
  - **Goal**: Test T192's no-op behavior and T193's rejection messages.
  - **Acceptance Criteria**: spec.md's Edge Cases for Simplify/Smooth/Repair no-op and Split/Merge rejection both covered.
  - **Verification**: `npm run test:db -- analysis.api`
  - **Dependencies**: T192, T193

- [X] T199 [US5] Accessibility check — Geometry Processing
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/analysis/components/__tests__/OperationConfigForm.geometry.a11y.test.tsx` (new)
  - **Goal**: Keyboard-only traversal + axe scan of T183's forms, including the `Slider` primitive.
  - **Acceptance Criteria**: Zero critical/serious axe violations.
  - **Verification**: `npm run test -- OperationConfigForm.geometry.a11y`
  - **Dependencies**: T183, T195

- [X] T200 [US5] Checkpoint (Phase 12)
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US5 all work independently.
  - **Acceptance Criteria**: quickstart.md §5 passes; all of T183–T199 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T183–T199

---

## Phase 13: Spatial Statistics (Priority: P2) — User Story 6

**Goal**: A user requests feature count/area/length/density/bbox/centroid/convex hull/extent for a layer or selection, per spec.md US6.

**Independent Test**: Select a layer, run Summarize, confirm feature count/total area/bounding box match the underlying data — independent of any other analysis operation.

- [X] T201 [US6] Summarize Toolbox entry
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (modify, from T130)
  - **Goal**: Statistics category entry running Summarize against the current layer/selection — no full parameter form needed (spec.md Acceptance Scenario US6.1).
  - **Acceptance Criteria**: Selecting "Summarize" runs immediately against the current selection/layer.
  - **Verification**: `npx tsc --noEmit`; covered by T213
  - **Dependencies**: T057, T130

- [X] T202 [P] [US6] Feature Count
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T042)
  - **Goal**: Confirm `buildStatisticsSql`'s `featureCount` (`COUNT(*)`) path (spec.md Acceptance Scenario US6.1).
  - **Acceptance Criteria**: FR-016 satisfied for Feature Count.
  - **Verification**: Covered by T213
  - **Dependencies**: T042, T201

- [X] T203 [P] [US6] Area Statistics
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T042)
  - **Goal**: Confirm total + average area (`ST_Area` aggregate) for polygon inputs (spec.md Acceptance Scenario US6.2).
  - **Acceptance Criteria**: FR-016 satisfied for Area Statistics.
  - **Verification**: Covered by T213
  - **Dependencies**: T042, T201

- [X] T204 [P] [US6] Length Statistics
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T042)
  - **Goal**: Confirm total + average length (`ST_Length` aggregate) for line inputs (spec.md Acceptance Scenario US6.3).
  - **Acceptance Criteria**: FR-016 satisfied for Length Statistics.
  - **Verification**: Covered by T213
  - **Dependencies**: T042, T201

- [X] T205 [P] [US6] Density
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `densityAnalysis` builder)
  - **Goal**: Confirm existing builder wired through the endpoint for point inputs (spec.md Acceptance Scenario US6.4).
  - **Acceptance Criteria**: FR-016 satisfied for Density.
  - **Verification**: Covered by T213
  - **Dependencies**: T201

- [X] T206 [P] [US6] Extent
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, from T042)
  - **Goal**: Confirm `buildStatisticsSql`'s `extent` (`ST_Extent`) path (spec.md Acceptance Scenario US6.5).
  - **Acceptance Criteria**: FR-016 satisfied for Extent.
  - **Verification**: Covered by T213
  - **Dependencies**: T042, T201

- [X] T207 [P] [US6] Bounding Box
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `boundingBox` builder)
  - **Goal**: Confirm existing builder wired through the endpoint (spec.md Acceptance Scenario US6.5).
  - **Acceptance Criteria**: FR-016 satisfied for Bounding Box.
  - **Verification**: Covered by T213
  - **Dependencies**: T201

- [X] T208 [P] [US6] Centroid
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `centroid` builder)
  - **Goal**: Confirm existing builder wired through the endpoint (spec.md Acceptance Scenario US6.5).
  - **Acceptance Criteria**: FR-016 satisfied for Centroid.
  - **Verification**: Covered by T213
  - **Dependencies**: T201

- [X] T209 [P] [US6] Convex Hull
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/server/repositories/analysisOperations.ts` (verification, 005's existing `convexHull` builder)
  - **Goal**: Confirm existing builder wired through the endpoint (spec.md Acceptance Scenario US6.5).
  - **Acceptance Criteria**: FR-016 satisfied for Convex Hull.
  - **Verification**: Covered by T213
  - **Dependencies**: T201

- [X] T210 [US6] Summary Report
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/analysis/components/AnalysisSummary.tsx` (new — shell created here, wired into the panel in Phase 16)
  - **Goal**: Aggregate view over the current run listing (counts by status/operationType), the data-source component for US10's "Analysis Summary" requirement, built here since it consumes Statistics-category data first.
  - **Acceptance Criteria**: FR-016's Summarize output and a project-wide run-count summary both render from this component.
  - **Verification**: `npx tsc --noEmit`; covered by T213
  - **Dependencies**: T096, T201

- [X] T211 [US6] `StatisticsCards`
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/analysis/components/StatisticsCards.tsx` (new)
  - **Goal**: Result display cards for Summarize output — feature count/area/length/density/bbox/centroid/hull/extent, each a labelled card.
  - **Acceptance Criteria**: Every statistic from FR-016 has a corresponding card.
  - **Verification**: `npx tsc --noEmit`; covered by T212
  - **Dependencies**: T201–T209

- [X] T212 [P] [US6] Component tests — `StatisticsCards`
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/analysis/components/__tests__/StatisticsCards.test.tsx` (new)
  - **Goal**: Test rendering per result shape (polygon/line/point layer variants render only their applicable statistics).
  - **Acceptance Criteria**: A point layer's card set omits area/length; a polygon layer's includes them.
  - **Verification**: `npm run test -- StatisticsCards`
  - **Dependencies**: T211

- [X] T213 [P] [US6] Integration + API tests — full Statistics flow
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/analysis/__tests__/statistics.integration.test.tsx` (new), `src/app/api/analysis/__tests__/analysis.api.test.ts` (modify, extends T074)
  - **Goal**: Matches quickstart.md §6, covering polygon/line/point layer variants.
  - **Acceptance Criteria**: All of spec.md's US6 Acceptance Scenarios (1–5) pass.
  - **Verification**: `npm run test -- statistics.integration && npm run test:db -- analysis.api`
  - **Dependencies**: T202–T209, T211

- [X] T214 [US6] Checkpoint (Phase 13)
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US6 all work independently.
  - **Acceptance Criteria**: quickstart.md §6 passes; all of T201–T213 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T201–T213

---

## Phase 14: Analysis History (Priority: P2) — User Story 8

**Goal**: A user reviews every analysis run's parameters/inputs/outputs/timing/user, re-runs a prior analysis, and manages presets, per spec.md US8.

**Independent Test**: Run any single analysis, open the History panel, confirm an entry appears with correct parameters and a working Re-run action — independent of which analysis type was run.

- [X] T215 [US8] History storage end-to-end confirmation
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/server/repositories/__tests__/analysisRepository.test.ts` (verification, from T048)
  - **Goal**: Confirm `AnalysisRun`'s extended lifecycle fields (`executionTimeMs`, `startedAt`, `completedAt`, `userId`) are fully populated for every operation category built in Phases 8–13 (FR-019).
  - **Acceptance Criteria**: No run from any prior phase has a null `executionTimeMs` after reaching a terminal status.
  - **Verification**: `npm run test:db -- analysisRepository`
  - **Dependencies**: T048, T136, T152, T166, T182, T200, T214

- [X] T216 [US8] `HistoryPanel.tsx`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/HistoryPanel.tsx` (new)
  - **Goal**: List UI wired to `useAnalysisRuns` (T091), showing operation type/parameters/timestamp/user per row (spec.md Acceptance Scenario US8.1).
  - **Acceptance Criteria**: FR-019 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T223
  - **Dependencies**: T091, T216 self (T098 for rerun/delete wiring in T219/T220)

- [X] T217 [US8] History filters
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/HistoryPanel.tsx` (modify, same file as T216)
  - **Goal**: Status filter UI (queued/running/succeeded/failed/cancelled) wired to `GET .../analysis?status=` (T052).
  - **Acceptance Criteria**: Filtering updates the list without a full page reload.
  - **Verification**: Covered by T223
  - **Dependencies**: T052, T216

- [X] T218 [US8] View Result (practical "restore")
  - **Priority**: Should-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/HistoryPanel.tsx` (modify, same file as T216)
  - **Goal**: Per research.md Decision 14, undo is single-level (discard only) — this task instead wires a **View Result** action that loads a selected run's parameters into a fresh `OperationConfigForm` draft, satisfying the practical "get back to a past configuration" need without a general undo/redo stack.
  - **Acceptance Criteria**: Clicking "View Result" on a discarded run pre-fills the form with its original parameters, ready to re-run.
  - **Verification**: Covered by T223
  - **Dependencies**: T112, T216

- [X] T219 [US8] History rerun
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/HistoryPanel.tsx` (modify, same file as T216)
  - **Goal**: "Re-run" button wired to `useRerunAnalysis` (T098); "Re-run with changes" pre-fills `OperationConfigForm` via `analysisStore.setDraftParameters` (spec.md Acceptance Scenario US8.2/US8.3).
  - **Acceptance Criteria**: FR-020/FR-025 satisfied.
  - **Verification**: Covered by T223
  - **Dependencies**: T098, T216

- [X] T220 [US8] History delete
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/HistoryPanel.tsx` (modify, same file as T216)
  - **Goal**: "Delete" button wired to `useDeleteAnalysisRun` (T098) with an `AlertDialog` confirmation.
  - **Acceptance Criteria**: Deleting a history entry never affects its result layer (unchanged 005 behavior, FR-026).
  - **Verification**: Covered by T223
  - **Dependencies**: T098, T216

- [X] T221 [US8] `PropertyPanel.tsx`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/PropertyPanel.tsx` (new)
  - **Goal**: Full parameter/status detail for one selected history run, driven by `analysisPanelStore.selectedHistoryRunId` (T110) (spec.md's US10 Acceptance Scenario 5, data-consumed-here from US8).
  - **Acceptance Criteria**: Every field of the selected `AnalysisRun` is visible.
  - **Verification**: `npx tsc --noEmit`; covered by T223
  - **Dependencies**: T110, T216

- [X] T222 [US8] `PresetPicker.tsx`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/PresetPicker.tsx` (new)
  - **Goal**: "Save as preset" action from any completed run's parameters (wired to `useSavePreset`, T099) + preset quick-start list inside `OperationConfigForm` (wired to `usePresets`/`applyPreset`, T099/T112) (spec.md Acceptance Scenario US8.5).
  - **Acceptance Criteria**: FR-021 satisfied.
  - **Verification**: `npx tsc --noEmit`; covered by T223
  - **Dependencies**: T099, T112, T121

- [X] T223 [P] [US8] Component tests — History/Property/Preset
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/components/__tests__/HistoryPanel.test.tsx` (new), `src/features/analysis/components/__tests__/PropertyPanel.test.tsx` (new), `src/features/analysis/components/__tests__/PresetPicker.test.tsx` (new)
  - **Goal**: Test filter/rerun/delete/view-result actions and preset save/apply.
  - **Acceptance Criteria**: Every button in these three components has a passing interaction test.
  - **Verification**: `npm run test -- HistoryPanel PropertyPanel PresetPicker`
  - **Dependencies**: T217–T222

- [X] T224 [P] [US8] Integration test — full History flow
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/analysis/__tests__/history.integration.test.tsx` (new)
  - **Goal**: List → filter → rerun → delete → preset save/apply, matching quickstart.md §8.
  - **Acceptance Criteria**: All of spec.md's US8 Acceptance Scenarios (1–5) pass.
  - **Verification**: `npm run test -- history.integration`
  - **Dependencies**: T223

- [X] T225 [US8] Checkpoint (Phase 14)
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US6 and US8 all work independently.
  - **Acceptance Criteria**: quickstart.md §8 passes; all of T215–T224 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T215–T224

---

## Phase 15: Export Results (Priority: P3) — User Story 9

**Goal**: A user exports any analysis result as GeoJSON/Shapefile/CSV/KML, per spec.md US9.

**Independent Test**: Run any analysis that produces a result layer, export in each format, confirm a correctly formatted downloadable file — independent of which analysis produced the result.

- [ ] T226 [US9] `exportService.ts` — GeoJSON re-export wiring
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/exportService.ts` (modify, from T081)
  - **Goal**: Wire `exportLayerAsGeoJson` to import (not duplicate) `database/services/exportLayer.ts`'s existing function (research.md Decision 10).
  - **Acceptance Criteria**: No GeoJSON-assembly logic exists twice in the codebase.
  - **Verification**: `npx tsc --noEmit`; covered by T236
  - **Dependencies**: T081

- [ ] T227 [P] [US9] GeoJSON export for analysis results
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/exportService.ts` (modify, same file as T226)
  - **Goal**: `exportAnalysisResult(run, "geojson")` dispatching to T226 for a `resultLayerId`, or directly serializing `resultData` when there is none (spec.md Acceptance Scenario US9.1).
  - **Acceptance Criteria**: FR-022 satisfied for GeoJSON.
  - **Verification**: Covered by T237
  - **Dependencies**: T226

- [ ] T228 [P] [US9] CSV export
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/exportService.ts` (modify, same file as T226)
  - **Goal**: `exportLayerAsCsv` — pages through the Features API, flattens `attributes` to columns (spec.md Acceptance Scenario US9.3).
  - **Acceptance Criteria**: FR-022 satisfied for CSV.
  - **Verification**: Covered by T236/T237
  - **Dependencies**: T226

- [ ] T229 [P] [US9] KML export
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/exportService.ts` (modify, same file as T226)
  - **Goal**: `exportLayerAsKml` — hand-rolled GeoJSON→KML serializer, no new dependency (research.md Decision 10) (spec.md Acceptance Scenario US9.4).
  - **Acceptance Criteria**: FR-022 satisfied for KML.
  - **Verification**: Covered by T236/T237
  - **Dependencies**: T226

- [ ] T230 [P] [US9] Shapefile export
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/exportService.ts` (modify, same file as T226)
  - **Goal**: `exportLayerAsShapefile` — zipped `.shp`/`.shx`/`.dbf`/`.prj` via T082's new Shapefile-writer dependency (spec.md Acceptance Scenario US9.2).
  - **Acceptance Criteria**: FR-022 satisfied for Shapefile.
  - **Verification**: Covered by T236/T237
  - **Dependencies**: T082, T226

- [ ] T231 [US9] Download Manager — streamed assembly
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/exportService.ts` (modify, same file as T226)
  - **Goal**: Streamed Blob-part assembly + `onProgress(pagesLoaded, totalPages)` callback for large exports (research.md Decision 10), bounding memory at the 100,000-feature scale.
  - **Acceptance Criteria**: SC-002-adjacent responsiveness maintained during a large export.
  - **Verification**: Covered by T291
  - **Dependencies**: T227–T230

- [ ] T232 [US9] Download Manager — oversized-export warning
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/components/ResultPanel.tsx` (modify, from T129)
  - **Goal**: Soft warning threshold UI message before attempting a very large single-file export (spec.md Acceptance Scenario US9.5/Edge Cases).
  - **Acceptance Criteria**: FR-022's "clearly inform the user" requirement satisfied, never silent truncation.
  - **Verification**: Covered by T237
  - **Dependencies**: T129, T231

- [ ] T233 [US9] Export History logging
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/exportService.ts` (modify, same file as T226)
  - **Goal**: `logExport` (T081) called from every export's completion/failure handler.
  - **Acceptance Criteria**: Every export attempt (success or failure) produces one `ExportJob` row.
  - **Verification**: Covered by T237
  - **Dependencies**: T081, T227–T230

- [ ] T234 [US9] Export History UI
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/components/ResultPanel.tsx` (modify, same file as T232)
  - **Goal**: Export history list wired to `useExportHistory` (T100) (spec.md Acceptance Scenario US9's implied history visibility, consistent with US8's philosophy).
  - **Acceptance Criteria**: All four format exports appear in the list with format/timestamp/feature count.
  - **Verification**: Covered by T237
  - **Dependencies**: T100, T233

- [ ] T235 [P] [US9] Component tests — export progress UI
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/components/__tests__/ResultPanel.export.test.tsx` (new)
  - **Goal**: Test the export progress UI and format selector from T232/T234.
  - **Acceptance Criteria**: Format selector is keyboard-operable; progress announces via `aria-live`.
  - **Verification**: `npm run test -- ResultPanel.export`
  - **Dependencies**: T232, T234

- [ ] T236 [P] [US9] Service tests — per-format assembly
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/services/__tests__/exportService.test.ts` (modify, extends T088)
  - **Goal**: Full per-format structural assertions against a fixed feature set (GeoJSON validity, CSV column mapping, KML XML structure, Shapefile zip contents).
  - **Acceptance Criteria**: Each format's output is structurally valid per its spec.
  - **Verification**: `npm run test -- exportService`
  - **Dependencies**: T227–T230

- [ ] T237 [P] [US9] Integration test — full Export flow
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/analysis/__tests__/export.integration.test.tsx` (new)
  - **Goal**: All 4 formats matching quickstart.md §9; opening each in an external tool (e.g. QGIS) is documented as a manual SC-008 verification step, not automated.
  - **Acceptance Criteria**: All of spec.md's US9 Acceptance Scenarios (1–5) pass; SC-008 manually confirmed and noted in the test file's comment.
  - **Verification**: `npm run test -- export.integration`
  - **Dependencies**: T231, T232, T233, T234

- [ ] T238 [US9] Checkpoint (Phase 15)
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1–US6, US8, and US9 all work independently.
  - **Acceptance Criteria**: quickstart.md §9 passes; all of T226–T237 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T226–T237

---

## Phase 16: UI Components (Priority: P1) — User Story 10 (+ User Story 7)

**Goal**: A dockable Analysis Panel with Toolbox/Progress Dialog/Result Panel/History Panel/Property Panel/Analysis Summary, per spec.md US10; the Raster-Ready Framework catalog (US7) is assembled here as the Toolbox's Raster category.

**Independent Test**: Open the Analysis Panel, confirm the Toolbox lists all operation categories, dock/resize/collapse without affecting the map or other panels — independent of running any specific analysis.

- [ ] T239 [US10] `AnalysisPanel.tsx` shell mounted into `DashboardLayout`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx` (new), `src/features/dashboard/components/DashboardLayout.tsx` (modify)
  - **Goal**: Dockable shell mounted alongside the existing `<RightSidebar />`, following its exact `col-start-3`-style dock slot pattern (plan.md Structure Decision) (spec.md Acceptance Scenario US10.1).
  - **Acceptance Criteria**: FR-023 satisfied; the map and `RightSidebar` remain fully functional with the panel open.
  - **Verification**: `npx tsc --noEmit`; covered by T255
  - **Dependencies**: T113, T130

- [ ] T240 [US10] `analysisPanelStore` wiring — dock/resize/collapse
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx` (modify, same file as T239)
  - **Goal**: Functional dock position/resize/collapse behavior using T114's actions and T101's selector hooks (spec.md Acceptance Scenario US10.1).
  - **Acceptance Criteria**: Resizing/collapsing/moving the panel does not reflow or break the map.
  - **Verification**: Covered by T255
  - **Dependencies**: T101, T114, T239

- [ ] T241 [US10] `AnalysisToolbox.tsx` full assembly
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (modify, from T130/T175/T191/T201)
  - **Goal**: Full categorized listing (Buffer/Query/Measurement/Overlay/Geometry/Statistics/Raster & Surface) assembled from every prior phase's entries + T006's catalog (spec.md Acceptance Scenario US10.2).
  - **Acceptance Criteria**: FR-023 satisfied; every operation from spec.md US1–US7 is reachable from this one component.
  - **Verification**: Covered by T255
  - **Dependencies**: T130, T175, T191, T201

- [ ] T242 [US7] [US10] Raster & Surface Analysis category
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (modify, same file as T241)
  - **Goal**: Heatmap/Elevation/DEM/Slope/Aspect/Hillshade catalog entries with `implemented` flags from T006 (research.md Decision 9) (spec.md Acceptance Scenario US7.1).
  - **Acceptance Criteria**: FR-017 satisfied.
  - **Verification**: Covered by T257
  - **Dependencies**: T006, T241

- [ ] T243 [US7] Heatmap wiring
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (modify, same file as T241)
  - **Goal**: Client-side Turf.js point-density rendering reused unchanged from 005, wired into the Raster category's one enabled entry (spec.md Acceptance Scenario US7.4).
  - **Acceptance Criteria**: FR-018 satisfied; no `AnalysisRun` is created for a Heatmap render (client-only, per research.md Decision 9).
  - **Verification**: Covered by T257
  - **Dependencies**: T242

- [ ] T244 [US7] Non-Heatmap raster "not yet available" states
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/analysis/components/AnalysisToolbox.tsx` (modify, same file as T241), `src/server/repositories/analysisRepository.ts` (modify — reject with a specific "not yet implemented" error if invoked directly)
  - **Goal**: Disabled/"coming soon" Toolbox state for Elevation/DEM/Slope/Aspect/Hillshade + server-side rejection guard (spec.md Acceptance Scenario US7.2).
  - **Acceptance Criteria**: FR-017 satisfied; these entries are visibly distinguishable from a working tool, never silently identical.
  - **Verification**: Covered by T257
  - **Dependencies**: T242

- [ ] T245 [US10] Measurement tab wiring
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx` (modify, same file as T239)
  - **Goal**: Wire `MeasureToolbar` (built in Phase 10) into `AnalysisPanel`'s tab system as the Measurement tab.
  - **Acceptance Criteria**: Measurement remains reachable both from the always-available map toolbar (Phase 10) and from within the panel.
  - **Verification**: Covered by T255
  - **Dependencies**: T153, T239

- [ ] T246 [US10] `ProgressDialog.tsx` full implementation
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/ProgressDialog.tsx` (modify, from T131)
  - **Goal**: Live progress, elapsed-time indicator, and Cancel action, subscribing to `useAnalysisRun(id, { poll: true })` (T092) and `useCancelAnalysis` (T093) (spec.md Acceptance Scenario US10.3).
  - **Acceptance Criteria**: FR-024 satisfied.
  - **Verification**: Covered by T255
  - **Dependencies**: T092, T093, T131

- [ ] T247 [US10] `HistoryPanel` tab wiring
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx` (modify, same file as T239)
  - **Goal**: Wire `HistoryPanel` (built in Phase 14) into `AnalysisPanel`'s History tab.
  - **Acceptance Criteria**: History tab shows the same panel already tested in Phase 14.
  - **Verification**: Covered by T255
  - **Dependencies**: T216, T239

- [ ] T248 [US10] Preset Dialog
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/PresetPicker.tsx` (modify, from T222)
  - **Goal**: Save-preset modal with `AlertDialog`-based confirmation for an overwrite/duplicate-name collision (`DUPLICATE_NAME`, T059's error mapping).
  - **Acceptance Criteria**: FR-021 satisfied with a clear duplicate-name UX.
  - **Verification**: Covered by T255
  - **Dependencies**: T222

- [ ] T249 [US10] `ResultPanel.tsx` full implementation
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/ResultPanel.tsx` (modify, from T129/T176/T232/T234)
  - **Goal**: Output summary + Add to Project/Export/Discard actions, wired into `AnalysisPanel`'s Result tab (spec.md Acceptance Scenario US10.4).
  - **Acceptance Criteria**: FR-025 satisfied.
  - **Verification**: Covered by T255
  - **Dependencies**: T129, T176, T232, T234, T239

- [ ] T250 [US10] `StatisticsCards` wiring into `ResultPanel`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/ResultPanel.tsx` (modify, same file as T249)
  - **Goal**: Wire `StatisticsCards` (T211) into `ResultPanel` for statistics-type results.
  - **Acceptance Criteria**: A Summarize result renders as cards, not a raw JSON dump.
  - **Verification**: Covered by T255
  - **Dependencies**: T211, T249

- [ ] T251 [US10] `AnalysisSummary.tsx` wiring
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx` (modify, same file as T239)
  - **Goal**: Wire `AnalysisSummary` (T210) into `AnalysisPanel` as an overview/dashboard tab (spec.md Acceptance Scenario US10.5, Property Panel requirement).
  - **Acceptance Criteria**: FR-025 satisfied for the "Analysis Summary" requirement.
  - **Verification**: Covered by T255
  - **Dependencies**: T210, T239

- [ ] T252 [US10] Loading States
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx`, `HistoryPanel.tsx`, `ResultPanel.tsx` (all modify)
  - **Goal**: Skeleton/spinner states for Toolbox/History/Result panels while their queries are pending.
  - **Acceptance Criteria**: No panel renders a blank flash while data loads.
  - **Verification**: Covered by T256
  - **Dependencies**: T239, T247, T249

- [ ] T253 [US10] Empty States
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/HistoryPanel.tsx`, `PresetPicker.tsx`, `ResultPanel.tsx` (all modify)
  - **Goal**: "No history yet"/"no presets yet"/"no results yet" empty-state messaging.
  - **Acceptance Criteria**: Every list-shaped panel has a distinct, non-generic empty state.
  - **Verification**: Covered by T256
  - **Dependencies**: T216, T222, T249

- [ ] T254 [US10] Error States
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx` (modify, same file as T239)
  - **Goal**: `analysisStore.lastError`-driven error banners + a React error boundary wrapping `AnalysisPanel` (Constitution Additional Standards — Error Handling; every top-level feature mounted in the dashboard shell MUST be wrapped).
  - **Acceptance Criteria**: A thrown error inside any analysis component does not blank the entire dashboard.
  - **Verification**: Covered by T256
  - **Dependencies**: T085, T106, T239

- [ ] T255 [P] [US10] Component tests — panel dock/resize/collapse
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/__tests__/AnalysisPanel.test.tsx` (new)
  - **Goal**: Test T239–T251's dock/resize/collapse/tab-switch behavior.
  - **Acceptance Criteria**: Every tab is reachable and renders its wired-in component.
  - **Verification**: `npm run test -- AnalysisPanel`
  - **Dependencies**: T239–T251

- [ ] T256 [P] [US10] Component tests — loading/empty/error states
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/components/__tests__/AnalysisPanel.states.test.tsx` (new)
  - **Goal**: Test T252–T254's rendering across all panels.
  - **Acceptance Criteria**: Every state (loading/empty/error) has a passing render test.
  - **Verification**: `npm run test -- AnalysisPanel.states`
  - **Dependencies**: T252, T253, T254

- [ ] T257 [P] [US10] Integration test — full Analysis Workspace UI flow
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/analysis/__tests__/analysisWorkspace.integration.test.tsx` (new)
  - **Goal**: Matches quickstart.md §7 and §10 (Raster framework visibility + dock/resize/keyboard flow).
  - **Acceptance Criteria**: All of spec.md's US7 and US10 Acceptance Scenarios pass.
  - **Verification**: `npm run test -- analysisWorkspace.integration`
  - **Dependencies**: T242, T243, T244, T255

- [ ] T258 [US10] Checkpoint (Phase 16)
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: None (verification-only task)
  - **Goal**: Confirm every user story (US1–US10) now works both independently and as one integrated workspace.
  - **Acceptance Criteria**: quickstart.md §7 and §10 pass; all of T239–T257 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T239–T257

---

## Phase 17: Performance

**Purpose**: Verify and tune the feature against spec.md's Performance section (100,000 features, 100 simultaneous analyses) now that every operation exists end-to-end.

- [ ] T259 Large dataset optimization — chunk size tuning
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/types/analysisConfig.constants.ts` (modify, from T001)
  - **Goal**: Tune per-operation-category chunk sizes against real timing measurements from Phases 8–13's implementations (research.md Decision 5 follow-up noted in plan.md's Risks table).
  - **Acceptance Criteria**: SC-002 (95% of operations on ≤100k features return a result/clear failure with visible progress) achievable with the tuned values.
  - **Verification**: Covered by T268
  - **Dependencies**: T001, T136, T152, T166, T182, T200, T214

- [ ] T260 [P] Large dataset optimization — index query plans
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only, `EXPLAIN ANALYZE` run against the test database)
  - **Goal**: Verify `@@index([projectId, status])`/`[userId]`/`[presetId])` query plans via `EXPLAIN ANALYZE` on a seeded 100,000-feature dataset.
  - **Acceptance Criteria**: No sequential scan on any indexed lookup used by this feature's endpoints.
  - **Verification**: Manual `EXPLAIN ANALYZE` output review, documented in the PR
  - **Dependencies**: T023, T027

- [ ] T261 [P] Streaming — export memory profile
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: N/A (manual browser memory profiling)
  - **Goal**: Verify T231's streamed Blob-part assembly stays within a bounded memory profile at 100,000 features.
  - **Acceptance Criteria**: No out-of-memory failure in a Chrome DevTools memory profile of a 100k-feature export.
  - **Verification**: Manual profiling, documented in the PR
  - **Dependencies**: T231

- [ ] T262 [P] Pagination — large history performance
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: N/A (verification against seeded large history)
  - **Goal**: Verify every history listing's cursor pagination performs correctly at 10,000+ rows.
  - **Acceptance Criteria**: Page-N fetch time does not degrade meaningfully as N grows (keyset pagination property).
  - **Verification**: Manual timing check, documented in the PR
  - **Dependencies**: T037

- [ ] T263 [P] Database optimization — `statement_timeout` tuning
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/server/db/prismaClient.ts` (modify, if a connection-string-level timeout adjustment is needed)
  - **Goal**: Tune Postgres's `statement_timeout` for chunked PostGIS queries so a single pathological chunk fails cleanly rather than hanging (plan.md's Background Processing "Timeout" note).
  - **Acceptance Criteria**: A deliberately slow query (e.g., an unindexed cross-join test fixture) times out with a clear error, not an indefinite hang.
  - **Verification**: Covered by T268
  - **Dependencies**: T034

- [ ] T264 [P] Caching — React Query stale/gc time review
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/queryKeys.ts` (modify, from T083, if per-query `staleTime`/`gcTime` overrides are needed)
  - **Goal**: Verify history/preset/measurement listing queries avoid redundant refetches without going stale in a way that hides a just-completed job.
  - **Acceptance Criteria**: No unnecessary duplicate network request observed in the React Query Devtools during a manual pass.
  - **Verification**: Manual React Query Devtools review
  - **Dependencies**: T083

- [ ] T265 [P] Memoization — live preview/readout computations
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/OperationConfigForm.tsx`, `MeasureToolbar.tsx` (both modify)
  - **Goal**: Memoize T128's Buffer preview and Phase 10's live measurement readouts so they don't recompute on every unrelated re-render.
  - **Acceptance Criteria**: No dropped frames during rapid mouse movement in a manual profiling pass.
  - **Verification**: Manual React DevTools Profiler review
  - **Dependencies**: T128, T153

- [ ] T266 [P] Memoization — narrow Zustand selectors
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useAnalysisPanel.ts` (modify, from T101), every hook file from Phase 6
  - **Goal**: Audit every hook for over-broad store subscriptions; narrow selectors so a component only re-renders for the slice of state it actually reads (Constitution Principle V).
  - **Acceptance Criteria**: No component re-renders on an unrelated store field change, verified via React DevTools Profiler.
  - **Verification**: Manual React DevTools Profiler review
  - **Dependencies**: T101, T091–T100

- [ ] T267 Bundle optimization — bundle-analyzer confirmation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (`@next/bundle-analyzer` run)
  - **Goal**: Confirm T082's Shapefile-writer dependency's gzipped size and dynamic-import/`ssr:false` placement per Constitution Principle V's mandatory pre-merge check for any dependency over 20 KB gzipped.
  - **Acceptance Criteria**: Dependency is dynamically imported at its point of use (the Export action), not part of the initial route bundle.
  - **Verification**: `ANALYZE=true npm run build` (or the project's existing bundle-analyzer command)
  - **Dependencies**: T082, T230

- [ ] T268 [P] Performance tests — 100,000-feature background path
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisRepository.performance.test.ts` (new)
  - **Goal**: Buffer/Union/Simplify against a 100,000-feature seeded layer, asserting progress observed ≥2 times before a terminal status (SC-002).
  - **Acceptance Criteria**: Test passes within a documented time budget; skip-if-unavailable against the real test database.
  - **Verification**: `npm run test:db -- analysisRepository.performance`
  - **Dependencies**: T034, T259, T263

- [ ] T269 [P] Performance tests — 100-concurrent-job harness
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisRepository.concurrency.test.ts` (new)
  - **Goal**: Launch 100 concurrent `createAnalysisRun` calls across multiple simulated users/projects, asserting no cross-job data corruption and the per-user concurrent-job cap (research.md Decision 12) is respected (SC-003).
  - **Acceptance Criteria**: Every job reaches a correct terminal state; no job's result is corrupted by another's execution.
  - **Verification**: `npm run test:db -- analysisRepository.concurrency`
  - **Dependencies**: T033, T034

- [ ] T270 Checkpoint (Phase 17)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm performance targets are met before Phase 18 (Accessibility) begins.
  - **Acceptance Criteria**: All of T259–T269 complete; SC-002/SC-003 demonstrated passing.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T259–T269

---

## Phase 18: Accessibility

**Purpose**: WCAG 2.2 AA verification across the full Analysis workspace, per spec.md's Accessibility section (FR-037–FR-039).

- [ ] T271 Keyboard navigation — full panel traversal
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/AnalysisPanel.tsx` (verification, from T239)
  - **Goal**: Full Tab/Enter/Escape traversal across `AnalysisPanel` and every sub-panel/dialog built in Phases 8–16.
  - **Acceptance Criteria**: FR-037 satisfied — every action (run, cancel, re-run, export, dismiss) reachable via keyboard alone.
  - **Verification**: Manual keyboard-only pass, documented in the PR; automated in T276
  - **Dependencies**: T239–T251

- [ ] T272 [P] ARIA labels audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every component file touched in Phases 8–16
  - **Goal**: Every Toolbox entry/Run/Cancel/Re-run/Export/panel control carries an accessible name reflecting its action (FR-038).
  - **Acceptance Criteria**: No control relies on an icon alone with no accessible name.
  - **Verification**: Covered by T276
  - **Dependencies**: T241, T246, T249

- [ ] T273 [P] Focus management — dialogs and modals
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/ProgressDialog.tsx`, `PresetPicker.tsx` (both modify)
  - **Goal**: Focus trapping inside `ProgressDialog`/preset/export modals; focus restoration to the triggering element on close.
  - **Acceptance Criteria**: Tab never escapes an open modal; closing a modal returns focus predictably.
  - **Verification**: Covered by T276
  - **Dependencies**: T246, T248

- [ ] T274 [P] Screen reader support — `aria-live` regions
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/ProgressDialog.tsx`, `MeasureToolbar.tsx` (both modify)
  - **Goal**: `aria-live="polite"` regions for progress/measurement readouts/status changes (FR-039).
  - **Acceptance Criteria**: A screen reader announces a status change without requiring the user to re-focus the element.
  - **Verification**: Covered by T277
  - **Dependencies**: T246, T160

- [ ] T275 [P] Screen reader support — panel content coherence
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/HistoryPanel.tsx`, `ResultPanel.tsx`, `PropertyPanel.tsx` (all modify)
  - **Goal**: Verify History/Result/Property panel content is announced coherently when navigated by a screen reader (logical heading structure, no orphaned data).
  - **Acceptance Criteria**: A screen reader user can understand a history row's content without visual context.
  - **Verification**: Covered by T277
  - **Dependencies**: T216, T221, T249

- [ ] T276 [P] Automated axe verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/__tests__/AnalysisPanel.a11y.test.tsx` (new)
  - **Goal**: Automated axe scan across every new component from Phases 8–16.
  - **Acceptance Criteria**: Zero critical/serious axe violations across the full component tree.
  - **Verification**: `npm run test -- AnalysisPanel.a11y`
  - **Dependencies**: T271, T272, T273

- [ ] T277 Manual screen reader pass
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual verification)
  - **Goal**: NVDA/VoiceOver spot-check of the full quickstart.md §10 keyboard scenario.
  - **Acceptance Criteria**: FR-039 confirmed by an actual screen reader session, not just automated tooling.
  - **Verification**: Manual pass, documented in the PR
  - **Dependencies**: T274, T275, T276

- [ ] T278 Checkpoint (Phase 18)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm accessibility is complete and green before Phase 19 (Testing) begins.
  - **Acceptance Criteria**: All of T271–T277 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T271–T277

---

## Phase 19: Testing

**Purpose**: Full-coverage audit and gap-fill across every tier, plus cross-story journeys not exercised by any single phase's checkpoint. Most tier-specific tests were already written per-layer (Phases 3–7) and per-story (Phases 8–16); this phase confirms completeness rather than duplicating them.

- [ ] T279 Repository test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every function in contracts/repository-api.md has a passing test (cross-reference T048/T049).
  - **Acceptance Criteria**: 100% of documented repository functions covered.
  - **Verification**: Manual coverage checklist against contracts/repository-api.md, documented in the PR
  - **Dependencies**: T048, T049

- [ ] T280 [P] Repository tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T279.
  - **Acceptance Criteria**: T279's checklist reaches 100%.
  - **Verification**: `npm run test:db`
  - **Dependencies**: T279

- [ ] T281 API test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/**/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every endpoint in contracts/api-contracts.md has success/validation/403/404/429 coverage (cross-reference T074).
  - **Acceptance Criteria**: 100% of documented endpoints × documented error codes covered.
  - **Verification**: Manual coverage checklist against contracts/api-contracts.md, documented in the PR
  - **Dependencies**: T074

- [ ] T282 [P] API tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/**/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T281.
  - **Acceptance Criteria**: T281's checklist reaches 100%.
  - **Verification**: `npm run test:db`
  - **Dependencies**: T281

- [ ] T283 Hook test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm every hook in contracts/client-api.md is tested (cross-reference T104).
  - **Acceptance Criteria**: 100% of documented hooks covered.
  - **Verification**: Manual coverage checklist against contracts/client-api.md, documented in the PR
  - **Dependencies**: T104

- [ ] T284 [P] Hook tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T283.
  - **Acceptance Criteria**: T283's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T283

- [ ] T285 Store test coverage audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/__tests__/*.test.ts` (review only)
  - **Goal**: Confirm `analysisStore`/`analysisPanelStore` full action/selector coverage (cross-reference T117–T119).
  - **Acceptance Criteria**: 100% of exported actions/selectors covered.
  - **Verification**: Manual coverage checklist, documented in the PR
  - **Dependencies**: T117, T118, T119

- [ ] T286 [P] Store tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/store/__tests__/*.test.ts` (modify as needed)
  - **Goal**: Add any coverage gaps found in T285.
  - **Acceptance Criteria**: T285's checklist reaches 100%.
  - **Verification**: `npm run test`
  - **Dependencies**: T285

- [ ] T287 [P] Integration test — Buffer → Export → Discard cross-story journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/__tests__/crossStory.bufferExportDiscard.test.tsx` (new)
  - **Goal**: Buffer → Export → discard-result → verify History reflects both, spanning US1/US8/US9.
  - **Acceptance Criteria**: History shows the Buffer run with `resultLayerId: null` after discard, and one `ExportJob` row for the export taken before discard.
  - **Verification**: `npm run test -- crossStory.bufferExportDiscard`
  - **Dependencies**: T136, T225, T238

- [ ] T288 [P] Integration test — Overlay → Preset → Re-run cross-story journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/__tests__/crossStory.overlayPresetRerun.test.tsx` (new)
  - **Goal**: Overlay → Save as Preset → re-run from preset, spanning US4/US8.
  - **Acceptance Criteria**: The re-run via preset produces a run with `presetId` set and identical parameters to the original.
  - **Verification**: `npm run test -- crossStory.overlayPresetRerun`
  - **Dependencies**: T182, T225

- [ ] T289 [P] Integration test — full quickstart.md run-through
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/__tests__/quickstart.fullRun.test.tsx` (new, automating what's automatable from quickstart.md's ten sections)
  - **Goal**: A single continuous session touching every one of quickstart.md's ten sections in order.
  - **Acceptance Criteria**: All ten sections pass without requiring app state reset between them.
  - **Verification**: `npm run test -- quickstart.fullRun`
  - **Dependencies**: T136, T152, T166, T182, T200, T214, T225, T238, T258

- [ ] T290 Performance test audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisRepository.performance.test.ts`, `analysisRepository.concurrency.test.ts` (review only, from T268/T269)
  - **Goal**: Confirm T268/T269 pass against CI-representative hardware/data volume, not just a developer's local machine.
  - **Acceptance Criteria**: Both tests green in CI.
  - **Verification**: CI run review
  - **Dependencies**: T268, T269

- [ ] T291 [P] Performance tests — gap fill
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/__tests__/exportService.performance.test.ts` (new, if T261's manual profile revealed an automatable regression risk)
  - **Goal**: Automate Export's streamed-assembly memory profile check (T261) if not already automated.
  - **Acceptance Criteria**: A regression in export memory behavior would fail this test, not just be caught manually later.
  - **Verification**: `npm run test -- exportService.performance`
  - **Dependencies**: T261, T290

- [ ] T292 Accessibility test audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/__tests__/AnalysisPanel.a11y.test.tsx` (review only, from T276)
  - **Goal**: Confirm zero violations are maintained after Phase 17/18's changes (a performance/accessibility tuning pass can regress the other).
  - **Acceptance Criteria**: T276 still green after Phase 17.
  - **Verification**: `npm run test -- AnalysisPanel.a11y`
  - **Dependencies**: T270, T276

- [ ] T293 [P] Accessibility tests — gap fill
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/components/__tests__/AnalysisPanel.a11y.test.tsx` (modify as needed)
  - **Goal**: Add any gaps found in T292.
  - **Acceptance Criteria**: T292 passes cleanly.
  - **Verification**: `npm run test -- AnalysisPanel.a11y`
  - **Dependencies**: T292

- [ ] T294 Large dataset test — Spatial Query
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisRepository.performance.test.ts` (modify, extends T268)
  - **Goal**: 100,000-feature Select by Location end-to-end via the background path.
  - **Acceptance Criteria**: SC-002 satisfied for Spatial Query specifically.
  - **Verification**: `npm run test:db -- analysisRepository.performance`
  - **Dependencies**: T041, T268

- [ ] T295 [P] Large dataset test — Geometry Processing
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/analysisRepository.performance.test.ts` (modify, same file as T294)
  - **Goal**: 100,000-feature Simplify end-to-end via the background path.
  - **Acceptance Criteria**: SC-002 satisfied for Geometry Processing specifically.
  - **Verification**: `npm run test:db -- analysisRepository.performance`
  - **Dependencies**: T043, T268

- [ ] T296 Failure/recovery automated tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/__tests__/failureRecovery.integration.test.tsx` (new)
  - **Goal**: Automate quickstart.md's Failure/recovery scenarios — cancellation, permission-denied, empty-selection — end-to-end.
  - **Acceptance Criteria**: All four of quickstart.md's Failure/recovery scenarios pass as automated tests, not just manual steps.
  - **Verification**: `npm run test -- failureRecovery.integration`
  - **Dependencies**: T035, T038, T289

- [ ] T297 Full suite run
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Run the entire test suite (all tiers) and confirm green, with zero skipped tests other than documented skip-if-unavailable DB tests.
  - **Acceptance Criteria**: `npm run test` and `npm run test:db` both fully green.
  - **Verification**: `npm run test && npm run test:db`
  - **Dependencies**: T280, T282, T284, T286, T287, T288, T289, T291, T293, T294, T295, T296

- [ ] T298 Checkpoint (Phase 19)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the entire feature is fully tested before Phase 20 (Documentation & Final Quality Gate) begins.
  - **Acceptance Criteria**: All of T279–T297 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db`
  - **Dependencies**: T279–T297

---

## Phase 20: Documentation & Final Quality Gate

**Purpose**: Documentation per Constitution Principle VIII and the final, whole-feature quality gate per Constitution Principle X.

- [ ] T299 README
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/README.md` (new)
  - **Goal**: Purpose, public API (barrel exports from `index.ts`), a usage example, and known limitations (Constitution Principle VIII).
  - **Acceptance Criteria**: A new contributor can understand this feature's scope and entry points from this file alone.
  - **Verification**: Manual review
  - **Dependencies**: T258, T298

- [ ] T300 [P] Architecture docs — env var / deployment note audit
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/environment-variables.md`, `docs/deployment.md` (both modify, only if this feature actually introduces anything — plan.md's Deployment Notes expects none)
  - **Goal**: Confirm no new environment variable or deployment step was silently introduced; document `.env.example` if T063's Shapefile dependency needs any build-time flag (expected: none).
  - **Acceptance Criteria**: Matches plan.md's "no new environment variable, secret, or external service dependency" claim, or documents the exception if one was found.
  - **Verification**: Manual review
  - **Dependencies**: T082

- [ ] T301 [P] API documentation — JSDoc audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Every new/modified exported function across this feature
  - **Goal**: Confirm every new/modified Route Handler and repository function carries the required single-line JSDoc summary (Constitution Principle VIII).
  - **Acceptance Criteria**: Zero exported function in this feature's scope lacks a summary.
  - **Verification**: Manual review (or an ESLint `jsdoc` rule if the project has one configured)
  - **Dependencies**: T258, T298

- [ ] T302 [P] Deployment guide — PostGIS version requirement
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify)
  - **Goal**: Add the PostGIS ≥3.2 (`ST_ChaikinSmoothing`, T185) requirement, tightening 005's existing ≥3.1 note (plan.md Deployment Notes).
  - **Acceptance Criteria**: Deployment doc states the correct minimum version with a reason.
  - **Verification**: Manual review
  - **Dependencies**: T185

- [ ] T303 [P] Deployment guide — five-target notes
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify, same file as T302)
  - **Goal**: Document plan.md's Vercel/Railway/Docker/AWS/Supabase deployment notes in the project's actual deployment doc.
  - **Acceptance Criteria**: Matches plan.md's Deployment Notes table content.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T304 [P] Developer guide — background-job pattern
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/README.md` (modify, same file as T299, or a dedicated `docs/` note if the project prefers)
  - **Goal**: Document the `executeInBackground`/chunking/cancellation pattern as a reusable reference for future features needing background execution.
  - **Acceptance Criteria**: A future contributor building a similar background-job feature can follow this pattern without re-deriving research.md Decision 5 from scratch.
  - **Verification**: Manual review
  - **Dependencies**: T034, T299

- [ ] T305 [P] Developer guide — operationType consolidation rationale
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/analysis/README.md` (modify, same file as T299)
  - **Goal**: Document why no separate `AnalysisJob`/`AnalysisHistory`/`AnalysisResult`/`GeometryOperation`/`AnalysisStatistics` tables exist, referencing research.md Decisions 1–2, so a future contributor doesn't reintroduce them.
  - **Acceptance Criteria**: The rationale is discoverable from the feature's own README, not only from `specs/007-spatial-analysis/`.
  - **Verification**: Manual review
  - **Dependencies**: T299

- [ ] T306 Quickstart verification — final manual pass
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (manual verification against quickstart.md)
  - **Goal**: Execute quickstart.md end-to-end manually one final time post-implementation, all ten sections plus the Failure/recovery scenarios.
  - **Acceptance Criteria**: Every scenario in quickstart.md behaves exactly as documented.
  - **Verification**: Manual pass, documented in the PR description
  - **Dependencies**: T298

- [ ] T307 Final quality gate — TypeScript
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Zero TypeScript errors across the entire changed surface.
  - **Acceptance Criteria**: Clean `tsc --noEmit` run.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T298

- [ ] T308 Final quality gate — ESLint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: Zero ESLint errors or warnings.
  - **Acceptance Criteria**: Clean `eslint src --max-warnings 0` run.
  - **Verification**: `npm run lint`
  - **Dependencies**: T298

- [ ] T309 Final quality gate — production build + bundle analyzer
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only)
  - **Goal**: `next build` succeeds; bundle-analyzer (T267) confirms the Shapefile-writer dependency's size is acceptable.
  - **Acceptance Criteria**: Clean production build; no bundle-size regression beyond what T267 already accepted.
  - **Verification**: `npm run build`
  - **Dependencies**: T267, T298

- [ ] T310 Final quality gate — Constitution Check re-verification + Checkpoint (Phase 20)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification-only, cross-referencing plan.md's Constitution Check table)
  - **Goal**: Re-verify plan.md's Constitution Check table against the actual implementation; confirm every FR-001–FR-039 and SC-001–SC-008 from spec.md has at least one traceable passing task/test from this file. This is also this feature's final phase checkpoint — the whole-suite verification below must be green before the feature is considered complete.
  - **Acceptance Criteria**: Zero principle violation found that isn't already documented in plan.md's Complexity Tracking; zero FR/SC without a traceable task; the full command suite below passes clean.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm run test:db` (manual cross-reference audit against plan.md's Constitution Check table documented in the PR description)
  - **Dependencies**: T306, T307, T308, T309

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies — start immediately.
- **Phase 2 (Database)**: Depends on Phase 1 (needs T001's constants, T002/T010's types).
- **Phase 3 (Repository Layer)**: Depends on Phase 2 (needs the migrated schema).
- **Phase 4 (Route Handlers)**: Depends on Phase 3 (needs repository functions to call).
- **Phase 5 (Client Services)**: Depends on Phase 4 (needs endpoints to wrap).
- **Phase 6 (React Query Hooks)**: Depends on Phase 5 (needs services to call).
- **Phase 7 (Zustand Stores)**: Can start in parallel with Phase 6 (no direct dependency between them), but both must complete before Phase 8.
- **Phases 8–16 (User Stories US1–US10)**: All depend on Phase 7 completing — this is the last cross-cutting blocking phase. Once Phase 7 completes, Phases 8–16 can proceed in parallel if staffed, or sequentially in priority order (US1/US2/US3/US4 [P1] → US5/US6/US8 [P2] → US7/US9 [P3] → US10 [P1, but depends structurally on components built in 8–15]).
  - **Important structural note**: Phase 16 (US10, the panel shell) depends on components built in Phases 8–15 (it wires them together) even though US10 is P1 priority — so while US10's *value* is foundational, its *construction* is necessarily last among the operation-category phases. Teams should build Phase 16's shell skeleton (T239–T241) early and in parallel, then wire in each phase's components as they land.
- **Phase 17 (Performance)**: Depends on all of Phases 8–16 (needs every operation and the full UI to exist to measure/tune).
- **Phase 18 (Accessibility)**: Depends on Phase 16 (needs the full component tree); can run in parallel with Phase 17.
- **Phase 19 (Testing)**: Depends on Phases 17 and 18 (audits their output).
- **Phase 20 (Documentation & Final Quality Gate)**: Depends on Phase 19.

### User Story Dependencies

- **US1 (Buffer, P1)**: No dependency on other stories — first candidate for MVP.
- **US2 (Spatial Query, P1)**: No dependency on other stories.
- **US3 (Measurement, P1)**: No dependency on other stories; independently available from the map toolbar regardless of the Analysis Panel.
- **US4 (Overlay, P1)**: No dependency on other stories.
- **US5 (Geometry Processing, P2)**: No dependency on other stories.
- **US6 (Spatial Statistics, P2)**: No dependency on other stories.
- **US7 (Raster-Ready Framework, P3)**: No dependency on other stories; its Toolbox entries are visible once Phase 16 exists.
- **US8 (Analysis History, P2)**: Benefits from at least one other story existing to have runs worth showing, but its own components/endpoints are built independently.
- **US9 (Export, P3)**: Benefits from at least one result-producing story existing, but its own services/components are built independently.
- **US10 (Analysis Workspace UI, P1)**: Structurally the integration point for every other story (see Phase Dependencies note above) — value-critical but construction-last.

### Within Each Phase

- Foundational/infrastructure tasks before story-specific tasks (Phases 1–7 before 8–16).
- Repository/builder confirmation before UI wiring within each user-story phase.
- Component implementation before its own tests.
- Story complete (checkpoint passes) before considering that story done.

### Parallel Opportunities

- All `[P]`-marked tasks within a phase touch different files (or are read-only verification tasks) and have no unresolved dependency on an incomplete task in the same phase.
- Once Phase 7 completes, Phases 8, 9, 10, 11 (all P1, all independent of each other) can be staffed and built fully in parallel.
- Phases 12, 13 (P2) can start as soon as Phase 7 completes, in parallel with 8–11, since neither depends on any other user story's components.
- Phase 14 (US8) and Phase 15 (US9) can start their own services/repositories/endpoints in parallel with 8–13, but their integration tests are more meaningful once at least one operation-producing story has landed.
- Phase 16 (US10)'s shell (T239–T241) can start as soon as Phase 7 completes, in parallel with everything else — only its per-category wiring tasks (T242 onward) depend on the corresponding operation phase.

---

## Parallel Example: Phase 8 (Buffer, US1)

```bash
# Once Phase 7 completes, these Phase 8 tasks can run in parallel (different files/read-only verification):
Task: "T122 [P] [US1] Point Buffer — verify ST_Buffer builder for point geometry"
Task: "T123 [P] [US1] Line Buffer — verify ST_Buffer builder for line geometry"
Task: "T124 [P] [US1] Polygon Buffer — verify ST_Buffer builder for polygon geometry"

# Once T121 (the form) exists, these can run in parallel:
Task: "T132 [P] [US1] Component tests — Buffer form"
Task: "T133 [P] [US1] Integration test — full Buffer flow"
Task: "T134 [P] [US1] API test — Buffer through background-job path"
```

## Parallel Example: Phases 8–11 (US1–US4, all P1)

```bash
# Once Phase 7 completes, four teams/agents can work these phases fully in parallel:
Team A: Phase 8  (T121–T136, Buffer)
Team B: Phase 9  (T137–T152, Spatial Query)
Team C: Phase 10 (T153–T166, Measurement)
Team D: Phase 11 (T167–T182, Overlay)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phases 1–7 (Foundation → Stores) — the shared platform every story needs.
2. Complete Phase 8 (US1, Buffer).
3. **STOP and VALIDATE**: run quickstart.md §1 manually; confirm T136's checkpoint is green.
4. Deploy/demo if ready — Buffer alone, reachable through a minimal Toolbox stub, is a legitimate MVP slice per spec.md's own US1 priority framing.

### Incremental Delivery

1. Phases 1–7 → platform ready.
2. Phase 8 (US1) → test independently → deploy/demo (MVP).
3. Phases 9–11 (US2/US3/US4, remaining P1 stories) → test independently → deploy/demo.
4. Phases 12–13 (US5/US6, P2) → test independently → deploy/demo.
5. Phase 14 (US8, P2 — History) → test independently → deploy/demo.
6. Phases 15 (US9, P3 — Export) and the US7 portion of Phase 16 (P3 — Raster framework) → test independently → deploy/demo.
7. Phase 16 (US10 — full Workspace UI integration) → test independently → deploy/demo.
8. Phases 17–20 (Performance/Accessibility/Testing/Docs) → final hardening pass → ship.

### Parallel Team Strategy

With multiple developers/agents:

1. Team completes Phases 1–7 together (Foundation is inherently sequential/shared).
2. Once Phase 7 is done:
   - Developer/Agent A: Phase 8 (US1)
   - Developer/Agent B: Phase 9 (US2)
   - Developer/Agent C: Phase 10 (US3)
   - Developer/Agent D: Phase 11 (US4)
   - Developer/Agent E: Phases 12–13 (US5/US6)
   - Developer/Agent F: Phase 14 (US8) + Phase 15 (US9), building services/endpoints ahead of having runs to show
3. One developer/agent builds Phase 16's shell (T239–T241) early, then integrates each story's components as they land.
4. Phases 17–20 run as a shared final pass once Phase 16 is integrated.

---

## Notes

- `[P]` tasks touch different files (or are read-only verification/audit tasks) with no unresolved same-phase dependency.
- `[US#]` labels map every Phase 8–16 task to its spec.md user story for traceability; Phases 1–7 and 17–20 carry no story label (cross-cutting).
- Per the Architecture note at the top of this file: several concepts named in the originally-requested phase outline ("AnalysisJob," "AnalysisHistory," "AnalysisStatistics," "GeometryOperation," "BufferRepository," "OverlayRepository," "StatisticsRepository," "HistoryRepository," and six of the seven named Zustand stores) are implemented as fields/functions/`operationType` values on the approved, already-consolidated `AnalysisRun` table, `analysisRepository.ts`/`analysisOperations.ts` files, and the two approved stores (`analysisStore`, `analysisPanelStore`) — never as additional tables, files, or stores. Every task above says explicitly which real artifact a named concept maps to.
- Every acceptance criterion above cites a spec.md `FR-`/`SC-`/Acceptance-Scenario id it satisfies, so traceability back to spec.md is auditable task-by-task.
- Commit after each task or logical group; stop at any checkpoint to validate a phase/story independently before continuing.
- Avoid: vague tasks, same-file conflicts on `[P]`-marked tasks, and cross-story dependencies that would break a story's independent testability (Phases 8–13 are deliberately independent of one another; only Phase 16 is allowed to depend on the others, as documented above).

