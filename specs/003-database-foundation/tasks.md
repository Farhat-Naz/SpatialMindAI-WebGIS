---
description: "Task list for Database Foundation (003-database-foundation)"
---

# Tasks: Database Foundation

**Input**: Design documents from `specs/003-database-foundation/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` (all present and approved)

**Tests**: Included — the approved `plan.md` Testing Strategy (Section 9) and
Constitution Principle VII require unit/store/hook/API/integration coverage
for this feature, so test tasks are generated alongside implementation tasks,
not treated as optional.

**Organization**: Tasks are grouped by user story (Constitution/Spec Kit
convention) so each story is independently implementable and testable. The
user-requested phase buckets (A–H: Database Foundation, Data Models,
Validation, API, Services, Client State, Testing, Documentation) are not
separate top-level phases — each bucket's work is distributed into whichever
user-story phase actually needs it (e.g., the `Layer` model, its Zod schema,
its repository, its Route Handlers, its client hooks, and its tests all live
together in Phase 4/User Story 2), per the mandatory "organize by user story"
rule. Buckets A (Prisma/Postgres/PostGIS setup) and part of B (the shared
`User` model) fall in Setup/Foundational since every story depends on them;
bucket H (documentation) and cross-cutting parts of G (rate limiting,
bundle check) fall in the final Polish phase.

## Format: `[ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no dependency on an incomplete task)
- **[Story]**: Maps the task to a spec.md user story — [US1] Projects (P1), [US2] Layers (P2), [US3] Features/Attributes/Styles (P3)
- Every task also lists **Priority**, **User Story**, **Files**, **Goal**, **Acceptance Criteria**, **Verification**, and **Dependencies** immediately beneath it

## Path Conventions

Paths match `plan.md`'s Project Structure exactly: `src/features/database/`,
`src/server/`, `src/shared/`, `app/api/`, `prisma/`.

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Stand up Prisma, the database connection, PostGIS availability,
and the test-database tooling every later phase depends on. No entity models
yet.

- [X] T001 Initialize Prisma and declare the PostGIS datasource extension in `prisma/schema.prisma`
  - **Priority**: Blocking (required by all stories)
  - **User Story**: None (Setup)
  - **Files**: `prisma/schema.prisma`, `package.json` (add `prisma`/`@prisma/client`)
  - **Goal**: Run `prisma init`; configure the `postgresql` datasource with the `postgis` extension declared and the `postgresqlExtensions` preview feature enabled on the generator, per Research Decision 1. No models yet — schema/datasource/generator blocks only.
  - **Acceptance Criteria**: `prisma/schema.prisma` exists with a valid `datasource db` block reading `DATABASE_URL` from the environment, `extensions = [postgis]`, and `previewFeatures = ["postgresqlExtensions"]` on the generator.
  - **Verification**: `npx prisma validate` succeeds.
  - **Dependencies**: None

- [X] T002 [P] Add database environment variable templates
  - **Priority**: Blocking
  - **User Story**: None (Setup)
  - **Files**: `.env.example`
  - **Goal**: Document `DATABASE_URL` (PostgreSQL connection string) and `DEV_USER_ID` (Research Decision 6's interim auth seam) with comments explaining each is server-only and never `NEXT_PUBLIC_*`.
  - **Acceptance Criteria**: `.env.example` contains both variables with placeholder values and one-line comments; no real credentials committed.
  - **Verification**: `git diff` shows only placeholder values; grep for `DATABASE_URL`/`DEV_USER_ID` in `.env.example` succeeds.
  - **Dependencies**: None

- [X] T003 [P] Create the Prisma Client singleton
  - **Priority**: Blocking
  - **User Story**: None (Setup)
  - **Files**: `src/server/db/prismaClient.ts`
  - **Goal**: Export a single, module-scoped `PrismaClient` instance, guarded against creating multiple instances during Next.js dev hot-reload (the standard `globalThis`-cached-instance pattern).
  - **Acceptance Criteria**: Importing `prismaClient` from two different repository files in the same process yields the same instance (verified in T005's test setup).
  - **Verification**: `tsc --noEmit` passes; no other file in `src/server/` constructs its own `PrismaClient`.
  - **Dependencies**: T001

- [X] T004 [P] Set up a Dockerized PostgreSQL + PostGIS test database
  - **Priority**: Blocking (required for T005 and every API/integration test)
  - **User Story**: None (Setup)
  - **Files**: `docker-compose.test.yml`, `package.json` (add `test:db:up`/`test:db:down` scripts)
  - **Goal**: Define an ephemeral PostgreSQL+PostGIS container (e.g., `postgis/postgis` image) for the test run, per Research Decision 11 — real PostGIS, not a mocked Prisma Client.
  - **Acceptance Criteria**: `npm run test:db:up` starts a reachable Postgres+PostGIS instance on a test-only port/database name; `npm run test:db:down` tears it down cleanly.
  - **Verification**: `docker compose -f docker-compose.test.yml up -d && pg_isready` (or equivalent) reports ready; container removed after `test:db:down`.
  - **Dependencies**: None

- [X] T005 Wire test database migration into the Vitest global setup
  - **Priority**: Blocking (required by every API/integration test task)
  - **User Story**: None (Setup)
  - **Files**: `vitest.setup.ts` (or `vitest.config.ts` `globalSetup`)
  - **Goal**: Before the test suite runs, point `DATABASE_URL` at the T004 test container and run `prisma migrate deploy` against it, so API/integration tests always start from a known, fully-migrated schema.
  - **Acceptance Criteria**: Running `npm run test` from a clean checkout (container started, no prior migration state) applies all migrations before any test file executes.
  - **Verification**: `npm run test:db:up && npm run test` succeeds with zero "relation does not exist" errors.
  - **Dependencies**: T001, T004

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared error/validation primitives, the `User` model, the
authentication seam, and the rate limiter — everything every user story's
Route Handlers need before any of them can be built.

**⚠️ CRITICAL**: No user story phase may begin until this phase's checkpoint (T013) passes.

- [X] T006 [P] Create the shared API error type and response helper
  - **Priority**: Blocking
  - **User Story**: None (Foundational)
  - **Files**: `src/shared/errors/apiError.ts`
  - **Goal**: Define the closed union `ApiErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'DUPLICATE_NAME' | 'DATABASE_ERROR' | 'UNAUTHORIZED'`, an `ApiError` type, and a `toErrorResponse(code, message)` helper returning `{ error: { code, message } }` with the matching HTTP status, per Research Decision 10.
  - **Acceptance Criteria**: Every one of the five codes maps to exactly one HTTP status (400/404/409/401/500 respectively); the helper is the only place that mapping is defined.
  - **Verification**: Unit test (added in T022) exercises all five codes.
  - **Dependencies**: None

- [X] T007 [P] Create the shared geometry Zod schema
  - **Priority**: Blocking
  - **User Story**: None (Foundational)
  - **Files**: `src/shared/contracts/geometry.schema.ts`
  - **Goal**: Zod discriminated union over exactly six `type` values (`Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`), each with correctly-nested `coordinates` arrays of finite numbers, longitude clamped -180..180 and latitude -90..90 at every nesting level, per Research Decision 3 and spec FR-014/FR-016.
  - **Acceptance Criteria**: Schema rejects a seventh geometry type (e.g., `GeometryCollection`), rejects an out-of-range coordinate at any nesting depth, and accepts one valid example of each of the six types.
  - **Verification**: Unit test (T050) covers all six accept cases and at least two reject cases.
  - **Dependencies**: None

- [X] T008 Add the `User` Prisma model and generate the initial migration
  - **Priority**: Blocking
  - **User Story**: None (Foundational)
  - **Files**: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_init/migration.sql`
  - **Goal**: Add the `User` model (`id`, `email` unique, `name?`, `createdAt`, `updatedAt`) per `data-model.md`. Run `prisma migrate dev --create-only`, then hand-edit the generated SQL to prepend `CREATE EXTENSION IF NOT EXISTS postgis;` before the table DDL, per Research Decision 4.
  - **Acceptance Criteria**: The migration file creates the `postgis` extension and the `User` table with a unique index on `email`.
  - **Verification**: `npx prisma migrate deploy` against the T004 test database succeeds; `SELECT postgis_version();` succeeds against that database afterward.
  - **Dependencies**: T001

- [X] T009 Create `userRepository.ts`
  - **Priority**: Blocking
  - **User Story**: None (Foundational)
  - **Files**: `src/server/repositories/userRepository.ts`
  - **Goal**: Export `getUserById(id)` returning `User | null`, per `contracts/repository-api.md`'s scope note (minimal — lookup only, no create/update/delete endpoint this phase).
  - **Acceptance Criteria**: Returns `null` for a non-existent id rather than throwing.
  - **Verification**: Exercised indirectly by T010's seam test and T011's seed verification.
  - **Dependencies**: T003, T008

- [X] T010 Create the interim `getCurrentUser` authentication seam
  - **Priority**: Blocking
  - **User Story**: None (Foundational)
  - **Files**: `src/server/auth/getCurrentUser.ts`
  - **Goal**: Export `getCurrentUser(request): Promise<User>` that resolves the seeded `DEV_USER_ID` user via `userRepository.getUserById`, throwing an `UNAUTHORIZED`-mapped error if unset/not found, per Research Decision 6. Add a prominent code comment marking this as an interim placeholder pending a real authentication module (cross-referenced in `plan.md` Risks).
  - **Acceptance Criteria**: Every Route Handler in Phases 3–5 calls this function first, before any repository access.
  - **Verification**: Unit/API tests confirm a request with no resolvable user yields `401 UNAUTHORIZED`.
  - **Dependencies**: T009

- [X] T011 Create the database seed script
  - **Priority**: Blocking
  - **User Story**: None (Foundational)
  - **Files**: `prisma/seed.ts`, `package.json` (`prisma.seed` config)
  - **Goal**: Seed exactly one `User` row matching the `DEV_USER_ID` environment variable, idempotently (safe to re-run).
  - **Acceptance Criteria**: `npx prisma db seed` run twice in a row does not create a duplicate user or error.
  - **Verification**: `quickstart.md` Section 1 passes.
  - **Dependencies**: T008, T002

- [X] T012 [P] Create the per-user rate limiter utility
  - **Priority**: Blocking (needed by Polish phase's T056, built now so its interface is stable for reference in earlier phases if desired)
  - **User Story**: None (Foundational)
  - **Files**: `src/server/security/rateLimiter.ts`
  - **Goal**: In-memory, per-user, sliding-window limiter exposing `checkRateLimit(userId, bucket): boolean`, per Research Decision 9. Single-process scope is an explicit, documented limitation (see `plan.md` Risks), not a bug to fix here.
  - **Acceptance Criteria**: Exceeding the configured window's request count for a given user+bucket returns `false`; different users/buckets are tracked independently.
  - **Verification**: Unit test exercises the limiter tripping and resetting after the window elapses.
  - **Dependencies**: None

- [ ] T013 **Checkpoint** — Foundational quality gate (3/4 gates verified — see completion report; `prisma migrate deploy` blocked by unavailable Docker/Postgres in this environment)
  - **Priority**: Blocking (gates every user story phase)
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm the shared foundation is sound before any user story begins.
  - **Acceptance Criteria**: `tsc --noEmit` (zero errors), `eslint src --max-warnings 0` (zero warnings), `npx prisma migrate deploy` against the T004 test database (succeeds), and any tests written so far all pass.
  - **Verification**: All four commands run clean in sequence.
  - **Dependencies**: T001–T012

---

## Phase 3: User Story 1 — Manage Projects (Priority: P1) 🎯 MVP

**Goal**: A user can create, rename/update, and delete projects, with
per-owner name uniqueness and ownership enforcement.

**Independent Test**: Create a project, confirm it's listed with correct
name/description and a creation timestamp, update it, delete it — no layer or
feature involved (see `quickstart.md` Section 3).

- [X] T014 [US1] Add the `Project` Prisma model and migration
  - **Priority**: P1
  - **User Story**: US1 — Manage Projects
  - **Files**: `prisma/schema.prisma`, new migration under `prisma/migrations/`
  - **Goal**: Add `Project` (`id`, `name`, `description?`, `ownerId` FK → `User`, `createdAt`, `updatedAt`), unique composite `(ownerId, name)`, index on `ownerId`, `onDelete: Cascade` on the `User` relation, per `data-model.md`.
  - **Acceptance Criteria**: Migration applies cleanly; unique constraint rejects a second same-owner/same-name row at the database level.
  - **Verification**: `npx prisma migrate deploy` against the test database succeeds.
  - **Dependencies**: T008

- [X] T015 [P] [US1] Create `project.schema.ts`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/shared/contracts/project.schema.ts`
  - **Goal**: Zod schemas for create (`name` required non-empty, `description?`) and update (`name?`, `description?`, at least one present) request bodies, plus the `Project` response shape, all `z.infer`-derived, per `contracts/api-contracts.md`.
  - **Acceptance Criteria**: Update schema rejects an empty body; create schema rejects an empty/whitespace-only `name`.
  - **Verification**: Covered by T022's unit test.
  - **Dependencies**: None (parallel-safe with T014)

- [X] T016 [US1] Create `projectRepository.ts`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/server/repositories/projectRepository.ts`
  - **Goal**: Implement `listProjectsForOwner`, `createProject`, `getProjectById`, `updateProject`, `deleteProject` exactly per `contracts/repository-api.md` — every function scopes its query by `ownerId` itself (never a post-fetch check), and `createProject`/`updateProject` throw a typed `DuplicateNameError` on a unique-constraint violation.
  - **Acceptance Criteria**: `getProjectById` returns `null` (not an exception) for both "doesn't exist" and "exists but not yours."
  - **Verification**: Exercised by T023's API tests.
  - **Dependencies**: T014, T015, T006

- [X] T017 [US1] Implement `app/api/projects/route.ts`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `app/api/projects/route.ts`
  - **Goal**: `GET` (list current user's projects) and `POST` (create, Zod-validated body) per `contracts/api-contracts.md`. Calls `getCurrentUser` first, then `projectRepository`, then maps results/thrown errors through `toErrorResponse`.
  - **Acceptance Criteria**: `POST` with a duplicate name returns `409 DUPLICATE_NAME`; `POST` with an empty name returns `400 INVALID_INPUT`.
  - **Verification**: `quickstart.md` Section 3, first three `curl` checks pass.
  - **Dependencies**: T016, T010

- [X] T018 [US1] Implement `app/api/projects/[projectId]/route.ts`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `app/api/projects/[projectId]/route.ts`
  - **Goal**: `GET`, `PATCH`, `DELETE` per `contracts/api-contracts.md`; `DELETE` relies on the database's `onDelete: Cascade` (no manual child cleanup code).
  - **Acceptance Criteria**: `PATCH` refreshes `updatedAt` without touching `createdAt`; a non-owner's request returns `401 UNAUTHORIZED` without revealing whether the project exists.
  - **Verification**: `quickstart.md` Section 3, remaining `curl` checks pass.
  - **Dependencies**: T016, T010

- [X] T019 [P] [US1] Create `projectService.ts`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/services/projectService.ts`
  - **Goal**: Client `fetch` wrappers for all five Project operations, typed via `project.schema.ts`'s inferred types, per `contracts/client-api.md`.
  - **Acceptance Criteria**: No function in this file performs business logic beyond request shaping/response parsing.
  - **Verification**: Used by T021's hooks; covered indirectly by T024's hook tests.
  - **Dependencies**: None (parallel-safe with T014–T018)

- [X] T020 [P] [US1] Create `queryKeys.ts`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/services/queryKeys.ts`
  - **Goal**: Centralized React Query key factory, starting with `['projects']` and `['projects', projectId]`, per Constitution Principle V.
  - **Acceptance Criteria**: No hook constructs a query key inline — all keys come from this file.
  - **Verification**: Code review / grep confirms no inline array literal query keys in hooks.
  - **Dependencies**: None (parallel-safe)

- [X] T021 [US1] Create `useProjects.ts` hooks
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/hooks/useProjects.ts`
  - **Goal**: `useProjects()`, `useCreateProject()`, `useUpdateProject(projectId)`, `useDeleteProject(projectId)` per `contracts/client-api.md`, each mutation invalidating the correct query key(s) from `queryKeys.ts` on success.
  - **Acceptance Criteria**: A successful `useCreateProject` mutation invalidates `['projects']` so the list hook refetches.
  - **Verification**: Covered by T024.
  - **Dependencies**: T019, T020

- [X] T022 [P] [US1] Unit test: `project.schema.ts` and `apiError.ts`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/shared/contracts/__tests__/project.schema.test.ts`, `src/shared/errors/__tests__/apiError.test.ts`
  - **Goal**: Cover T015's accept/reject cases and T006's five error-code-to-status mappings.
  - **Acceptance Criteria**: All five `ApiErrorCode` values and both project schema edge cases (empty name, empty update body) are asserted.
  - **Verification**: `npm run test -- project.schema apiError` passes.
  - **Dependencies**: T015, T006

- [X] T023 [P] [US1] API test: Projects Route Handlers
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `app/api/projects/__tests__/projects.api.test.ts`
  - **Goal**: Invoke T017/T018 directly against the real T004 test database: success path for all five operations, `400 INVALID_INPUT`, `409 DUPLICATE_NAME`, `404 NOT_FOUND`, `401 UNAUTHORIZED`.
  - **Acceptance Criteria**: All five `ApiErrorCode`s reachable through this resource are exercised at least once.
  - **Verification**: `npm run test:db:up && npm run test -- projects.api` passes.
  - **Dependencies**: T017, T018, T005

- [X] T024 [P] [US1] Hook test: `useProjects`
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/__tests__/useProjects.test.ts`
  - **Goal**: Test all four hooks against a mocked `projectService` (no network/database), verifying cache-key correctness and invalidation-on-mutation, per `plan.md` Testing Strategy.
  - **Acceptance Criteria**: Mocked `create` call is followed by an assertion that `['projects']` is invalidated.
  - **Verification**: `npm run test -- useProjects` passes.
  - **Dependencies**: T021

- [X] T025 [US1] Integration test: Project lifecycle
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/__tests__/project.integration.test.ts`
  - **Goal**: End-to-end create → list → update → delete against the real test database and real Route Handlers (no mocks), confirming FR-001–FR-006 and SC-001/SC-005/SC-007.
  - **Acceptance Criteria**: Deleting a project makes a subsequent `GET` return `404`; a cross-owner update attempt returns `401` and leaves the project unchanged.
  - **Verification**: `npm run test -- project.integration` passes.
  - **Dependencies**: T017, T018, T021

- [X] T026 [US1] **Checkpoint** — User Story 1 quality gate & independent test
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: N/A (verification only)
  - **Goal**: Confirm US1 is a complete, independently shippable increment.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint src --max-warnings 0`, and `npm run test` (T022–T025) all pass; `quickstart.md` Section 3 manual walkthrough passes.
  - **Verification**: All commands/checks above run clean.
  - **Dependencies**: T014–T025

---

## Phase 4: User Story 2 — Manage Layers Within a Project (Priority: P2)

**Goal**: A user can create, rename, reorder, and delete layers within a
project, with per-project name uniqueness and consistent ordering.

**Independent Test**: Create a project, add multiple layers, rename one,
reorder them, delete one — verified purely through layer listings/ordering
(see `quickstart.md` Section 4).

- [X] T027 [US2] Add the `Layer` Prisma model and migration
  - **Priority**: P2
  - **User Story**: US2 — Manage Layers
  - **Files**: `prisma/schema.prisma`, new migration under `prisma/migrations/`
  - **Goal**: Add `Layer` (`id`, `name`, `order` int, `projectId` FK → `Project`, `createdAt`, `updatedAt`), unique composite `(projectId, name)`, index on `(projectId, order)`, `onDelete: Cascade` on the `Project` relation, per `data-model.md`. No geometry-type constraint on the model (mixed-geometry layers are permitted, FR-012).
  - **Acceptance Criteria**: Migration applies cleanly; unique constraint rejects a second same-project/same-name layer.
  - **Verification**: `npx prisma migrate deploy` against the test database succeeds.
  - **Dependencies**: T014

- [X] T028 [P] [US2] Create `layer.schema.ts`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/shared/contracts/layer.schema.ts`
  - **Goal**: Zod schemas for create (`name` required), rename (`name` required), and bulk reorder (`orderedLayerIds: string[]`, non-empty) request bodies, plus the `Layer` response shape.
  - **Acceptance Criteria**: Reorder schema rejects an empty array.
  - **Verification**: Covered by T035's unit test.
  - **Dependencies**: None (parallel-safe with T027)

- [X] T029 [US2] Create `layerRepository.ts`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/server/repositories/layerRepository.ts`
  - **Goal**: Implement `listLayersForProject`, `createLayer` (assigns next `order`), `renameLayer`, `reorderLayers` (single transaction, validates the input ID set exactly matches the project's current layers before writing, per Research Decision 8), `deleteLayer`, per `contracts/repository-api.md`.
  - **Acceptance Criteria**: `reorderLayers` called with a partial or mismatched ID list throws a typed validation error rather than partially applying the reorder.
  - **Verification**: Exercised by T036's API tests.
  - **Dependencies**: T027, T028

- [X] T030 [US2] Implement `app/api/projects/[projectId]/layers/route.ts`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `app/api/projects/[projectId]/layers/route.ts`
  - **Goal**: `GET` (list, ordered) and `POST` (create) per `contracts/api-contracts.md`.
  - **Acceptance Criteria**: `GET` always returns layers ordered by `order` ascending.
  - **Verification**: `quickstart.md` Section 4, first two `curl` checks pass.
  - **Dependencies**: T029, T010

- [X] T031 [US2] Implement `app/api/projects/[projectId]/layers/reorder/route.ts`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `app/api/projects/[projectId]/layers/reorder/route.ts`
  - **Goal**: `PATCH` bulk reorder per `contracts/api-contracts.md`, validated with T028's reorder schema before calling `layerRepository.reorderLayers`.
  - **Acceptance Criteria**: A list that doesn't match the project's actual layer IDs returns `400 INVALID_INPUT`.
  - **Verification**: `quickstart.md` Section 4 reorder `curl` check passes, confirmed consistent on a repeated `GET`.
  - **Dependencies**: T029, T010

- [X] T032 [US2] Implement `app/api/layers/[layerId]/route.ts`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `app/api/layers/[layerId]/route.ts`
  - **Goal**: `PATCH` (rename) and `DELETE` per `contracts/api-contracts.md`; `DELETE` relies on cascade for nested features/attributes/styles.
  - **Acceptance Criteria**: Renaming a layer does not affect any of its features.
  - **Verification**: `quickstart.md` Section 4 final `curl` check passes.
  - **Dependencies**: T029, T010

- [X] T033 [P] [US2] Create `layerService.ts`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/database/services/layerService.ts`
  - **Goal**: Client `fetch` wrappers for list/create/rename/reorder/delete, per `contracts/client-api.md`.
  - **Acceptance Criteria**: No business logic beyond request shaping/response parsing.
  - **Verification**: Used by T034; covered indirectly by T037.
  - **Dependencies**: None (parallel-safe)

- [X] T034 [US2] Create `useLayers.ts` hooks
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/database/hooks/useLayers.ts`
  - **Goal**: `useLayers(projectId)`, `useCreateLayer(projectId)`, `useRenameLayer(layerId)`, `useReorderLayers(projectId)`, `useDeleteLayer(layerId)` per `contracts/client-api.md`, each invalidating the parent project's layer-list query key on success.
  - **Acceptance Criteria**: `useReorderLayers` invalidates the same list key `useLayers` reads.
  - **Verification**: Covered by T037.
  - **Dependencies**: T033, T020

- [X] T035 [P] [US2] Unit test: `layer.schema.ts`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/shared/contracts/__tests__/layer.schema.test.ts`
  - **Goal**: Cover T028's accept/reject cases, including the empty-reorder-array rejection.
  - **Acceptance Criteria**: All three schemas (create/rename/reorder) have at least one accept and one reject case asserted.
  - **Verification**: `npm run test -- layer.schema` passes.
  - **Dependencies**: T028

- [X] T036 [P] [US2] API test: Layers Route Handlers
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `app/api/layers/__tests__/layers.api.test.ts`
  - **Goal**: Invoke T030–T032 directly against the real test database: success path for all operations, duplicate-name rejection, reorder validation, `404`/`401`, and cascade-on-project-delete (a layer under a deleted project is unreachable, matching Edge Cases).
  - **Acceptance Criteria**: A reorder request with a mismatched ID set is asserted to change nothing (no partial reorder).
  - **Verification**: `npm run test -- layers.api` passes.
  - **Dependencies**: T030, T031, T032

- [X] T037 [P] [US2] Hook test: `useLayers`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/database/__tests__/useLayers.test.ts`
  - **Goal**: Test all five hooks against a mocked `layerService`, per `plan.md` Testing Strategy.
  - **Acceptance Criteria**: Mocked `reorder` call is followed by an assertion that the project's layer-list key is invalidated.
  - **Verification**: `npm run test -- useLayers` passes.
  - **Dependencies**: T034

- [X] T038 [US2] Integration test: Layer lifecycle
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/database/__tests__/layer.integration.test.ts`
  - **Goal**: End-to-end create-two-layers → reorder → rename → delete-one, confirming FR-007–FR-012 and SC-008 (reorder consistency across repeated reads).
  - **Acceptance Criteria**: After reordering, ten consecutive `GET` calls all return the same, new order.
  - **Verification**: `npm run test -- layer.integration` passes.
  - **Dependencies**: T030, T031, T032, T034

- [X] T039 [US2] **Checkpoint** — User Story 2 quality gate & independent test
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A (verification only)
  - **Goal**: Confirm US1 + US2 both work independently and together.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint src --max-warnings 0`, `npm run test` (through T038) all pass; `quickstart.md` Section 4 manual walkthrough passes.
  - **Verification**: All commands/checks above run clean.
  - **Dependencies**: T027–T038

---

## Phase 5: User Story 3 — Manage Spatial Features, Attributes, and Styles (Priority: P3)

**Goal**: A user can create, edit, and delete spatial features within a
layer, with independent attribute and style management, geometry validation,
and efficient large-layer retrieval.

**Independent Test**: Create a project and layer, add a feature with a valid
shape/attributes/style, edit its geometry/attributes/style independently,
delete it (see `quickstart.md` Section 5).

- [X] T040 [US3] Add `Feature`, `FeatureAttribute`, `FeatureStyle` Prisma models (create-only migration)
  - **Priority**: P3
  - **User Story**: US3 — Manage Features
  - **Files**: `prisma/schema.prisma`, new migration under `prisma/migrations/` (generated with `--create-only`)
  - **Goal**: Add all three models per `data-model.md`: `Feature` (`geometry` as `Unsupported("geometry(Geometry,4326)")`, `layerId` FK), `FeatureAttribute` (`featureId` FK, unique `(featureId, key)`), `FeatureStyle` (`featureId` FK, unique — one-to-one). `onDelete: Cascade` on all three relations to their parent.
  - **Acceptance Criteria**: `prisma validate` passes with the `Unsupported` geometry column present.
  - **Verification**: Migration generated but not yet applied (T041 edits it further first).
  - **Dependencies**: T027

- [X] T041 [US3] Hand-edit the migration: PostGIS validation + GiST spatial index
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: The migration SQL file generated by T040 (`prisma/migrations/<timestamp>_.../migration.sql`)
  - **Goal**: Confirm `CREATE EXTENSION IF NOT EXISTS postgis;` is present (added once in T008; re-verify no duplicate needed), and append `CREATE INDEX "Feature_geometry_gist_idx" ON "Feature" USING GIST (geometry);` after the table DDL, per Research Decision 4.
  - **Acceptance Criteria**: The GiST index exists after migration; verified via `\d "Feature"` in `psql` showing a `gist` index on `geometry`.
  - **Verification**: `npx prisma migrate deploy` against the test database succeeds; index confirmed present.
  - **Dependencies**: T040

- [X] T042 [P] [US3] Create `feature.schema.ts`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/shared/contracts/feature.schema.ts`
  - **Goal**: Zod schemas for feature create (`geometry` required, referencing T007's `geometry.schema.ts`; `attributes?` as a `{key,value}[]` with unique keys; `style?` as `{color, strokeWidth?, fillOpacity?}`) and update (all three optional, at least one present) request bodies, plus the `Feature` response shape.
  - **Acceptance Criteria**: Create schema rejects an `attributes` array with two entries sharing the same `key`.
  - **Verification**: Covered by T050's unit test.
  - **Dependencies**: T007

- [X] T043 [US3] Create `featureRepository.ts` — core CRUD with raw-SQL geometry I/O
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/featureRepository.ts`
  - **Goal**: Implement `getFeatureById`, `deleteFeature`, and the geometry read/write plumbing for `createFeature`/`updateFeature` using parameterized `$queryRaw`/`$executeRaw` with `ST_GeomFromGeoJSON`/`ST_AsGeoJSON`, per Research Decision 1. Attribute/style rows are written via the regular Prisma Client (not raw SQL).
  - **Acceptance Criteria**: No raw SQL call in this file uses string concatenation — every value is passed as a tagged-template parameter.
  - **Verification**: Exercised by T051's API tests.
  - **Dependencies**: T041, T042

- [X] T044 [US3] Add `ST_IsValid` topology validation to `createFeature`/`updateFeature`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/featureRepository.ts`
  - **Goal**: Inside the same transaction as the geometry insert/update, run `ST_IsValid(ST_GeomFromGeoJSON($1))`; if false, roll back and throw a typed validation error the Route Handler maps to `400 INVALID_INPUT`, per Research Decision 3 and spec FR-015.
  - **Acceptance Criteria**: A self-intersecting polygon is never persisted, even transiently (verified via a row-count check immediately after the rejected call).
  - **Verification**: `quickstart.md` Section 5's self-intersecting-polygon `curl` check returns `400`.
  - **Dependencies**: T043

- [X] T045 [US3] Add cursor pagination and bbox filtering to `listFeaturesForLayer`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/server/repositories/featureRepository.ts`
  - **Goal**: Implement keyset pagination ordered by `id` (`cursor`/`limit`, default 100, max 500) and an optional `ST_Intersects(geometry, ST_MakeEnvelope(...))` bbox filter using the T041 GiST index, per Research Decision 5.
  - **Acceptance Criteria**: Requesting page 2 via `cursor` never re-returns a feature from page 1.
  - **Verification**: Covered by T054's performance test at 100,000 rows.
  - **Dependencies**: T043

- [X] T046 [US3] Implement `app/api/layers/[layerId]/features/route.ts`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `app/api/layers/[layerId]/features/route.ts`
  - **Goal**: `GET` (paginated list, `cursor`/`limit`/`bbox` query params) and `POST` (create) per `contracts/api-contracts.md`.
  - **Acceptance Criteria**: `POST` with an unsupported geometry `type` (e.g., `GeometryCollection`) returns `400 INVALID_INPUT` from Zod before any database call.
  - **Verification**: `quickstart.md` Section 5 `curl` checks pass.
  - **Dependencies**: T044, T045, T010

- [X] T047 [US3] Implement `app/api/features/[featureId]/route.ts`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `app/api/features/[featureId]/route.ts`
  - **Goal**: `GET`, `PATCH` (independent geometry/attributes/style facets), `DELETE` per `contracts/api-contracts.md`.
  - **Acceptance Criteria**: A `PATCH` with only `attributes` leaves `geometry` and `style` byte-for-byte unchanged.
  - **Verification**: `quickstart.md` Section 5 final `curl` check passes.
  - **Dependencies**: T044, T010

- [X] T048 [P] [US3] Create `featureService.ts`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/database/services/featureService.ts`
  - **Goal**: Client `fetch` wrappers for list (with pagination params)/create/get/update/delete, per `contracts/client-api.md`.
  - **Acceptance Criteria**: No business logic beyond request shaping/response parsing.
  - **Verification**: Used by T049; covered indirectly by T052.
  - **Dependencies**: None (parallel-safe)

- [X] T049 [US3] Create `useFeatures.ts` hooks
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/database/hooks/useFeatures.ts`
  - **Goal**: `useFeatures(layerId, params)`, `useCreateFeature(layerId)`, `useUpdateFeature(featureId)`, `useDeleteFeature(featureId)` per `contracts/client-api.md`.
  - **Acceptance Criteria**: `useFeatures` re-fetches when `params.cursor` changes.
  - **Verification**: Covered by T052.
  - **Dependencies**: T048, T020

- [X] T050 [P] [US3] Unit test: `feature.schema.ts` and `geometry.schema.ts`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/shared/contracts/__tests__/feature.schema.test.ts`, `src/shared/contracts/__tests__/geometry.schema.test.ts`
  - **Goal**: Cover all six geometry types (accept), a seventh type (reject), out-of-range coordinates (reject), and duplicate attribute keys (reject).
  - **Acceptance Criteria**: Every one of the six supported geometry types has a passing accept-case assertion.
  - **Verification**: `npm run test -- feature.schema geometry.schema` passes.
  - **Dependencies**: T042, T007

- [X] T051 [P] [US3] API test: Features Route Handlers
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `app/api/features/__tests__/features.api.test.ts`
  - **Goal**: Invoke T046/T047 directly against the real test database: success path for all operations, invalid-geometry rejection (structural and topological), pagination (`cursor`/`limit`), bbox filtering, `404`/`401`, and cascade-on-layer-delete.
  - **Acceptance Criteria**: Both an invalid GeoJSON structure and a topologically-invalid-but-structurally-valid polygon are asserted to return `400 INVALID_INPUT`.
  - **Verification**: `npm run test -- features.api` passes.
  - **Dependencies**: T046, T047

- [X] T052 [P] [US3] Hook test: `useFeatures`
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/database/__tests__/useFeatures.test.ts`
  - **Goal**: Test all four hooks against a mocked `featureService`.
  - **Acceptance Criteria**: A mocked `update` call with only `attributes` is asserted not to alter the cached `geometry`/`style` fields.
  - **Verification**: `npm run test -- useFeatures` passes.
  - **Dependencies**: T049

- [X] T053 [US3] Integration test: Feature lifecycle
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/database/__tests__/feature.integration.test.ts`
  - **Goal**: End-to-end create (geometry + attributes + style) → edit geometry only → edit attributes only → edit style only → delete, confirming FR-013–FR-024 and the three facets' independence.
  - **Acceptance Criteria**: After the geometry-only edit, a re-fetch shows unchanged `attributes`/`style`; after the attributes-only edit, unchanged `geometry`/`style`; and so on for style.
  - **Verification**: `npm run test -- feature.integration` passes.
  - **Dependencies**: T046, T047, T049

- [X] T054 [US3] Performance test: 100,000-feature layer listing (SC-003)
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `src/features/database/__tests__/feature.performance.test.ts`, a one-off seed helper script (not part of the shipped feature)
  - **Goal**: Seed one layer with 100,000 generated point features against the test database, then assert `GET /api/layers/:layerId/features?limit=100` returns in under 2 seconds, per SC-003 and Research Decision 5.
  - **Acceptance Criteria**: Measured response time is under 2 seconds on at least 3 consecutive runs.
  - **Verification**: `npm run test -- feature.performance` passes; cross-checked manually via `quickstart.md` Section 8.
  - **Dependencies**: T046

- [X] T055 [US3] **Checkpoint** — User Story 3 quality gate & independent test
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: N/A (verification only)
  - **Goal**: Confirm all three user stories work independently and together — the full MVP is complete.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint src --max-warnings 0`, `npm run test` (through T054) all pass; `quickstart.md` Sections 5 and 8 manual walkthroughs pass.
  - **Verification**: All commands/checks above run clean.
  - **Dependencies**: T040–T054

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Apply the rate limiter across all write endpoints, add the
client-only selection store, finish documentation, and run the full
production-readiness pass.

- [X] T056 [P] Apply the rate limiter to every write endpoint
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `app/api/projects/route.ts`, `app/api/projects/[projectId]/route.ts`, `app/api/projects/[projectId]/layers/route.ts`, `app/api/projects/[projectId]/layers/reorder/route.ts`, `app/api/layers/[layerId]/route.ts`, `app/api/layers/[layerId]/features/route.ts`, `app/api/features/[featureId]/route.ts`
  - **Goal**: Call `checkRateLimit` (T012) at the top of every `POST`/`PATCH`/`DELETE` handler across all three resources, returning `429` when tripped, per Research Decision 9. `GET` handlers are intentionally left unthrottled.
  - **Acceptance Criteria**: Every write handler across all seven files calls `checkRateLimit` before any repository access.
  - **Verification**: A scripted burst of requests exceeding the configured window returns `429` for at least one request.
  - **Dependencies**: T012, T017, T018, T030, T031, T032, T046, T047

- [X] T057 [P] Create `databaseStore.ts` and its tests
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/store/databaseStore.ts`, `src/features/database/__tests__/databaseStore.test.ts`
  - **Goal**: Zustand store for `selectedProjectId`/`selectedLayerId`/`selectedFeatureId` and `selectProject`/`selectLayer`/`selectFeature`/`clearSelection` actions, per `contracts/client-api.md` — selecting a different project clears the dependent layer/feature selection.
  - **Acceptance Criteria**: Calling `selectProject` with a new id clears both `selectedLayerId` and `selectedFeatureId`.
  - **Verification**: `npm run test -- databaseStore` passes.
  - **Dependencies**: None (parallel-safe)

- [X] T058 [P] JSDoc pass on all exported repository/service/hook functions
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/server/repositories/*.ts`, `src/features/database/services/*.ts`, `src/features/database/hooks/*.ts`
  - **Goal**: Add a single-line JSDoc summary to every exported function stating what it does and any non-obvious constraint (units, CRS, side effects), per Constitution Principle VIII.
  - **Acceptance Criteria**: Every exported function in the listed files has a JSDoc comment.
  - **Verification**: Code review / lint rule (if configured) confirms no exported function is undocumented.
  - **Dependencies**: T016, T029, T043, T019, T033, T048, T021, T034, T049

- [X] T059 [P] Write the feature README
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/README.md`
  - **Goal**: Document the module's purpose, its public API (barrel exports), a usage example, and known limitations (no UI yet, interim auth seam, single-instance rate limiter), per Constitution Principle VIII.
  - **Acceptance Criteria**: README explicitly calls out the two documented limitations above so a future contributor doesn't mistake them for oversights.
  - **Verification**: Manual review against Constitution Principle VIII's checklist.
  - **Dependencies**: T021, T034, T049

- [X] T060 [P] Write the deployment guide addendum
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `specs/003-database-foundation/quickstart.md` (extend) or a new `docs/deployment.md`
  - **Goal**: Document `DATABASE_URL`/`DEV_USER_ID` provisioning, that `prisma migrate deploy` must run as a build/deploy step (never `migrate dev` in a non-local environment), that every Route Handler in this feature requires the Node.js runtime (not Edge), and Vercel-specific environment variable setup, per `plan.md` Section 10.
  - **Acceptance Criteria**: A reader unfamiliar with this feature can provision a fresh environment using only this document plus `plan.md`.
  - **Verification**: Manual review.
  - **Dependencies**: None (parallel-safe)

- [X] T061 Bundle-analyzer verification
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: N/A (verification only)
  - **Goal**: Confirm this feature's client-side addition (`services`/`hooks`/`store`, no UI yet) has negligible bundle impact, per Constitution Principle V.
  - **Acceptance Criteria**: `ANALYZE=true npm run build` shows no unexpected large dependency pulled in by `src/features/database/`.
  - **Verification**: Bundle-analyzer report reviewed.
  - **Dependencies**: T021, T034, T049, T057

- [ ] T062 Full `quickstart.md` run-through (Section 2 verified; Sections 1, 3-8 require a live PostGIS database unavailable in this environment — see completion report)
  - **Priority**: Must-have (final gate)
  - **User Story**: None (cross-cutting)
  - **Files**: N/A (verification only)
  - **Goal**: Execute every section of `quickstart.md` (1–8) top to bottom against a fresh environment.
  - **Acceptance Criteria**: Every checklist item at the bottom of `quickstart.md` is checked off.
  - **Verification**: Manual run, all 8 sections pass.
  - **Dependencies**: T001–T061

- [X] T063 Final Constitution Check re-verification
  - **Priority**: Must-have (final gate)
  - **User Story**: None (cross-cutting)
  - **Files**: N/A (verification only); update `plan.md`'s Constitution Check re-check note if anything changed during implementation
  - **Goal**: Re-confirm all 10 principles in `plan.md`'s Constitution Check still PASS as actually implemented (not just as planned), and that the one recorded interpretation (Research Decision 2 / Complexity Tracking) still accurately describes the shipped code.
  - **Acceptance Criteria**: No principle regresses from PASS to FAIL; any new deviation is either fixed or added to Complexity Tracking with justification before this task is checked off.
  - **Verification**: Manual review against `.specify/memory/constitution.md` v3.0.0.
  - **Dependencies**: T001–T062

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational (T013) — no dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational (T013) **and** the `Project` model from T014 (US1) — cannot start until T014 exists, but does not need the rest of US1's Route Handlers/hooks.
- **User Story 3 (Phase 5)**: Depends on Foundational (T013) **and** the `Layer` model from T027 (US2) — cannot start until T027 exists, but does not need the rest of US2's Route Handlers/hooks.
- **Polish (Phase 6)**: Depends on all three user stories being complete (T001–T055).

### User Story Dependencies

Unlike a typical Spec Kit feature where user stories are fully independent,
this feature's stories form a strict hierarchy matching the data model
itself (`Project → Layer → Feature`) — US2 needs US1's `Project` table to
exist (a layer must belong to a project) and US3 needs US2's `Layer` table
(a feature must belong to a layer). Each story's *Route Handlers, services,
hooks, and tests*, however, are independent of the others' — US2's API/client
work does not depend on US1's API/client work being finished, only on the
`Project` model migration (T014) existing.

### Within Each User Story

- Model/migration → repository → Route Handlers → client service → client
  hooks → tests (unit → API → hook → integration), matching the task order
  within each phase above.
- Zod schema tasks ([P]) can run in parallel with the model/migration task
  in the same phase — they touch different files with no dependency between
  them.
- Integration tests always come last within a phase, after both the Route
  Handlers and the hooks they exercise exist.

### Parallel Opportunities

- All Setup [P] tasks (T002, T003, T004) can run together once T001 exists (T004 has no dependency on T001 at all).
- Within Foundational: T006, T007, T012 are mutually parallel; T008→T009→T010→T011 is a strict chain.
- Within each user story phase: the Zod schema task, the client service task, and the query-keys/store task (US1 only) are parallel-safe with the model/migration task and with each other; the four test tasks (unit/API/hook — not integration) are mutually parallel once their respective implementation tasks land.
- Phase 6's T056–T060 are all mutually parallel; T061–T063 are sequential final gates.

---

## Parallel Execution Example: User Story 1

```bash
# After T014 (Project model) lands, these four can run together:
Task: "Create project.schema.ts in src/shared/contracts/project.schema.ts"          # T015
Task: "Create projectService.ts in src/features/database/services/projectService.ts" # T019
Task: "Create queryKeys.ts in src/features/database/services/queryKeys.ts"           # T020

# After T017/T018 (Route Handlers) and T021 (hooks) land, these three can run together:
Task: "Unit test project.schema.ts and apiError.ts"       # T022
Task: "API test Projects Route Handlers"                   # T023
Task: "Hook test useProjects"                               # T024
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks everything)
3. Complete Phase 3: User Story 1 (Projects)
4. **STOP and VALIDATE**: Run T026's checkpoint; confirm `quickstart.md`
   Section 3 passes independently of Layers/Features
5. This is a legitimate, demoable MVP: project creation/management with a
   real database, even though nothing can be stored *inside* a project yet

### Incremental Delivery

1. Setup + Foundational → foundation ready (T001–T013)
2. Add US1 (Projects) → validate independently → demo (T014–T026, MVP)
3. Add US2 (Layers) → validate independently → demo (T027–T039)
4. Add US3 (Features/Attributes/Styles) → validate independently → demo (T040–T055)
5. Polish (T056–T063) → production-ready

### Team Strategy

Because US2 depends on US1's model (T014) and US3 depends on US2's model
(T027) — not on their full API/client stacks — a team can still parallelize
meaningfully: once T014 lands, one developer can continue US1's Route
Handlers/hooks/tests while a second starts US2's model/repository/API in
parallel, and similarly for US3 once T027 lands.

---

## Production Readiness Checklist

- [ ] All 63 tasks (T001–T063) checked off
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` (`eslint src --max-warnings 0`) — zero errors/warnings
- [ ] `npm run test` — all unit, store, hook, API, and integration tests passing
- [ ] `npm run build` — production build succeeds with no errors
- [ ] `npx prisma migrate deploy` — applies cleanly against a fresh database (extension, tables, FKs, GiST index all present)
- [ ] `ANALYZE=true npm run build` — bundle-analyzer output reviewed, no unexpected bloat
- [ ] Lighthouse/accessibility: N/A this phase (no UI shipped) — explicitly deferred, not skipped silently
- [ ] `quickstart.md` — all 8 sections pass end-to-end (T062)
- [ ] Security headers unaffected/still present (no new external host introduced)
- [ ] `DATABASE_URL` and `DEV_USER_ID` documented and provisioned per environment (T060)
- [ ] Constitution Check re-verified against the actual shipped code (T063)
- [ ] Known limitations recorded and visible (not silently shipped as if finished): interim auth seam (Research Decision 6), single-instance rate limiter (Research Decision 9), free-form attributes (Research Decision 12), no management UI yet
- [ ] Feature README (`src/features/database/README.md`) complete (T059)
- [ ] Deployment guide complete (T060)
