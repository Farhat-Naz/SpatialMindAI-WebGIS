---

description: "Task list for feature implementation"
---

# Tasks: Enterprise Deployment & Production Operations

**Input**: Design documents from `specs/010-deployment-enterprise/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md (all present and approved)

**Tests**: Not explicitly requested as a separate TDD pass; test tasks are
included inline within the phases that introduce testable behavior
(Constitution Principle VII requires them regardless), following the same
per-phase placement 009's tasks.md used rather than a single monolithic
test phase.

**Organization**: This roadmap uses the 16-phase, layer/theme-first
structure explicitly requested for this feature. Phases map to spec.md's
ten user stories where the phase is story-specific (Phases 4–11); Phases
1–3 and 12–16 are cross-cutting (Foundation, Infrastructure, CI/CD, Cloud
Deployments, UI, Performance/Reliability validation, Documentation, Final
Gate) and carry no single story label, exactly as 009's Phases 1–7/17–20
did. Every task's `[Story]` label reflects the FR/story it factually
implements, not just its phase's theme name.

**Architecture note (read before starting)**: Per the **approved**
research.md §0 and plan.md Complexity Tracking:

- **"Deployment types/constants"** (Phase 1) are added to
  `src/server/config/` and `src/shared/contracts/ops.schema.ts` — not a
  new top-level `types/` directory outside the established
  feature/server-module structure.
- **"Backup" work** (Phases 7, 12) is 010's own **infrastructure-level**
  `BackupJob`/`BackupHistory` tables and `opsBackupRepository.ts` — **not**
  `009-administration-security`'s per-project, application-level `Backup`
  model. The two are deliberately separate; 010's repository file is
  namespaced `opsBackupRepository.ts` specifically to avoid a collision
  with `009`'s planned `backupRepository.ts` (plan.md Complexity Tracking).
- **"Security logs"/"Audit logs"** (Phase 6) write to 010's own
  `LogEntry` table (`category: SECURITY` / `AUDIT`) via
  `logger.persist()`/`logRepository.ts` — this is the centralized
  aggregation point (FR-023), not a replacement for `009`'s
  `SecurityAuditLog`, which remains the system of record for
  administrative audit detail once `009` ships (research.md §0/§8).
  `LogEntry` rows for security/audit categories are written by 010's own
  new endpoints (e.g., maintenance-mode activation, rollback) in this
  feature's own scope; wiring every one of `009`'s future writes into
  `LogEntry` too is `009`'s responsibility when it lands, not a task here.
- **"Health checks"** (Phases 1, 4, 5) center on one shared
  `healthChecker.ts` function, consumed by `GET /api/system/status`
  (this feature) and, later, unchanged, by `009`'s planned
  `GET /api/health` — one implementation, not two.
- **Operator authorization** (used by every `/api/ops/*` endpoint except
  the three shared-secret scheduled endpoints) is the interim
  `assertIsOperator` check (plan.md Architecture, Complexity Tracking) —
  **not** `009`'s not-yet-implemented `assertSystemPermission`. Tasks
  below build against `assertIsOperator` and document the swap point.
- **Primary deployment platform** is Vercel (app) + Supabase Postgres/
  PostGIS (data) + Upstash Redis (cache/rate-limit), per the spec's
  resolved clarification and research.md §13. Railway/AWS/Azure/Google
  Cloud/generic Docker/self-hosted-Linux (Phase 12) are **documentation-
  only** tasks — no code is written or CI-tested against them.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[Story]**: US1–US10 per spec.md (US1 Environment Management, US2
  Containerized Packaging, US3 CI/CD, US4 Monitoring, US5 Logging, US6
  Backup & Disaster Recovery, US7 Performance Optimization, US8
  Scalability, US9 Security Hardening, US10 Production Operations),
  applied only where a task is story-specific; cross-cutting
  phases/tasks carry no story label
- Every task lists exact file paths and the fields required by this
  roadmap: Priority, User Story, Files, Goal, Acceptance Criteria
  (traceable to a spec.md FR-/SC- id), Verification, Dependencies

---

## Phase 1: Foundation

**Purpose**: Environment schema/validation, shared ops constants and
types, the ten-model/eight-enum Prisma schema addition, health/logging/
cache utility shells, error-vocabulary additions, security configuration,
query keys, and baseline documentation every later phase depends on.

- [ ] T001 Add the ten new Prisma models and eight enums (additive)
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting)
  - **Files**: `prisma/schema.prisma` (modify — additive only)
  - **Goal**: Add `Environment`, `DeploymentStatus`, `HealthComponent`, `HealthStatus`, `LogCategory`, `LogLevel`, `BackupStatus`, `MaintenanceStatus`, `NotificationSeverity` enums and `ReleaseVersion`, `DeploymentHistory`, `DeploymentEvent`, `HealthCheck`, `SystemMetric`, `LogEntry`, `BackupJob`, `BackupHistory`, `MaintenanceWindow`, `SystemNotification` models exactly per data-model.md, with every listed index.
  - **Acceptance Criteria**: `npx prisma validate` passes; no existing model (`User`/`Project`/`Layer`/`Feature`/`FeatureAttribute`/`FeatureStyle`/`AnalysisRun`) is modified (verified via `git diff prisma/schema.prisma` showing only additions).
  - **Verification**: `npx prisma validate`; `npx prisma generate`
  - **Dependencies**: None

- [ ] T002 Create and apply the migration for T001
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_add_deployment_operations/migration.sql` (new, generated)
  - **Goal**: Run `prisma migrate dev` locally against the test database to generate and apply the migration for T001's schema change.
  - **Acceptance Criteria**: Migration applies cleanly to a fresh `docker-compose.test.yml` database; `npx prisma migrate deploy` is idempotent on re-run.
  - **Verification**: `npx prisma migrate deploy`
  - **Dependencies**: T001

- [ ] T003 [P] Add ops/deployment constants
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/config/opsConstants.ts` (new)
  - **Goal**: Named constants for default retention windows (data-model.md's Retention Policies table: `HealthCheck` 7d, `SystemMetric` 30d, `LogEntry` 90d, `SystemNotification` 180d, default `BackupJob.retentionDays` 30), default rate-limit buckets (`"ops:deploy-webhook"`, `"ops:maintenance-toggle"`), and SC-derived thresholds (SC-007's 5-minute alert budget, SC-006's 10-minute rollback budget) as typed constants.
  - **Acceptance Criteria**: No later task hardcodes a retention/threshold number that duplicates one defined here.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [ ] T004 [P] Create shared operations TypeScript types
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/operations/types/operations.types.ts` (new)
  - **Goal**: Re-exported TypeScript types for every model in T001 (`ReleaseVersion`, `DeploymentHistory`, `DeploymentEvent`, `HealthCheck`, `SystemMetric`, `LogEntry`, `BackupJob`, `BackupHistory`, `MaintenanceWindow`, `SystemNotification`) plus response-shape types matching contracts/api-contracts.md, mirroring every prior feature's re-export-only pattern.
  - **Acceptance Criteria**: Every field in data-model.md's entities has a corresponding TypeScript type; zero `any`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T001

- [ ] T005 Create Zod validation schema shells
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/ops.schema.ts` (new)
  - **Goal**: Shells for every request/response body in contracts/api-contracts.md — `createReleaseSchema`, `createDeploymentSchema`, `updateDeploymentStatusSchema`, `activateMaintenanceSchema`, `backupJobQuerySchema`, `logQuerySchema`, `metricQuerySchema`, `notificationQuerySchema` — per data-model.md's Validation Rules section (version regex, cron structural check, retention-days bounds, reason max length, enum membership).
  - **Acceptance Criteria**: Each schema exports a Zod object + `z.infer` type; version/cron/retention-days rules match data-model.md exactly.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [ ] T006 [P] Add `MAINTENANCE_ACTIVE` and `FORBIDDEN` to the shared error vocabulary
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/errors/apiError.ts` (modify — additive)
  - **Goal**: Add `503 MAINTENANCE_ACTIVE` and `403 FORBIDDEN` codes/status mapping per contracts/api-contracts.md — **skip `FORBIDDEN` with a no-op verification note if `009` has already landed it**; exactly one definition must exist.
  - **Acceptance Criteria**: `npx tsc --noEmit`; no duplicate error-code definition anywhere in the codebase.
  - **Verification**: `npx tsc --noEmit`; `npx eslint src/shared/errors/apiError.ts --max-warnings 0`
  - **Dependencies**: None

- [ ] T007 Create the environment validation schema
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `src/server/config/env.ts` (new)
  - **Goal**: One Zod object schema (base + Production-only refinements per research.md §1/spec FR-001–FR-004) covering every required variable across `docs/environment-variables.md`'s existing list plus this feature's new variables (`REDIS_URL`/`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, `DIRECT_URL`, `CRON_SECRET`, `ALLOWED_ORIGINS`), parsed once at module load; process exits with a per-field error list on failure.
  - **Acceptance Criteria**: Starting the app with any required variable unset produces a specific, human-readable error naming that variable (FR-002); Production mode additionally rejects debug/test-only values (FR-003).
  - **Verification**: `npx tsc --noEmit`; manual `DATABASE_URL= npm run dev` failure check (quickstart.md US1)
  - **Dependencies**: T003

- [ ] T008 [P] Create the shared health-check function
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/ops/healthChecker.ts` (new)
  - **Goal**: `checkApplicationHealth()`, `checkDatabaseHealth()` (`SELECT 1` with timeout), `checkApiHealth()`, and `checkAllComponents()` returning healthy/degraded/unhealthy per component (FR-016) — the one function both `/api/system/status` (this feature) and `009`'s planned `/api/health` will call.
  - **Acceptance Criteria**: Each check function returns within a bounded timeout even when its dependency is unreachable (never hangs).
  - **Verification**: `npx tsc --noEmit`; unit test in T012
  - **Dependencies**: None

- [ ] T009 [P] Extend `logger.ts` with a `persist()` method
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/shared/lib/logger.ts` (modify — additive)
  - **Goal**: Add `logger.persist(entry)` alongside the existing `debug/info/warn/error/request` methods (unchanged) — writes one `LogEntry` row via `logRepository.recordLogEntry` (Phase 6), never blocking the stdout write path.
  - **Acceptance Criteria**: Every existing call site of `logger.debug/info/warn/error/request` compiles unchanged; `logger.persist` is additive only.
  - **Verification**: `npx tsc --noEmit`; `npx eslint src/shared/lib/logger.ts --max-warnings 0`
  - **Dependencies**: None

- [ ] T010 [P] Create the generic cache wrapper
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/server/cache/cache.ts` (new)
  - **Goal**: `get<T>(key)`/`set<T>(key, value, ttlSeconds)`/`invalidate(key)` over `@upstash/redis`, no-op-safe (returns cache miss) when Redis env vars are unset — never a hard failure if Redis is not configured in an environment.
  - **Acceptance Criteria**: Calling `get` before any `set` returns a miss, not a throw; calling with Redis unconfigured behaves as a permanent miss without error.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T007

- [ ] T011 [P] Add the Redis-backed rate-limiter mode
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/server/security/rateLimiter.ts` (modify — additive)
  - **Goal**: Add a Redis sliding-window mode used when `REDIS_URL`/Upstash vars are configured, falling back to the existing in-memory implementation otherwise (research.md §12/§14) — every existing call site (`assertWriteRateLimit`, search feature's limiter) compiles and behaves unchanged when Redis is not configured.
  - **Acceptance Criteria**: With Redis configured, two requests from different processes sharing one bucket both see the same counter state; with Redis unconfigured, existing single-instance behavior is bit-for-bit unchanged.
  - **Verification**: `npx tsc --noEmit`; unit test in T012
  - **Dependencies**: T010

- [ ] T012 [P] Unit tests for T008/T011
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/ops/__tests__/healthChecker.test.ts` (new), `src/server/security/__tests__/rateLimiter.test.ts` (modify — add Redis-mode cases)
  - **Goal**: Cover `healthChecker`'s healthy/degraded/unhealthy/timeout paths and `rateLimiter`'s Redis-mode threshold enforcement alongside its existing in-memory cases.
  - **Acceptance Criteria**: All new/modified test cases pass; existing `rateLimiter.test.ts` cases remain green.
  - **Verification**: `npm run test`
  - **Dependencies**: T008, T011

- [ ] T013 [P] Add CORS allow-list helper
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `src/server/http/corsHeaders.ts` (new)
  - **Goal**: `buildCorsHeaders(origin)` reading `ALLOWED_ORIGINS` (comma-separated) from `env.ts` (T007), returning appropriate `Access-Control-Allow-Origin`/`-Methods`/`-Headers` or `null` for a disallowed origin (FR-043).
  - **Acceptance Criteria**: An origin not in the allow-list receives no CORS headers; an allowed origin receives the correct header set.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T007

- [ ] T014 Create `assertIsOperator` authorization check
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/server/ops/assertIsOperator.ts` (new)
  - **Goal**: Interim operator-authorization gate (plan.md Architecture/Complexity Tracking) called by every `/api/ops/*` endpoint after `getCurrentUser` — throws `UnauthorizedError`/`ForbiddenError` for a non-operator; documented single swap point for `009`'s future `assertSystemPermission(userId, "manage_operations")`.
  - **Acceptance Criteria**: A resolved user without operator standing is rejected; the function's single call site per endpoint makes the future `009` swap a one-file change.
  - **Verification**: `npx tsc --noEmit`; unit test in Phase 11
  - **Dependencies**: T006

- [ ] T015 [P] Create `src/features/operations/services/queryKeys.ts`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/operations/services/queryKeys.ts` (new)
  - **Goal**: The `opsKeys` factory exactly as specified in contracts/client-api.md (`status`, `diagnostics`, `deployments`, `deploymentEvents`, `releases`, `backupJobs`, `backupHistory`, `maintenance`, `notifications`, `logs`, `metrics`).
  - **Acceptance Criteria**: Every hook added in later phases imports its query key from this file, never an inline array literal.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [ ] T016 [P] Create the `operations` feature module barrel and scaffold
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/operations/index.ts` (new), `src/features/operations/components/` (new, empty), `src/features/operations/hooks/` (new, empty), `src/features/operations/store/` (new, empty)
  - **Goal**: Establish the module's public barrel and directory structure per Constitution Principle I, matching every existing feature module's shape.
  - **Acceptance Criteria**: `src/features/operations/` has `components/`, `hooks/`, `services/`, `store/`, `types/`, `__tests__/`, `index.ts` — identical shape to `src/features/dashboard/`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004, T015

- [ ] T017 [P] Create `operationsStore.ts` (Zustand)
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/store/operationsStore.ts` (new)
  - **Goal**: Client-only UI state exactly per contracts/client-api.md (`selectedEnvironment`, `logFilterDraft`, `activeTab`) — never a shadow cache of server data.
  - **Acceptance Criteria**: Store contains no server-fetched data, only UI-only state.
  - **Verification**: `npx tsc --noEmit`; store unit test in Phase 11
  - **Dependencies**: T016

- [ ] T018 [P] Add `@upstash/redis` dependency
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `package.json` (modify), `package-lock.json` (modify)
  - **Goal**: `npm install @upstash/redis` — the one new runtime dependency this feature introduces (plan.md Technical Context).
  - **Acceptance Criteria**: Installed as a production dependency; imported only from `src/server/**` files (verified in Phase 8's bundle-analyzer task).
  - **Verification**: `npm run build`
  - **Dependencies**: None

- [ ] T019 [P] Document new environment variables
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/environment-variables.md` (modify — additive), `.env.example` (modify — additive)
  - **Goal**: Add `REDIS_URL`/`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, `DIRECT_URL`, `CRON_SECRET`, `ALLOWED_ORIGINS` entries in the exact existing table format, each documented required/optional per environment (FR-004).
  - **Acceptance Criteria**: Every variable `env.ts` (T007) validates has a matching documentation row.
  - **Verification**: Manual diff review against `env.ts`
  - **Dependencies**: T007

- [ ] T020 Phase 1 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm the foundation compiles, lints, and the schema migration is valid before any later phase builds on it.
  - **Acceptance Criteria**: All four commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy`
  - **Dependencies**: T001–T019

---

## Phase 2: Deployment Infrastructure

**Purpose**: Production/development Dockerfiles, multi-stage builds,
Docker Compose stacks (production-shaped local + dev override),
healthchecks, volumes, networks, container/image optimization, and
deployment scripts (FR-005–FR-010).

- [ ] T021 Create the production `Dockerfile`
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `Dockerfile` (new)
  - **Goal**: Three-stage build (`deps` → `builder` → `runner`) per research.md §2 — `builder` runs `prisma generate` + `next build` with `output: "standalone"`; `runner` is a minimal non-root `node:22-alpine` image copying only the standalone server output, `public/`, and `.next/static`.
  - **Acceptance Criteria**: `docker build -t spatialmind-ai:prod .` succeeds; final image contains no dev dependencies or build toolchain (FR-005).
  - **Verification**: `docker build -t spatialmind-ai:prod .`
  - **Dependencies**: T020

- [ ] T022 [P] Enable `output: "standalone"` in Next.js config
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `next.config.ts` (modify — additive `output` field only, existing `headers()`/`securityHeaders`/bundle-analyzer wiring untouched)
  - **Goal**: Add `output: "standalone"` to `nextConfig`, required by T021's `runner` stage.
  - **Acceptance Criteria**: `next build` produces `.next/standalone/`; existing security headers (`docs/deployment.md`) remain byte-for-byte unchanged (research.md §11).
  - **Verification**: `npm run build`; `curl -I` header diff against `docs/deployment.md`
  - **Dependencies**: None

- [ ] T023 [P] Create the development `Dockerfile.dev`
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `Dockerfile.dev` (new)
  - **Goal**: Single-stage image running `next dev` with full `node_modules`, optimized for bind-mount iteration speed, not size (FR-006).
  - **Acceptance Criteria**: `docker build -f Dockerfile.dev -t spatialmind-ai:dev .` succeeds.
  - **Verification**: `docker build -f Dockerfile.dev -t spatialmind-ai:dev .`
  - **Dependencies**: None

- [ ] T024 [P] Create `.dockerignore`
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `.dockerignore` (new)
  - **Goal**: Exclude `node_modules`, `.next`, `.git`, `.env*`, test artifacts from the build context — no secret ever enters an image layer (FR-042).
  - **Acceptance Criteria**: `docker build` context size is minimized; no `.env` file is copyable into any image.
  - **Verification**: `docker build --progress=plain . 2>&1 | grep "transferring context"`
  - **Dependencies**: None

- [ ] T025 Create `docker-compose.yml` (production-shaped local stack)
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `docker-compose.yml` (new)
  - **Goal**: `app` (built from `Dockerfile`), `postgres` (`postgis/postgis:16-3.4`), `redis` (`redis:7-alpine`) services, each with a `healthcheck:` block; `app` declares `depends_on: { condition: service_healthy }` for both (research.md §3).
  - **Acceptance Criteria**: `docker compose up --wait` returns only once all three services report healthy (FR-008).
  - **Verification**: `docker compose config --quiet`; `docker compose up --wait`
  - **Dependencies**: T021

- [ ] T026 [P] Add named volumes for persistence
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `docker-compose.yml` (modify)
  - **Goal**: `postgres-data`, `redis-data` named volumes mounted for their respective services (FR-009).
  - **Acceptance Criteria**: `docker compose down && docker compose up --wait` (no `-v`) preserves previously created data.
  - **Verification**: Manual restart-and-verify per quickstart.md US2
  - **Dependencies**: T025

- [ ] T027 [P] Add `internal`/`public` network isolation
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `docker-compose.yml` (modify)
  - **Goal**: `internal` network (postgres, redis, app-to-them traffic, not published) and `public` network (only `app`'s mapped port) per research.md §3 (FR-010).
  - **Acceptance Criteria**: `postgres`/`redis` ports are not published to the host; only `app`'s port is.
  - **Verification**: `docker compose config` port-mapping review
  - **Dependencies**: T025

- [ ] T028 [P] Create `docker-compose.dev.yml` override
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `docker-compose.dev.yml` (new)
  - **Goal**: Overrides `app` to build from `Dockerfile.dev` (T023) with a bind mount of `src/` and `next dev`, reusing `postgres`/`redis` from the base file.
  - **Acceptance Criteria**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` hot-reloads on source edits.
  - **Verification**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet`
  - **Dependencies**: T025

- [ ] T029 [P] Add `GET /api/system/status` as the Compose healthcheck target
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `docker-compose.yml` (modify — `app.healthcheck`)
  - **Goal**: Point `app`'s `healthcheck:` at `GET /api/system/status` (Phase 5), `pg_isready` for `postgres`, `redis-cli ping` for `redis`.
  - **Acceptance Criteria**: A deliberately broken `app` container is reported unhealthy by `docker compose ps` within its configured interval.
  - **Verification**: `docker compose ps` after `docker compose up --wait`
  - **Dependencies**: T025, T054 (health endpoint from Phase 5)

- [ ] T030 [P] Minimize production image layers
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: `Dockerfile` (modify)
  - **Goal**: Combine `RUN` instructions where safe, order layers by change frequency (dependencies before source) to maximize Docker layer-cache hits across CI runs (research.md §2).
  - **Acceptance Criteria**: A source-only change rebuilds only the final layers, not `npm ci`.
  - **Verification**: `docker build` twice, confirm cache hits on the second run for unchanged layers
  - **Dependencies**: T021

- [ ] T031 [P] Verify non-root user in production image
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `Dockerfile` (modify — add `USER node` in the `runner` stage)
  - **Goal**: The `runner` stage's process runs as a non-root user (FR-046-adjacent hardening).
  - **Acceptance Criteria**: `docker run spatialmind-ai:prod whoami` reports a non-root user.
  - **Verification**: `docker run --rm spatialmind-ai:prod whoami`
  - **Dependencies**: T021

- [ ] T032 [P] Report final image size
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: N/A (verification task)
  - **Goal**: Record the built production image's size as a documented baseline for future regression comparison (quickstart.md).
  - **Acceptance Criteria**: Size recorded in `docs/deployment.md` (Phase 15 documentation task references this baseline).
  - **Verification**: `docker images spatialmind-ai:prod`
  - **Dependencies**: T021, T030

- [ ] T033 [P] Reuse `docker-compose.test.yml`'s Postgres image tag
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `docker-compose.yml` (verify — no change if already aligned)
  - **Goal**: Confirm `docker-compose.yml`'s `postgres` service pins the identical `postgis/postgis:16-3.4` tag `docker-compose.test.yml` already uses (research.md §3) — no second, untested Postgres image version introduced.
  - **Acceptance Criteria**: Image tags match exactly.
  - **Verification**: `grep image docker-compose.yml docker-compose.test.yml`
  - **Dependencies**: T025

- [ ] T034 Create `scripts/deploy/build-image.sh` (or `.ps1`, matching this repo's `ps` script convention)
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: `scripts/deploy/build-image.ps1` (new)
  - **Goal**: One reusable script wrapping `docker build` with the correct tag/build-args, callable identically from a developer's machine and from `ci.yml` (Phase 3) — avoids duplicating the `docker build` invocation in two places.
  - **Acceptance Criteria**: `ci.yml`'s Docker build step (Phase 3) calls this script rather than inlining the command.
  - **Verification**: `pwsh scripts/deploy/build-image.ps1`
  - **Dependencies**: T021, T023

- [ ] T035 [P] Create `scripts/deploy/wait-for-healthy.ps1`
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: `scripts/deploy/wait-for-healthy.ps1` (new)
  - **Goal**: Polls `docker compose ps`/a given health URL until healthy or a timeout, used by local quickstart validation and optionally by CI smoke tests.
  - **Acceptance Criteria**: Script exits non-zero if healthy state is not reached within the timeout (SC-003's 5-minute budget).
  - **Verification**: `pwsh scripts/deploy/wait-for-healthy.ps1`
  - **Dependencies**: T025, T029

- [ ] T036 [P] Add `test:db:up`-equivalent npm scripts for the full stack
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: `package.json` (modify — additive scripts: `stack:up`, `stack:down`, `stack:dev`)
  - **Goal**: `"stack:up": "docker compose up --wait"`, `"stack:down": "docker compose down"`, `"stack:dev": "docker compose -f docker-compose.yml -f docker-compose.dev.yml up"`, mirroring the existing `test:db:up`/`test:db:down` naming convention exactly.
  - **Acceptance Criteria**: `npm run stack:up` behaves identically to the raw `docker compose up --wait` command.
  - **Verification**: `npm run stack:up && npm run stack:down`
  - **Dependencies**: T025, T028

- [ ] T037 [P] Document the local stack in `docs/deployment.md`
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: `docs/deployment.md` (modify — additive new section)
  - **Goal**: A "Local Full Stack (Docker Compose)" section documenting `npm run stack:up`/`stack:dev`, the three services, and how to verify all-healthy — placed after the existing Phase 3 section, following that file's existing per-phase heading convention.
  - **Acceptance Criteria**: Section present; commands match T036 exactly.
  - **Verification**: Manual review
  - **Dependencies**: T036

- [ ] T038 [P] Container resource limits (documented, not enforced in Compose)
  - **Priority**: Could-have
  - **User Story**: [US2]
  - **Files**: `docker-compose.yml` (modify — `deploy.resources.limits` for local parity only)
  - **Goal**: Set conservative local CPU/memory limits on `app`/`postgres`/`redis` so local runs approximate constrained production sizing without requiring Swarm/Kubernetes.
  - **Acceptance Criteria**: Stack still reaches all-healthy under the configured limits on a standard developer machine (SC-003).
  - **Verification**: `docker compose up --wait`
  - **Dependencies**: T025

- [ ] T039 [P] Add `HEALTHCHECK` instruction to the production `Dockerfile`
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: `Dockerfile` (modify)
  - **Goal**: A Docker-native `HEALTHCHECK` instruction calling `/api/system/status`, so the image is self-describing to any orchestrator (Railway, AWS, etc.), not only Compose.
  - **Acceptance Criteria**: `docker inspect` on a running container shows a `Healthcheck` status.
  - **Verification**: `docker inspect --format='{{json .State.Health}}' <container>`
  - **Dependencies**: T021, T054

- [ ] T040 [P] Verify PostGIS extension availability in the Compose Postgres image
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: N/A (verification task)
  - **Goal**: Confirm `postgis/postgis:16-3.4` supports `CREATE EXTENSION IF NOT EXISTS postgis;` (already relied on by `003`'s migration) inside the new `docker-compose.yml` stack, not only the test compose file.
  - **Acceptance Criteria**: `prisma migrate deploy` against the Compose stack's `postgres` service succeeds.
  - **Verification**: `docker compose up --wait && npx prisma migrate deploy`
  - **Dependencies**: T025, T002

- [ ] T041 [P] Redis connectivity smoke check in Compose
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: N/A (verification task)
  - **Goal**: Confirm the `app` service can reach `redis` over the `internal` network using `REDIS_URL` pointed at the Compose service name.
  - **Acceptance Criteria**: `cache.ts` (T010) `set`/`get` round-trips successfully inside the Compose stack.
  - **Verification**: Manual `docker compose exec app node -e "..."` smoke check per quickstart.md
  - **Dependencies**: T025, T027, T010

- [ ] T042 [P] Multi-stage build cache verification in CI context
  - **Priority**: Should-have
  - **User Story**: [US2]
  - **Files**: N/A (verification task, feeds Phase 3's Docker build job)
  - **Goal**: Confirm the three-stage `Dockerfile` (T021) is structured so GitHub Actions' layer caching (Phase 3) can skip the `deps` stage when `package-lock.json` is unchanged.
  - **Acceptance Criteria**: A CI run with only source changes (no dependency change) rebuilds noticeably faster than a cold run.
  - **Verification**: Compare CI job duration across two runs (Phase 3)
  - **Dependencies**: T021

- [ ] T043 [P] Document image tagging convention
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document the `spatialmind-ai:<commitSha>` / `spatialmind-ai:latest` tagging scheme used by `deploy.yml` (Phase 3), matching `ReleaseVersion.commitSha` (data-model.md).
  - **Acceptance Criteria**: Tagging scheme documented matches what Phase 3's workflow actually produces.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T044 [P] Integration test: full stack boot-and-persist
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `src/features/operations/__tests__/dockerStack.integration.test.ts` (new — orchestrates `docker compose` via a test script, skip-if-Docker-unavailable per existing test-tier conventions)
  - **Goal**: Automated version of quickstart.md's US2 scenario — build, `up --wait`, write test data, restart, confirm persistence.
  - **Acceptance Criteria**: Test passes locally with Docker available; skips cleanly in environments without Docker (mirrors the existing PostGIS-test-database skip-if-unavailable pattern).
  - **Verification**: `npm run test`
  - **Dependencies**: T025, T026

- [ ] T045 Phase 2 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm Docker/Compose artifacts are valid and the standard quality gates still pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && docker build -t spatialmind-ai:prod . && docker build -f Dockerfile.dev -t spatialmind-ai:dev . && docker compose config --quiet`
  - **Dependencies**: T021–T044

---

## Phase 3: CI/CD

**Purpose**: GitHub Actions build/test/lint/security-scan/dependency-scan/
Docker-build/deploy/release/rollback/version-tagging workflows
(FR-011–FR-015).

- [ ] T046 Create `.github/workflows/ci.yml` — lint job
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/ci.yml` (new)
  - **Goal**: `lint` job running `npm run lint` on every PR and push to `main` (research.md §4).
  - **Acceptance Criteria**: A PR with an ESLint violation fails this job.
  - **Verification**: Push a PR with a lint error, confirm job fails
  - **Dependencies**: T020

- [ ] T047 [P] Add `typecheck` job to `ci.yml`
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/ci.yml` (modify)
  - **Goal**: `typecheck` job running `npx tsc --noEmit`, parallel to `lint`.
  - **Acceptance Criteria**: A PR with a type error fails this job independently of `lint`.
  - **Verification**: Push a PR with a type error, confirm job fails
  - **Dependencies**: T046

- [ ] T048 [P] Add `test` job to `ci.yml`
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/ci.yml` (modify)
  - **Goal**: `test` job that boots `docker-compose.test.yml` exactly as `npm run test:db:up` does, runs `npm run test`, then `npm run test:db:down` — reusing the existing test-database pattern verbatim, not a new one.
  - **Acceptance Criteria**: A PR with a failing test fails this job; the ephemeral test database is always torn down (`if: always()` on the down step).
  - **Verification**: Push a PR with a failing test, confirm job fails and cleanup still runs
  - **Dependencies**: T046

- [ ] T049 Add `build` job to `ci.yml` (gated on lint/typecheck/test)
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/ci.yml` (modify)
  - **Goal**: `build` job (`needs: [lint, typecheck, test]`) running `next build`.
  - **Acceptance Criteria**: `build` never runs if any of `lint`/`typecheck`/`test` fails (FR-012).
  - **Verification**: Push a PR with a failing test, confirm `build` job is skipped
  - **Dependencies**: T047, T048

- [ ] T050 [P] Add dependency-audit job to `ci.yml`
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `.github/workflows/ci.yml` (modify)
  - **Goal**: `dependency-scan` job running `npm audit --audit-level=high` (or equivalent), non-blocking initially (`continue-on-error: true`) with a documented follow-up to make it blocking once the baseline is clean.
  - **Acceptance Criteria**: Job runs on every PR and reports findings without blocking merge on pre-existing advisories.
  - **Verification**: Manual review of a run's output
  - **Dependencies**: T046

- [ ] T051 [P] Add security-scan job to `ci.yml`
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `.github/workflows/ci.yml` (modify)
  - **Goal**: `security-scan` job running a static analysis pass (e.g., CodeQL's default JavaScript/TypeScript queries) on every PR.
  - **Acceptance Criteria**: Job completes and surfaces findings as PR annotations.
  - **Verification**: Manual review of a run's output
  - **Dependencies**: T046

- [ ] T052 Add Docker build job to `ci.yml`
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `.github/workflows/ci.yml` (modify)
  - **Goal**: `docker-build` job (`needs: build`) calling `scripts/deploy/build-image.ps1` (T034) to confirm the production image still builds on every PR, tagged with the PR's commit SHA, not pushed anywhere.
  - **Acceptance Criteria**: A PR that breaks the Dockerfile fails this job.
  - **Verification**: Push a PR with a broken `Dockerfile`, confirm job fails
  - **Dependencies**: T034, T049

- [ ] T053 Create `.github/workflows/deploy.yml` — migrate + deploy job
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/deploy.yml` (new)
  - **Goal**: Triggered only on `main` after `ci.yml` succeeds: `prisma migrate deploy` against Production's `DIRECT_URL` (research.md §16), then deploy to Vercel (`vercel deploy --prod` via the standard CLI/GitHub integration) — migration runs strictly before the new version receives traffic (reusing `003`'s documented ordering).
  - **Acceptance Criteria**: A migration failure blocks the deploy step entirely; a successful deploy is reachable at the production URL.
  - **Verification**: Merge a PR to `main`, confirm workflow run succeeds end-to-end
  - **Dependencies**: T002, T049

- [ ] T054 Implement `GET /api/system/status`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/system/status/route.ts` (new)
  - **Goal**: Unauthenticated endpoint calling `healthChecker.checkAllComponents()` (T008), returning `200`/`503` per contracts/api-contracts.md's exact response shape.
  - **Acceptance Criteria**: Returns `200` with all-healthy in a working environment; `503` when the database is unreachable (FR-016).
  - **Verification**: `curl http://localhost:3000/api/system/status`; API test in T055
  - **Dependencies**: T008

- [ ] T055 [P] API tests for `/api/system/status`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/system/__tests__/status.api.test.ts` (new)
  - **Goal**: Success (all healthy), degraded, and unhealthy-database response-shape/status-code tests against the real ephemeral PostGIS test database.
  - **Acceptance Criteria**: All three cases pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T054

- [ ] T056 Wire `deploymentRepository.ts` — release/deployment writes
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/server/repositories/deploymentRepository.ts` (new)
  - **Goal**: `createRelease`, `listReleases`, `createDeployment`, `updateDeploymentStatus`, `appendDeploymentEvent`, `listDeployments`, `listDeploymentEvents`, `rollbackDeployment` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `rollbackDeployment` throws a dedicated `NoPreviousDeploymentError` (new, extends existing error pattern) when no prior successful deployment exists for the environment (spec Edge Cases).
  - **Verification**: `npx tsc --noEmit`; repository tests in T060
  - **Dependencies**: T001, T004

- [ ] T057 Implement `POST /api/ops/deployments` and `PATCH /api/ops/deployments/:deploymentId` (CI/CD-only, shared-secret auth)
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/app/api/ops/deployments/route.ts` (new), `src/app/api/ops/deployments/[deploymentId]/route.ts` (new)
  - **Goal**: `POST` creates/links a `ReleaseVersion`+`DeploymentHistory`; `PATCH` updates status and appends a `DeploymentEvent`, both authenticated via `Authorization: Bearer <CRON_SECRET>`-equivalent shared secret (reusing `009`'s convention, not a new one).
  - **Acceptance Criteria**: Called successfully from `deploy.yml` (T053) at each pipeline stage transition (FR-013, FR-014).
  - **Verification**: `npx tsc --noEmit`; API test in T060
  - **Dependencies**: T056, T005

- [ ] T058 [P] Implement `GET /api/ops/deployments` and `GET /api/ops/deployments/:deploymentId/events`
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/app/api/ops/deployments/route.ts` (modify — add `GET`), `src/app/api/ops/deployments/[deploymentId]/events/route.ts` (new)
  - **Goal**: Operator-gated (`getCurrentUser` + `assertIsOperator`, T014) list/detail reads per contracts/api-contracts.md.
  - **Acceptance Criteria**: Returns deployment history with release info and event timeline (FR-047).
  - **Verification**: `npx tsc --noEmit`; API test in T060
  - **Dependencies**: T056, T014

- [ ] T059 [P] Implement `POST /api/ops/deployments/:deploymentId/rollback`
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/app/api/ops/deployments/[deploymentId]/rollback/route.ts` (new)
  - **Goal**: Operator-gated; calls `deploymentRepository.rollbackDeployment`; on `NoPreviousDeploymentError`, returns a clear, actionable `NOT_FOUND`-family error (FR-015, spec Edge Cases).
  - **Acceptance Criteria**: Rollback creates a new `DeploymentHistory` with `rolledBackFromId` set, within SC-006's 10-minute budget; the no-prior-deployment case returns a clear error, not a 500.
  - **Verification**: `npx tsc --noEmit`; API test in T060
  - **Dependencies**: T056, T014

- [ ] T060 [P] Repository + API tests for deployment/rollback/release endpoints
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/server/repositories/__tests__/deploymentRepository.test.ts` (new), `src/app/api/ops/deployments/__tests__/deployments.api.test.ts` (new)
  - **Goal**: Cover `deploymentRepository`'s success/not-found/`NoPreviousDeploymentError` paths and every deployment/rollback/release endpoint's success/validation/401/403 paths.
  - **Acceptance Criteria**: All cases pass against the real ephemeral PostGIS test database.
  - **Verification**: `npm run test`
  - **Dependencies**: T056, T057, T058, T059

- [ ] T061 [P] Implement `GET /api/ops/releases`
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/app/api/ops/releases/route.ts` (new)
  - **Goal**: Operator-gated list of `ReleaseVersion` rows (FR-048).
  - **Acceptance Criteria**: Every release is individually identifiable, versioned, traceable to `commitSha`.
  - **Verification**: `npx tsc --noEmit`; API test covered by T060's suite extension
  - **Dependencies**: T056, T014

- [ ] T062 Add `release` workflow job to `deploy.yml`
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/deploy.yml` (modify)
  - **Goal**: On successful production deploy, tag the release (`vYYYY.MM.DD-N`, research.md §5) and call `POST /api/ops/deployments` (T057) to record the `ReleaseVersion`.
  - **Acceptance Criteria**: Every production deploy produces exactly one new `ReleaseVersion` row with a matching git tag.
  - **Verification**: Merge to `main`, confirm tag + `GET /api/ops/releases` entry appear
  - **Dependencies**: T053, T057

- [ ] T063 Add rollback workflow trigger (manual `workflow_dispatch`)
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/deploy.yml` (modify — add a `workflow_dispatch` input for `deploymentId`)
  - **Goal**: An operator can trigger `POST /api/ops/deployments/:deploymentId/rollback` (T059) from the GitHub Actions UI without needing direct API access, as an alternative entry point to the operations dashboard's rollback button (Phase 11).
  - **Acceptance Criteria**: Manually dispatching the workflow with a valid `deploymentId` performs the rollback.
  - **Verification**: Manual `workflow_dispatch` run against a Staging deployment
  - **Dependencies**: T059, T062

- [ ] T064 [P] Version-tagging convention enforcement
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/deploy.yml` (modify)
  - **Goal**: Validate the generated version string matches `ops.schema.ts`'s `version` regex (T005) before calling T057, failing the workflow early on a malformed tag rather than persisting bad data.
  - **Acceptance Criteria**: A manually-forced malformed tag fails the workflow before any API call.
  - **Verification**: Manual test with an intentionally malformed version string
  - **Dependencies**: T005, T062

- [ ] T065 [P] Add `actionlint` validation step for both workflows
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/ci.yml` (modify — self-validates), or a dedicated meta-check
  - **Goal**: Static validation that `ci.yml`/`deploy.yml` are syntactically well-formed (plan.md Quality Gates' "CI workflow validation").
  - **Acceptance Criteria**: Both workflow files pass `actionlint` (or equivalent) with zero errors.
  - **Verification**: `actionlint .github/workflows/*.yml` (or documented equivalent if the tool is unavailable in this environment)
  - **Dependencies**: T046, T053

- [ ] T066 [P] Document the CI/CD pipeline
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `docs/deployment.md` (modify — additive new section)
  - **Goal**: Document the `ci.yml`/`deploy.yml` job graph, required repository secrets (`CRON_SECRET`, Vercel token, `DIRECT_URL`), and the rollback procedure (both dashboard and `workflow_dispatch` paths).
  - **Acceptance Criteria**: A new operator can follow this section to understand the full pipeline without reading the YAML directly (SC-020).
  - **Verification**: Manual review
  - **Dependencies**: T053, T063

- [ ] T067 [P] Add `deploymentId`/`requestId` correlation to `logger.request()`
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `src/shared/lib/logger.ts` (modify — additive optional field)
  - **Goal**: Thread an optional `deploymentId` field through `logger.request()`'s structured output when set via an environment-provided build/deploy identifier, enabling the correlation research.md §21 describes.
  - **Acceptance Criteria**: Log lines include `deploymentId` when the environment variable is present, omit it otherwise (no breaking change to existing log consumers).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T009

- [ ] T068 [P] CI pipeline integration test
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/ci.yml` (verify against a real test PR, not a new file)
  - **Goal**: Open a real PR with a deliberately failing test, confirm `test`/`build`/`docker-build` are blocked; fix and confirm all jobs pass (quickstart.md US3 step 1–2).
  - **Acceptance Criteria**: Matches quickstart.md US3's documented expected behavior exactly.
  - **Verification**: Manual PR-based verification
  - **Dependencies**: T046–T052

- [ ] T069 [P] Deploy pipeline integration test
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `.github/workflows/deploy.yml` (verify against a real Staging deploy, not a new file)
  - **Goal**: Merge a change targeting Staging, confirm `DeploymentHistory` transitions `PENDING → IN_PROGRESS → SUCCEEDED` and a rollback completes within SC-006's budget (quickstart.md US3 step 2–3).
  - **Acceptance Criteria**: Matches quickstart.md US3's documented expected behavior exactly.
  - **Verification**: Manual Staging-environment verification
  - **Dependencies**: T053, T059, T062

- [ ] T070 Phase 3 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm CI/CD artifacts are valid and the standard quality gates still pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy && docker build -t spatialmind-ai:prod . && docker compose config --quiet`
  - **Dependencies**: T046–T069

---

## Phase 4: Environment Management

**Purpose**: Development/Testing/Staging/Production environment
provisioning documentation, environment validation wiring, secrets
loading, configuration verification, and health validation per
environment (FR-001–FR-004, US1).

- [ ] T071 Wire `env.ts` into application startup
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `src/server/config/env.ts` (verify import triggers module-load parsing — no new file), `next.config.ts` (modify if a startup-time import hook is needed)
  - **Goal**: Ensure `env.ts` (T007) is imported early enough in the request lifecycle (or build lifecycle) that a missing/invalid variable blocks startup rather than surfacing later as a runtime error mid-request.
  - **Acceptance Criteria**: `DATABASE_URL= npm run dev` fails immediately with `env.ts`'s specific error (SC-001), matching quickstart.md US1.
  - **Verification**: Manual `DATABASE_URL= npm run dev` check
  - **Dependencies**: T007

- [ ] T072 [P] Implement `GET /api/ops/config/validate`
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `src/app/api/ops/config/validate/route.ts` (new)
  - **Goal**: Operator-gated, non-Production-only endpoint exercising `env.ts`'s schema and returning pass/fail per key without ever revealing actual secret values, per contracts/api-contracts.md.
  - **Acceptance Criteria**: Returns `valid: false` with the specific missing/invalid key names when a variable is misconfigured; never echoes a value.
  - **Verification**: `npx tsc --noEmit`; API test in T073
  - **Dependencies**: T007, T014

- [ ] T073 [P] API tests for `/api/ops/config/validate`
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `src/app/api/ops/config/__tests__/validate.api.test.ts` (new)
  - **Goal**: Valid-config and invalid-config (missing key) response-shape tests; confirm no secret value ever appears in the response body.
  - **Acceptance Criteria**: Both cases pass; a snapshot/assertion explicitly checks no `DATABASE_URL` value substring appears in output.
  - **Verification**: `npm run test`
  - **Dependencies**: T072

- [ ] T074 Document the four-environment isolation model
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/environment-variables.md` (modify — additive new top section)
  - **Goal**: Document Development/Testing/Staging/Production as four isolated configuration+data contexts (FR-001), each environment's `DATABASE_URL`/secrets sourced independently, no shared value between them.
  - **Acceptance Criteria**: A new operator can identify, for any variable, which environment(s) require it (FR-004).
  - **Verification**: Manual review
  - **Dependencies**: T019

- [ ] T075 [P] Document Development environment setup
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Step-by-step Development environment provisioning (local `.env`, `npm run dev`, `npm run stack:up`), targeting SC-002's 30-minute budget.
  - **Acceptance Criteria**: A new operator following only this section reaches a healthy Development environment.
  - **Verification**: Manual walkthrough timing check
  - **Dependencies**: T074

- [ ] T076 [P] Document Testing environment setup
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document the ephemeral `docker-compose.test.yml`-backed Testing environment used by `ci.yml`'s `test` job — how it differs from Development (disposable, `tmpfs`-backed) and Staging.
  - **Acceptance Criteria**: Matches `ci.yml`'s (T048) actual behavior exactly.
  - **Verification**: Manual review against `ci.yml`
  - **Dependencies**: T048, T074

- [ ] T077 [P] Document Staging environment setup
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document Staging provisioning on the primary platform (Vercel Preview + a dedicated Supabase project/branch) — isolated `DATABASE_URL`, its own `CRON_SECRET`, targeting SC-002.
  - **Acceptance Criteria**: A new operator following only this section reaches a healthy Staging environment within 30 minutes.
  - **Verification**: Manual walkthrough timing check
  - **Dependencies**: T074

- [ ] T078 [P] Document Production environment setup
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document Production provisioning (Vercel Production + Supabase Production project, Upstash Redis, all secrets via the platform's managed store) and the stricter Production-only `env.ts` refinements (FR-003).
  - **Acceptance Criteria**: A new operator following only this section reaches a healthy Production environment within 30 minutes.
  - **Verification**: Manual walkthrough timing check
  - **Dependencies**: T074

- [ ] T079 [P] Production-only configuration refinement tests
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `src/server/config/__tests__/env.test.ts` (new)
  - **Goal**: Unit tests confirming `env.ts`'s Production schema rejects debug/test-only values that the base schema permits (FR-003).
  - **Acceptance Criteria**: A Production-mode parse with a forbidden debug flag fails; the same input succeeds in Development mode.
  - **Verification**: `npm run test`
  - **Dependencies**: T007

- [ ] T080 [P] Secrets-loading verification per environment
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive "Secrets Loading" subsection)
  - **Goal**: Document how each environment's secrets are provisioned (Vercel managed env vars scoped per Preview/Production, local `.env`, CI repository secrets) — no code change, documentation of the existing/introduced mechanism only (research.md §9).
  - **Acceptance Criteria**: Every secret this feature introduces (`CRON_SECRET`, Redis credentials, `DIRECT_URL`) has a documented provisioning path per environment.
  - **Verification**: Manual review
  - **Dependencies**: T019, T078

- [ ] T081 [P] Health validation per environment
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document the "confirmed healthy" check for each environment (`GET /api/system/status` returning `200`), completing SC-002's "stood up and confirmed healthy" criterion for all four environments.
  - **Acceptance Criteria**: Each of the four environment sections (T075–T078) ends with an explicit health-check step referencing this subsection.
  - **Verification**: Manual review
  - **Dependencies**: T054, T075, T076, T077, T078

- [ ] T082 [P] Environment isolation integration test
  - **Priority**: Should-have
  - **User Story**: [US1]
  - **Files**: `src/server/config/__tests__/env.test.ts` (modify — add isolation assertions)
  - **Goal**: Confirm two different `env.ts` parses (simulating two environments) never share a resolved `DATABASE_URL`/secret value when given distinct inputs — a structural isolation check, not a live-infrastructure check.
  - **Acceptance Criteria**: Test passes, demonstrating no cross-environment default/fallback leakage.
  - **Verification**: `npm run test`
  - **Dependencies**: T079

- [ ] T083 [P] Configuration verification checklist
  - **Priority**: Should-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive checklist)
  - **Goal**: A concise pre-deploy checklist (all required vars set, `GET /api/ops/config/validate` returns `valid: true`, `GET /api/system/status` returns `200`) an operator runs before promoting to Production.
  - **Acceptance Criteria**: Checklist items map 1:1 to `env.ts`'s required keys and the two endpoints above.
  - **Verification**: Manual review
  - **Dependencies**: T072, T081

- [ ] T084 [P] Document the `DEV_USER_ID`/interim-auth caveat alongside new environments
  - **Priority**: Should-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive cross-reference)
  - **Goal**: Cross-reference the existing "Known gap — no real authentication" Phase 3 note so operators provisioning Staging/Production per T077/T078 are not surprised by the interim `DEV_USER_ID` seam still being in effect until `009` ships.
  - **Acceptance Criteria**: Cross-reference present and accurate as of this feature's implementation.
  - **Verification**: Manual review
  - **Dependencies**: T077, T078

- [ ] T085 [P] Add environment badge/indicator to the operations dashboard data contract
  - **Priority**: Could-have
  - **User Story**: [US1]
  - **Files**: `src/features/operations/types/operations.types.ts` (modify — additive `environment` field already present on relevant response types; verify, no structural change)
  - **Goal**: Confirm every operations API response that is environment-scoped (deployments, backups) carries an explicit `environment` field so the future dashboard (Phase 13) can visibly indicate which environment is being viewed.
  - **Acceptance Criteria**: `DeploymentSummary`/`BackupJobSummary` types include `environment`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [ ] T086 [P] Validate PostGIS availability check as part of environment health
  - **Priority**: Should-have
  - **User Story**: [US1]
  - **Files**: `src/server/ops/healthChecker.ts` (modify — `checkDatabaseHealth` includes a lightweight `postgis_version()` call)
  - **Goal**: Extend the database health check to confirm the PostGIS extension is present, not just that Postgres itself is reachable, per Constitution Principle III's requirement that every environment's database support PostGIS.
  - **Acceptance Criteria**: A Postgres instance without PostGIS reports `degraded`, not `healthy`.
  - **Verification**: `npm run test` (extends T012's health-checker tests)
  - **Dependencies**: T008

- [ ] T087 [P] Environment provisioning runbook cross-links
  - **Priority**: Could-have
  - **User Story**: [US1]
  - **Files**: `docs/deployment.md` (modify — additive table of contents links)
  - **Goal**: Add a short table-of-contents linking the four environment sections (T075–T078) and the CI/CD section (T066) at the top of `docs/deployment.md` for discoverability (SC-020).
  - **Acceptance Criteria**: All section anchors resolve.
  - **Verification**: Manual review
  - **Dependencies**: T066, T075, T076, T077, T078

- [ ] T088 [P] Integration test: environment validation end-to-end
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `src/features/operations/__tests__/environmentValidation.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US1 scenarios (missing-var startup failure, `/api/ops/config/validate` pass/fail).
  - **Acceptance Criteria**: Matches quickstart.md US1 exactly.
  - **Verification**: `npm run test`
  - **Dependencies**: T071, T072

- [ ] T089 [P] Accessibility pass: none required (API/documentation-only phase)
  - **Priority**: Could-have
  - **User Story**: [US1]
  - **Files**: N/A
  - **Goal**: Explicitly record that Phase 4 introduces no new UI, so no accessibility task applies here — avoids a silently-skipped checklist item being mistaken for an oversight later (Phase 13 owns all new UI).
  - **Acceptance Criteria**: Noted in `docs/deployment.md`'s Phase 4 section as N/A.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T090 Phase 4 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm environment management is fully documented and validated before monitoring/logging phases build on it.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy`
  - **Dependencies**: T071–T088

---

## Phase 5: Monitoring

**Purpose**: Application/API/database health, system metrics (storage,
memory, CPU, performance, availability), the monitoring dashboard's data
layer, and alerting (FR-016–FR-018, US4).

- [ ] T091 Create `healthRepository.ts`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/repositories/healthRepository.ts` (new)
  - **Goal**: `recordHealthCheck`, `getLatestHealth` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `getLatestHealth` performs one indexed query per component, never a full-table scan.
  - **Verification**: `npx tsc --noEmit`; repository test in T096
  - **Dependencies**: T001, T008

- [ ] T092 [P] Create `metricRepository.ts`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/repositories/metricRepository.ts` (new)
  - **Goal**: `recordMetric`, `queryMetrics` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `queryMetrics` supports `metricName` + time-range filtering via the `[metricName, recordedAt]` index.
  - **Verification**: `npx tsc --noEmit`; repository test in T096
  - **Dependencies**: T001

- [ ] T093 [P] Extend Route Handler timing to record `response_time_ms`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/http/handleRouteError.ts` (verify — no change needed), `src/server/ops/requestMetrics.ts` (new — thin helper called from the existing `respond()` pattern in Route Handlers)
  - **Goal**: A `recordRequestMetric(durationMs, route)` helper new Route Handlers call alongside their existing `logger.request()` call, writing a `SystemMetric` sample without modifying `logger.request()`'s own signature.
  - **Acceptance Criteria**: New `/api/ops/*` Route Handlers (Phases 5–11) call this helper; existing Route Handlers are unmodified (this feature adds a helper, it does not retrofit every existing route).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T092

- [ ] T094 Implement `POST /api/ops/metrics/sample` (scheduled)
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/ops/metrics/sample/route.ts` (new)
  - **Goal**: `CRON_SECRET`-authenticated endpoint snapshotting `pg_stat_activity` connection count and `pg_database_size` into `SystemMetric` rows (research.md §7).
  - **Acceptance Criteria**: Returns `{ "recorded": <n> }`; each call produces new `SystemMetric` rows.
  - **Verification**: `npx tsc --noEmit`; API test in T096
  - **Dependencies**: T092

- [ ] T095 [P] Implement `GET /api/ops/metrics`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/ops/metrics/route.ts` (new)
  - **Goal**: Operator-gated, `metricName`/`from`/`to`-filtered read per contracts/api-contracts.md (FR-017).
  - **Acceptance Criteria**: Default time range is last 24h when `from`/`to` omitted.
  - **Verification**: `npx tsc --noEmit`; API test in T096
  - **Dependencies**: T092, T014

- [ ] T096 [P] Repository + API tests for health/metrics endpoints
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/repositories/__tests__/healthRepository.test.ts` (new), `src/server/repositories/__tests__/metricRepository.test.ts` (new), `src/app/api/ops/metrics/__tests__/metrics.api.test.ts` (new)
  - **Goal**: Cover both repositories' functions and both metrics endpoints' success/validation/auth paths.
  - **Acceptance Criteria**: All cases pass against the real ephemeral PostGIS test database.
  - **Verification**: `npm run test`
  - **Dependencies**: T091, T092, T094, T095

- [ ] T097 Create `notificationRepository.ts`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/repositories/notificationRepository.ts` (new)
  - **Goal**: `createNotification`, `listNotifications`, `acknowledgeNotification`, `resolveNotification` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `resolveNotification` sets `resolvedAt`; rows are never deleted by this repository (audit trail preserved, SC-007).
  - **Verification**: `npx tsc --noEmit`; repository test in T101
  - **Dependencies**: T001

- [ ] T098 Wire alert generation into the health/metrics scheduled checks
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/ops/metrics/sample/route.ts` (modify), `src/server/ops/healthChecker.ts` (modify — optionally trigger on unhealthy)
  - **Goal**: An unhealthy `HealthCheck` result or a metric crossing a configured threshold (T003's constants) calls `notificationRepository.createNotification` (`type: "health_alert"`), satisfying FR-018 within SC-007's 5-minute budget.
  - **Acceptance Criteria**: Stopping the database and running the scheduled check produces a `SystemNotification` within one scheduled interval; restoring it and re-running resolves the notification.
  - **Verification**: `npm run test`; manual quickstart.md US4 walkthrough
  - **Dependencies**: T086, T094, T097

- [ ] T099 [P] Implement `GET /api/ops/notifications`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/ops/notifications/route.ts` (new)
  - **Goal**: Operator-gated, `severity`/`resolved`-filtered read per contracts/api-contracts.md.
  - **Acceptance Criteria**: Matches the documented response shape exactly.
  - **Verification**: `npx tsc --noEmit`; API test in T101
  - **Dependencies**: T097, T014

- [ ] T100 [P] Implement `POST /api/ops/notifications/:id/acknowledge`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/ops/notifications/[id]/acknowledge/route.ts` (new)
  - **Goal**: Operator-gated; sets `acknowledgedBy` without resolving the notification (distinct actions, contracts/api-contracts.md).
  - **Acceptance Criteria**: Acknowledging does not set `resolvedAt`.
  - **Verification**: `npx tsc --noEmit`; API test in T101
  - **Dependencies**: T097, T014

- [ ] T101 [P] Repository + API tests for notifications
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/server/repositories/__tests__/notificationRepository.test.ts` (new), `src/app/api/ops/notifications/__tests__/notifications.api.test.ts` (new)
  - **Goal**: Cover create/list/acknowledge/resolve and both endpoints' success/validation/auth paths.
  - **Acceptance Criteria**: All cases pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T097, T099, T100

- [ ] T102 Implement `GET /api/ops/diagnostics`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/diagnostics/route.ts` (new)
  - **Goal**: Operator-gated; consolidates `healthChecker.checkAllComponents()`, recent `LogEntry` `error`-level rows (Phase 6 dependency, stubbed with an empty array until Phase 6 lands if built out of order), `pg_stat_activity`/`pg_database_size`, and the active `MaintenanceWindow` (Phase 11 dependency, stubbed `null` until then) into one response per contracts/api-contracts.md.
  - **Acceptance Criteria**: Returns the full consolidated shape once all dependencies land (Phase 13's integration task closes any stubs).
  - **Verification**: `npx tsc --noEmit`; API test in T103
  - **Dependencies**: T008, T091

- [ ] T103 [P] API test for `/api/ops/diagnostics`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/diagnostics/__tests__/diagnostics.api.test.ts` (new)
  - **Goal**: Response-shape and auth-gating tests.
  - **Acceptance Criteria**: Passes; response matches contracts/api-contracts.md's documented shape.
  - **Verification**: `npm run test`
  - **Dependencies**: T102

- [ ] T104 [P] Storage monitoring — `db_size_bytes` metric
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/ops/metrics/sample/route.ts` (verify — covered by T094, no new file)
  - **Goal**: Confirm `pg_database_size` sampling (T094) is labeled and queryable as `db_size_bytes` per data-model.md's `metricName` vocabulary.
  - **Acceptance Criteria**: `GET /api/ops/metrics?metricName=db_size_bytes` returns samples.
  - **Verification**: Manual `curl` check
  - **Dependencies**: T094

- [ ] T105 [P] Memory monitoring — primary-platform-native, documented not built
  - **Priority**: Should-have
  - **User Story**: [US4]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document that per-function memory usage is available via the primary platform's own function observability (research.md §7) — no custom in-app memory sampler is built, consistent with "reuse existing architecture" and avoiding a redundant mechanism.
  - **Acceptance Criteria**: Documented cross-reference present.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T106 [P] CPU monitoring — primary-platform-native, documented not built
  - **Priority**: Should-have
  - **User Story**: [US4]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Same reasoning as T105 for CPU usage — Vercel's own Active CPU pricing/observability already reports this; not duplicated in-app.
  - **Acceptance Criteria**: Documented cross-reference present.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T107 [P] Performance metrics — `response_time_ms`/`throughput_rps` trend view
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/app/api/ops/metrics/route.ts` (verify — covered by T095)
  - **Goal**: Confirm `response_time_ms` (T093) is queryable through `GET /api/ops/metrics` for dashboard trend charts (FR-017).
  - **Acceptance Criteria**: Samples recorded by real request traffic are retrievable.
  - **Verification**: Manual `curl` check after generating traffic
  - **Dependencies**: T093, T095

- [ ] T108 [P] Availability metrics — uptime derivation from `HealthCheck` history
  - **Priority**: Should-have
  - **User Story**: [US4]
  - **Files**: `src/server/repositories/healthRepository.ts` (modify — add `getUptimePercentage(component, from, to)`)
  - **Goal**: Compute a simple uptime percentage from the ratio of healthy to total `HealthCheck` rows in a window — supports the dashboard's availability display without a separate uptime-tracking mechanism.
  - **Acceptance Criteria**: Returns a `0–100` percentage; matches a manually-computed expectation in its unit test.
  - **Verification**: `npm run test`
  - **Dependencies**: T091

- [ ] T109 [P] Scheduled health-check cron entry
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `vercel.ts` (new — first use of this file, `crons` config only at this point)
  - **Goal**: Register `POST /api/ops/metrics/sample` on a fixed interval (e.g., every 5 minutes) via `vercel.ts`'s `crons` array (research.md §4/§7), the primary platform's recommended scheduling mechanism.
  - **Acceptance Criteria**: Scheduled invocation visible in the primary platform's cron log after deploy.
  - **Verification**: Manual post-deploy verification
  - **Dependencies**: T094

- [ ] T110 [P] Unit tests: alert threshold/false-positive rate
  - **Priority**: Should-have
  - **User Story**: [US4]
  - **Files**: `src/server/ops/__tests__/alertThresholds.test.ts` (new)
  - **Goal**: Confirm the threshold constants (T003) require a condition to persist rather than firing on a single noisy sample, targeting SC-007's <5% false-positive budget.
  - **Acceptance Criteria**: A single transient blip does not create a `SystemNotification`; a persisted breach does.
  - **Verification**: `npm run test`
  - **Dependencies**: T003, T098

- [ ] T111 [P] `opsService.ts` — status/diagnostics/metrics/notifications client methods
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/features/operations/services/opsService.ts` (new)
  - **Goal**: `getSystemStatus`, `getDiagnostics`, `listNotifications`, `acknowledgeNotification`, `queryMetrics` per contracts/client-api.md — thin `fetch` wrappers, no direct Route Handler/Prisma access.
  - **Acceptance Criteria**: Every function matches its documented request/response shape.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T054, T095, T099, T100, T102, T015

- [ ] T112 [P] `useSystemStatus`/`useDiagnostics`/`useNotifications`/`useAcknowledgeNotification`/`useMetrics` hooks
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/features/operations/hooks/useSystemStatus.ts` (new), `src/features/operations/hooks/useDiagnostics.ts` (new), `src/features/operations/hooks/useNotifications.ts` (new), `src/features/operations/hooks/useAcknowledgeNotification.ts` (new), `src/features/operations/hooks/useMetrics.ts` (new)
  - **Goal**: React Query wrappers per contracts/client-api.md — `useSystemStatus`'s `refetchInterval: 30_000`, `useAcknowledgeNotification`'s cache invalidation on success.
  - **Acceptance Criteria**: Hooks compile and invalidate the correct `opsKeys` query keys.
  - **Verification**: `npx tsc --noEmit`; hook test in Phase 13
  - **Dependencies**: T111, T015

- [ ] T113 [P] Service-layer unit tests for T111
  - **Priority**: Should-have
  - **User Story**: [US4]
  - **Files**: `src/features/operations/__tests__/opsService.test.ts` (new)
  - **Goal**: Mocked-`fetch` request-shaping tests for every function added in T111.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T111

- [ ] T114 [P] Integration test: monitoring end-to-end
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/features/operations/__tests__/monitoring.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US4 scenario (stop database → degraded status → notification created → restore → resolved).
  - **Acceptance Criteria**: Matches quickstart.md US4 exactly.
  - **Verification**: `npm run test`
  - **Dependencies**: T054, T098

- [ ] T115 Phase 5 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm monitoring is fully wired and the standard quality gates still pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy`
  - **Dependencies**: T091–T114

---

## Phase 6: Logging

**Purpose**: Application/API/database/security/audit log capture,
structured logging, centralized search, and retention (FR-019–FR-024,
US5).

- [ ] T116 Create `logRepository.ts`
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/server/repositories/logRepository.ts` (new)
  - **Goal**: `recordLogEntry`, `queryLogs` (cursor-paginated) exactly per contracts/repository-api.md — the **only** function permitted to write `LogEntry`.
  - **Acceptance Criteria**: `recordLogEntry` rejects/strips any `context` key matching a documented secret-key denylist (defense-in-depth for FR-024) before insert.
  - **Verification**: `npx tsc --noEmit`; repository test in T120
  - **Dependencies**: T001

- [ ] T117 Wire `logger.persist()` to `logRepository.recordLogEntry`
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/shared/lib/logger.ts` (modify — implement the `persist()` body added as a shell in T009)
  - **Goal**: `logger.persist({ category, level, message, requestId, source, context })` calls `logRepository.recordLogEntry`, never throwing on its own failure (a logging failure must not break the request it's logging).
  - **Acceptance Criteria**: A `recordLogEntry` failure is caught internally and falls back to a stdout `console.error`, never propagating to the caller.
  - **Verification**: `npx tsc --noEmit`; unit test in T120
  - **Dependencies**: T009, T116

- [ ] T118 Call `logger.persist()` from `handleRouteError` for `error`-level entries
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/server/http/handleRouteError.ts` (modify — additive call alongside existing `logger.error`)
  - **Goal**: Every unhandled Route Handler error is both logged to stdout (existing, unchanged) and persisted to `LogEntry` (`category: APPLICATION`, `level: ERROR`) — FR-019.
  - **Acceptance Criteria**: Existing `handleRouteError` behavior (error-code mapping, response shape) is bit-for-bit unchanged; the only addition is the new log call.
  - **Verification**: `npx tsc --noEmit`; existing `handleRouteError` tests remain green; new assertion in T120
  - **Dependencies**: T117

- [ ] T119 [P] Log database-related events (`category: DATABASE`)
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/server/ops/healthChecker.ts` (modify — `checkDatabaseHealth` calls `logger.persist` on a database error, not on every successful check)
  - **Goal**: A database connectivity/query failure surfaced by the health checker is persisted as a `DATABASE`-category `LogEntry` correlated to the same timeline as application logs (FR-020).
  - **Acceptance Criteria**: Stopping the database and running a health check produces a `DATABASE`-category entry.
  - **Verification**: `npm run test`
  - **Dependencies**: T086, T117

- [ ] T120 [P] Repository + logger unit tests
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/server/repositories/__tests__/logRepository.test.ts` (new), `src/shared/lib/__tests__/logger.test.ts` (new)
  - **Goal**: Cover `recordLogEntry`'s secret-key stripping, `queryLogs`'s cursor pagination, `logger.persist`'s fail-safe fallback, and `handleRouteError`'s new persisted-log side effect.
  - **Acceptance Criteria**: All cases pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T116, T117, T118

- [ ] T121 Log security-relevant events from this feature's own endpoints (`category: SECURITY`)
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/app/api/ops/deployments/[deploymentId]/rollback/route.ts` (modify), `src/app/api/ops/maintenance/route.ts` (modify, added Phase 11 — cross-referenced here), `src/server/ops/assertIsOperator.ts` (modify — log on rejection)
  - **Goal**: An `assertIsOperator` rejection and a rollback execution are persisted as `SECURITY`-category `LogEntry` rows (FR-021) — this feature's own contribution to the security log category; `009`'s future sign-in/permission-denial events land in `SecurityAuditLog` per research.md §0, mirrored here only if `009` chooses to.
  - **Acceptance Criteria**: A non-operator's rejected `/api/ops/*` request produces a `SECURITY`-category entry.
  - **Verification**: `npm run test` (extends T120's suite)
  - **Dependencies**: T014, T117

- [ ] T122 [P] Log administrative actions from this feature's own endpoints (`category: AUDIT`)
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/app/api/ops/maintenance/route.ts` (modify, cross-referenced from Phase 11), `src/app/api/ops/backups/[backupJobId]/restore/route.ts` (modify, cross-referenced from Phase 7)
  - **Goal**: Maintenance-mode activation/deactivation and restore-intent requests are persisted as `AUDIT`-category `LogEntry` rows identifying the acting operator (FR-022), consistent with — not a replacement for — `009`'s planned platform-wide audit trail (research.md §0).
  - **Acceptance Criteria**: Each of the two actions produces an `AUDIT`-category entry with the operator's user id in `context`.
  - **Verification**: `npm run test` (extends T120's suite, finalized once Phases 7/11 land)
  - **Dependencies**: T117

- [ ] T123 Implement `GET /api/ops/logs`
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/app/api/ops/logs/route.ts` (new)
  - **Goal**: Operator-gated, `category`/`level`/`from`/`to`/`limit`-filtered, cursor-paginated read per contracts/api-contracts.md (FR-023).
  - **Acceptance Criteria**: A search across a time window spanning all four categories returns matching entries from one query (SC-008).
  - **Verification**: `npx tsc --noEmit`; API test in T124
  - **Dependencies**: T116, T014

- [ ] T124 [P] API tests for `/api/ops/logs`
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/app/api/ops/logs/__tests__/logs.api.test.ts` (new)
  - **Goal**: Cover category/level/time-range filtering and cursor pagination.
  - **Acceptance Criteria**: All cases pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T123

- [ ] T125 [P] Verify no secrets appear in `LogEntry.context` (structural audit)
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/server/repositories/__tests__/logRepository.test.ts` (modify — add explicit secret-denylist assertions)
  - **Goal**: A dedicated test asserting `recordLogEntry` strips `DATABASE_URL`/`CRON_SECRET`/token-shaped values if accidentally passed in `context` (FR-024, defense-in-depth beyond convention alone).
  - **Acceptance Criteria**: Passing a fixture object containing a fake secret-shaped key results in that key being absent from the persisted row.
  - **Verification**: `npm run test`
  - **Dependencies**: T116

- [ ] T126 Create `retentionRepository.ts`
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/server/repositories/retentionRepository.ts` (new)
  - **Goal**: `sweepExpired(now)` exactly per contracts/repository-api.md — six `deleteMany` calls per data-model.md's Retention Policies table.
  - **Acceptance Criteria**: Returns per-table deleted counts; only rows past their retention window are removed.
  - **Verification**: `npx tsc --noEmit`; repository test in T128
  - **Dependencies**: T001

- [ ] T127 Implement `POST /api/ops/retention/run-due` (scheduled)
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/app/api/ops/retention/run-due/route.ts` (new)
  - **Goal**: `CRON_SECRET`-authenticated endpoint calling `retentionRepository.sweepExpired(now)`, run daily via `vercel.ts` (T109's file, additive cron entry).
  - **Acceptance Criteria**: Returns per-table deleted counts per contracts/api-contracts.md.
  - **Verification**: `npx tsc --noEmit`; API test in T128
  - **Dependencies**: T126

- [ ] T128 [P] Repository + API tests for retention sweep
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/server/repositories/__tests__/retentionRepository.test.ts` (new), `src/app/api/ops/retention/__tests__/runDue.api.test.ts` (new)
  - **Goal**: Seed rows on both sides of each table's retention boundary; confirm only expired rows are removed (FR-028's `BackupHistory` case included).
  - **Acceptance Criteria**: All six tables' sweep logic independently verified.
  - **Verification**: `npm run test`
  - **Dependencies**: T126, T127

- [ ] T129 [P] Add retention sweep to `vercel.ts` cron config
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `vercel.ts` (modify — additive cron entry)
  - **Goal**: Daily schedule for `POST /api/ops/retention/run-due`.
  - **Acceptance Criteria**: Visible in the primary platform's cron log post-deploy.
  - **Verification**: Manual post-deploy verification
  - **Dependencies**: T109, T127

- [ ] T130 [P] "Watch the watcher" — retention/health-cron self-monitoring
  - **Priority**: Should-have
  - **User Story**: [US5]
  - **Files**: `src/server/ops/healthChecker.ts` (modify — add a check comparing `BackupJob`/retention `lastRunAt` against its expected interval)
  - **Goal**: If the retention sweep or scheduled health check hasn't run successfully within its expected interval, create a `SystemNotification` (spec Edge Cases: "who watches the watcher").
  - **Acceptance Criteria**: A simulated missed run (manually backdated `lastRunAt`) produces a notification.
  - **Verification**: `npm run test`
  - **Dependencies**: T098, T127

- [ ] T131 [P] `queryLogs` client wiring — `opsService.ts`/`useLogs`
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/features/operations/services/opsService.ts` (modify — add `queryLogs`), `src/features/operations/hooks/useLogs.ts` (new — `useInfiniteQuery`)
  - **Goal**: Cursor-paginated client access to `GET /api/ops/logs` per contracts/client-api.md.
  - **Acceptance Criteria**: `useLogs` correctly threads `nextCursor` across pages.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T123, T111

- [ ] T132 [P] Service-layer unit tests for T131
  - **Priority**: Should-have
  - **User Story**: [US5]
  - **Files**: `src/features/operations/__tests__/opsService.test.ts` (modify — add `queryLogs` cases)
  - **Goal**: Mocked-`fetch` pagination-shaping tests.
  - **Acceptance Criteria**: Pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T131

- [ ] T133 [P] Document the `LogEntry`/`SecurityAuditLog` relationship
  - **Priority**: Should-have
  - **User Story**: [US5]
  - **Files**: `docs/deployment.md` (modify — additive, cross-references research.md §0/§8)
  - **Goal**: A short operator-facing note explaining that `LogEntry` (this feature) and `009`'s `SecurityAuditLog` (once shipped) are complementary, not duplicate, so a future reader querying `/api/ops/logs` for a security investigation knows to also check the admin audit log once it exists.
  - **Acceptance Criteria**: Note present and accurate.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T134 [P] Structured-logging convention verification across new Route Handlers
  - **Priority**: Should-have
  - **User Story**: [US5]
  - **Files**: N/A (verification task across all `src/app/api/ops/**/route.ts` files added by Phases 3–11)
  - **Goal**: Confirm every new Route Handler calls `logger.request()` (existing convention) exactly as `src/app/api/projects/route.ts` already does — no new endpoint skips structured request logging.
  - **Acceptance Criteria**: Manual/lint-assisted review finds zero new Route Handler missing the call.
  - **Verification**: Manual code review
  - **Dependencies**: All Phase 3–11 Route Handler tasks

- [ ] T135 [P] Log-rotation equivalence — primary-platform-native, documented not built
  - **Priority**: Should-have
  - **User Story**: [US5]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document that stdout/stderr log rotation is the primary platform's responsibility (its log stream has its own retention independent of `LogEntry`'s in-database 90-day window) — no custom log-rotation code is written.
  - **Acceptance Criteria**: Documented cross-reference present.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T136 [P] Accessibility: `LogExplorer` data-contract readiness (UI built in Phase 13)
  - **Priority**: Could-have
  - **User Story**: [US5]
  - **Files**: `src/features/operations/types/operations.types.ts` (verify `LogEntrySummary` type is screen-reader-friendly-shaped — plain strings, no encoded severity-only-by-color assumption)
  - **Goal**: Confirm the `LogEntry` response shape carries a textual `level`/`category` (not just a color code) so Phase 13's `LogExplorer` can satisfy WCAG 2.2 AA without a redesign later.
  - **Acceptance Criteria**: Type review confirms textual fields present.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [ ] T137 [P] Integration test: logging end-to-end
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/features/operations/__tests__/logging.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US5 scenario — trigger one event per category, confirm all four are retrievable from one `GET /api/ops/logs` query.
  - **Acceptance Criteria**: Matches quickstart.md US5 (SC-008).
  - **Verification**: `npm run test`
  - **Dependencies**: T118, T119, T121, T122, T123

- [ ] T138 [P] Verify `logger.debug/info/warn/error/request` call sites unaffected
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: N/A (regression verification across the existing codebase)
  - **Goal**: Confirm every pre-existing call site of `logger.*` (e.g., `src/features/search/api/rateLimiter.ts`, every existing Route Handler) compiles and behaves identically after T009/T117's additive changes.
  - **Acceptance Criteria**: Full existing test suite remains green with zero modification to any pre-existing test file.
  - **Verification**: `npm run test`
  - **Dependencies**: T117

- [ ] T139 [P] Performance check: `LogEntry` write path under load
  - **Priority**: Should-have
  - **User Story**: [US5]
  - **Files**: `src/server/repositories/__tests__/logRepository.test.ts` (modify — add a burst-write timing assertion)
  - **Goal**: Confirm a burst of concurrent `recordLogEntry` calls (simulating a spike of errors) does not exceed a documented latency budget, avoiding write-amplification concerns raised in plan.md Performance.
  - **Acceptance Criteria**: Burst of 100 concurrent writes completes within a documented bound (e.g., under 2 seconds against the test database).
  - **Verification**: `npm run test`
  - **Dependencies**: T116

- [ ] T140 Phase 6 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm logging/centralization/retention is fully wired and the standard quality gates still pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy`
  - **Dependencies**: T116–T139

---

## Phase 7: Backup & Recovery

**Purpose**: Infrastructure-level scheduled database backups, restore
workflow, backup verification, retention policy enforcement, and disaster
recovery (FR-025–FR-029a, US6). Distinct from `009`'s per-project
application-level `Backup` (research.md §0).

- [ ] T141 Create `opsBackupRepository.ts`
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/server/repositories/opsBackupRepository.ts` (new)
  - **Goal**: `listBackupJobs`, `getDueBackupJobs`, `recordBackupRun`, `listBackupHistory`, `sweepExpiredBackups` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: `recordBackupRun` computes `BackupHistory.expiresAt` as `startedAt + backupJob.retentionDays` at creation time (data-model.md).
  - **Verification**: `npx tsc --noEmit`; repository test in T146
  - **Dependencies**: T001

- [ ] T142 Seed default `BackupJob` rows per environment
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `prisma/seed.ts` (modify — additive)
  - **Goal**: One `BackupJob` row per environment (`scheduleCron: "0 * * * *"`, `retentionDays: 30`, per spec Assumptions default), added alongside the existing seed logic without altering any current seeded row.
  - **Acceptance Criteria**: `npx tsx prisma/seed.ts` creates exactly one new `BackupJob` per environment, idempotently (safe to re-run).
  - **Verification**: `npx tsx prisma/seed.ts`
  - **Dependencies**: T141

- [ ] T143 Implement `POST /api/ops/backups/run-due` (scheduled)
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/run-due/route.ts` (new)
  - **Goal**: `CRON_SECRET`-authenticated endpoint calling `getDueBackupJobs(now)`, triggering the managed database provider's native backup/PITR API for each (research.md §17), and recording each result via `recordBackupRun` (FR-025, FR-026).
  - **Acceptance Criteria**: Returns `{ "triggered": <n> }`; a `BackupHistory` row is created for every due job.
  - **Verification**: `npx tsc --noEmit`; API test in T146
  - **Dependencies**: T141

- [ ] T144 [P] Implement `GET /api/ops/backups` and `GET /api/ops/backups/:backupJobId/history`
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/route.ts` (new), `src/app/api/ops/backups/[backupJobId]/history/route.ts` (new)
  - **Goal**: Operator-gated reads per contracts/api-contracts.md (FR-025–FR-028, SC-009, SC-010).
  - **Acceptance Criteria**: Response shapes match documented contract exactly.
  - **Verification**: `npx tsc --noEmit`; API test in T146
  - **Dependencies**: T141, T014

- [ ] T145 Implement `POST /api/ops/backups/:backupJobId/restore`
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/[backupJobId]/restore/route.ts` (new)
  - **Goal**: Operator-gated, requires `{ backupHistoryId, confirm: true }`; records restore intent/audit trail (`logger.persist`, `category: AUDIT`, T122) and returns `202` — actual infrastructure-level restore is the documented runbook (research.md §17), not a synchronous in-process action (FR-027).
  - **Acceptance Criteria**: A request without `confirm: true` is rejected with `INVALID_INPUT`; a confirmed request returns `202` and logs an audit entry.
  - **Verification**: `npx tsc --noEmit`; API test in T146
  - **Dependencies**: T141, T122, T014

- [ ] T146 [P] Repository + API tests for backup endpoints
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/server/repositories/__tests__/opsBackupRepository.test.ts` (new), `src/app/api/ops/backups/__tests__/backups.api.test.ts` (new)
  - **Goal**: Cover all five repository functions and all four endpoints' success/validation/auth paths, including the unconfirmed-restore rejection.
  - **Acceptance Criteria**: All cases pass against the real ephemeral PostGIS test database.
  - **Verification**: `npm run test`
  - **Dependencies**: T141, T143, T144, T145

- [ ] T147 [P] Backup verification — checksum recording
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/run-due/route.ts` (modify)
  - **Goal**: Record the managed provider's returned checksum/identifier in `BackupHistory.checksum`, giving each backup a verifiable identity beyond just "it ran" (FR-025's implicit reliability requirement).
  - **Acceptance Criteria**: `BackupHistory.checksum` is non-null for every `SUCCEEDED` run.
  - **Verification**: `npm run test` (extends T146's suite)
  - **Dependencies**: T143

- [ ] T148 Add backup scheduling to `vercel.ts` cron config
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `vercel.ts` (modify — additive cron entry)
  - **Goal**: Hourly schedule for `POST /api/ops/backups/run-due`, matching `BackupJob.scheduleCron`'s seeded default (T142).
  - **Acceptance Criteria**: Visible in the primary platform's cron log post-deploy; `BackupJob.lastRunAt`/`nextRunAt` update after each run.
  - **Verification**: Manual post-deploy verification
  - **Dependencies**: T109, T143

- [ ] T149 [P] Retention policy enforcement for backups
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/server/repositories/retentionRepository.ts` (verify — `BackupHistory` sweep already covered by Phase 6's T126; cross-reference only, no new file)
  - **Goal**: Confirm the daily retention sweep (T127) removes `BackupHistory` rows past `expiresAt`, satisfying FR-028/SC-010 without a second, backup-specific sweep job.
  - **Acceptance Criteria**: A manually-backdated `BackupHistory.expiresAt` row is removed by the next sweep run.
  - **Verification**: `npm run test` (extends T128's suite)
  - **Dependencies**: T126, T141

- [ ] T150 Document the disaster-recovery runbook
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (modify — additive "Disaster Recovery Runbook" section)
  - **Goal**: Step-by-step operator procedure for a Production restore using the managed provider's point-in-time-restore capability, referencing `POST /api/ops/backups/:backupJobId/restore` (T145) as the audit-trail-recording first step, targeting RTO 4h / RPO 1h (spec FR-029a).
  - **Acceptance Criteria**: A new operator can follow the runbook to completion; explicitly states the RTO/RPO targets and how the managed provider's PITR grain satisfies them (research.md §17).
  - **Verification**: Manual review
  - **Dependencies**: T145

- [ ] T151 [P] Disaster-recovery runbook dry-run test
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (verify against a real Staging restore, not a new file)
  - **Goal**: Execute the T150 runbook once against Staging (not Production) to confirm every step is accurate and timing stays within the documented RTO budget.
  - **Acceptance Criteria**: Dry run completes; any runbook inaccuracies found are corrected in T150's document.
  - **Verification**: Manual Staging dry-run, timed
  - **Dependencies**: T150

- [ ] T152 [P] `opsService.ts`/hooks — backup management client wiring
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/features/operations/services/opsService.ts` (modify — add `listBackupJobs`/`listBackupHistory`/`requestRestore`), `src/features/operations/hooks/useBackupJobs.ts` (new), `src/features/operations/hooks/useBackupHistory.ts` (new), `src/features/operations/hooks/useRequestRestore.ts` (new)
  - **Goal**: Client access per contracts/client-api.md; `useRequestRestore` is a `useMutation` requiring explicit confirmation before firing.
  - **Acceptance Criteria**: Hooks compile and match documented shapes.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T144, T145, T111

- [ ] T153 [P] Service-layer unit tests for T152
  - **Priority**: Should-have
  - **User Story**: [US6]
  - **Files**: `src/features/operations/__tests__/opsService.test.ts` (modify — add backup-related cases)
  - **Goal**: Mocked-`fetch` request-shaping tests.
  - **Acceptance Criteria**: Pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T152

- [ ] T154 [P] Configuration backup — documented scope note
  - **Priority**: Should-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document that "configuration backup" for this platform means the environment-variable/secrets provisioning documented in T080, not a separate config-snapshot mechanism — application configuration lives in the primary platform's own versioned project settings, already durable.
  - **Acceptance Criteria**: Documented note present, cross-referencing T080.
  - **Verification**: Manual review
  - **Dependencies**: T080

- [ ] T155 [P] Project-level backup cross-reference (009 boundary note)
  - **Priority**: Should-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (modify — additive, cross-references research.md §0)
  - **Goal**: A clear operator-facing note distinguishing this phase's infrastructure-level backups from `009`'s future per-project export/reimport feature, so operators know which to use for which recovery scenario.
  - **Acceptance Criteria**: Note present and accurate.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T156 [P] Recovery testing — automated restore-path smoke test
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/features/operations/__tests__/backupRecovery.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US6 scenario — trigger `run-due`, confirm `BackupHistory` created with correct `expiresAt`; backdate a test row and confirm the retention sweep removes it.
  - **Acceptance Criteria**: Matches quickstart.md US6 (SC-009, SC-010).
  - **Verification**: `npm run test`
  - **Dependencies**: T143, T149

- [ ] T157 [P] Backup failure handling — `errorMessage` capture
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/run-due/route.ts` (modify)
  - **Goal**: A failed provider API call records `BackupHistory.status: FAILED` with `errorMessage` populated rather than silently dropping the failure, and triggers a `SystemNotification` (`type: "backup_failed"`, reusing T097).
  - **Acceptance Criteria**: A simulated provider-API failure produces a `FAILED` row and a notification.
  - **Verification**: `npm run test` (extends T146's suite)
  - **Dependencies**: T143, T097

- [ ] T158 [P] Edge case: backup window overlapping high load
  - **Priority**: Should-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (modify — additive note, spec Edge Cases)
  - **Goal**: Document that because backups are triggered via the managed provider's own snapshot/PITR mechanism (not an in-application `pg_dump`), a backup window does not compete with application database connections — resolving this spec Edge Case by architecture, not application code.
  - **Acceptance Criteria**: Note present and accurate per research.md §17.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T159 [P] Edge case: restore targeting an already-removed backup
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/[backupJobId]/restore/route.ts` (modify)
  - **Goal**: A restore request citing a `backupHistoryId` that no longer exists (removed by retention) returns a clear `NOT_FOUND`, not a generic error (spec Edge Cases).
  - **Acceptance Criteria**: Test case covers this explicitly.
  - **Verification**: `npm run test` (extends T146's suite)
  - **Dependencies**: T145

- [ ] T160 [P] Alternative-target backup documentation (Docker/self-hosted `pg_dump` fallback)
  - **Priority**: Should-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (modify — additive, cross-references research.md §17's fallback approach)
  - **Goal**: Document the `pg_dump`-to-object-storage fallback approach for the documented Docker/self-hosted alternative targets (Phase 12), using the same `BackupJob`/`BackupHistory` tables and scheduled-endpoint pattern.
  - **Acceptance Criteria**: Documented, no code required for this feature's primary-platform scope.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T161 [P] Backup size/duration performance check
  - **Priority**: Could-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/__tests__/backups.api.test.ts` (modify — add a timing assertion against a seeded moderate-size test dataset)
  - **Goal**: Confirm `run-due`'s per-job execution time stays within a documented bound at the data volumes this spec's Assumptions describe.
  - **Acceptance Criteria**: Assertion passes against the test dataset.
  - **Verification**: `npm run test`
  - **Dependencies**: T143

- [ ] T162 [P] `BackupJob` CRUD note — read-only this phase
  - **Priority**: Could-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document that `BackupJob` rows are seed-managed (T142) this phase, not editable via API — an operator wanting a different schedule edits the seed/database directly; a future feature can add a management UI if needed (explicitly not scope creep here).
  - **Acceptance Criteria**: Documented scope boundary present.
  - **Verification**: Manual review
  - **Dependencies**: T142

- [ ] T163 [P] Accessibility: `BackupManagementPanel` data-contract readiness (UI built in Phase 13)
  - **Priority**: Could-have
  - **User Story**: [US6]
  - **Files**: `src/features/operations/types/operations.types.ts` (verify `BackupHistoryEntry`/`BackupJobSummary` types are screen-reader-friendly-shaped)
  - **Goal**: Same reasoning as T136, applied to backup types.
  - **Acceptance Criteria**: Type review confirms textual status fields present.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [ ] T164 [P] Integration test: full US6 quickstart walkthrough
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/features/operations/__tests__/backupRecovery.integration.test.ts` (verify — extends T156, no new file)
  - **Goal**: Confirm T156's test covers every quickstart.md US6 step end-to-end, including the restore-intent-recording path (T145).
  - **Acceptance Criteria**: Full scenario passes in one test run.
  - **Verification**: `npm run test`
  - **Dependencies**: T156, T145

- [ ] T165 Phase 7 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm backup/DR is fully wired and the standard quality gates still pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy`
  - **Dependencies**: T141–T164

---

## Phase 8: Performance Optimization

**Purpose**: Bundle optimization, code splitting/lazy loading, compression,
caching, Redis integration, connection pooling, database optimization,
image optimization, and performance benchmarking (FR-030–FR-034, US7).

- [ ] T166 Bundle-analyzer pass confirming `@upstash/redis` is server-only
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: N/A (verification task using existing `@next/bundle-analyzer` wiring)
  - **Goal**: Run `ANALYZE=true npm run build` and confirm `@upstash/redis` contributes zero bytes to any client bundle (Constitution Principle V, plan.md Quality Gates).
  - **Acceptance Criteria**: Bundle report shows no `@upstash/redis` module in any client chunk.
  - **Verification**: `ANALYZE=true npm run build`
  - **Dependencies**: T018, T011

- [ ] T167 [P] Lazy-load `src/features/operations/components/MetricsChart.tsx`
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `src/features/operations/components/MetricsChart.tsx` (new, built in Phase 13 — this task specifically wires its `next/dynamic({ ssr: false })` import per Constitution Principle V)
  - **Goal**: Ensure the charting component (heavy, Recharts-based) is dynamically imported at its point of use, not part of the initial `/operations` route bundle.
  - **Acceptance Criteria**: `MetricsChart` does not appear in the `/operations` page's initial JS chunk in the bundle report.
  - **Verification**: `ANALYZE=true npm run build`
  - **Dependencies**: T166

- [ ] T168 [P] Response caching for `GET /api/ops/metrics` and `GET /api/ops/diagnostics`
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `src/app/api/ops/metrics/route.ts` (modify), `src/app/api/ops/diagnostics/route.ts` (modify)
  - **Goal**: Wrap the repeatable, short-TTL reads with `cache.ts`'s (T010) `get`/`set` wrapper (a short TTL, e.g. 15–30s) so repeated dashboard polling doesn't re-query the database every 30 seconds per operator (FR-030).
  - **Acceptance Criteria**: A second request within the TTL window is measurably faster and does not re-hit the database (verified via a query-count assertion in its test).
  - **Verification**: `npm run test`
  - **Dependencies**: T010, T095, T102

- [ ] T169 [P] Cache invalidation on mutation
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `src/app/api/ops/maintenance/route.ts` (modify, cross-referenced from Phase 11), `src/app/api/ops/deployments/[deploymentId]/rollback/route.ts` (modify)
  - **Goal**: Every mutation that changes data a cached read (T168) reflects calls `cache.ts`'s `invalidate` for the affected key, ensuring cached diagnostics never serve stale post-mutation data past its intended freshness window (FR-030's explicit "without serving stale data" requirement).
  - **Acceptance Criteria**: A rollback immediately followed by a diagnostics read reflects the new deployment state, not a cached pre-rollback one.
  - **Verification**: `npm run test`
  - **Dependencies**: T168, T059

- [ ] T170 Verify compression is platform-native (no application code)
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `docs/deployment.md` (modify — additive, cross-references research.md §19)
  - **Goal**: Document and verify that gzip/Brotli compression is applied automatically by the primary platform to every response — confirm via response headers, add no custom compression middleware (FR-031).
  - **Acceptance Criteria**: `curl -I -H "Accept-Encoding: gzip"` against a deployed preview shows `Content-Encoding: gzip` (or `br`).
  - **Verification**: `curl -I -H "Accept-Encoding: gzip" <preview-url>`
  - **Dependencies**: None

- [ ] T171 [P] Image/media optimization audit for new UI (Phase 13 dependency)
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/features/operations/components/` (verify, once built in Phase 13 — no new file here, a cross-phase check)
  - **Goal**: Confirm no new operations UI component introduces an unoptimized `<img>` where Next.js's `<Image>` (or an SVG icon from the existing `lucide-react` set already in use) would apply — this feature's own UI is icon/chart-heavy, not photo-heavy, so this is primarily a "confirm nothing regresses" check (FR-032).
  - **Acceptance Criteria**: Zero raw `<img>` tags introduced by `src/features/operations/`.
  - **Verification**: Manual code review after Phase 13
  - **Dependencies**: None (finalized after Phase 13)

- [ ] T172 [P] Route-level code splitting verification for `/operations`
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `src/app/operations/page.tsx` (verify, built in Phase 13)
  - **Goal**: Confirm `/operations` ships its own JS chunk, not bundled into the shared app-shell chunk, so users who never visit it pay zero cost (FR-033).
  - **Acceptance Criteria**: Bundle report shows a distinct `/operations` chunk.
  - **Verification**: `ANALYZE=true npm run build`
  - **Dependencies**: T166 (finalized after Phase 13)

- [ ] T173 Configure pooled `DATABASE_URL` + direct `DIRECT_URL` in Prisma datasource
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `prisma/schema.prisma` (modify — add `directUrl = env("DIRECT_URL")` to the `datasource` block), `prisma.config.ts` (verify — no change needed, already reads `DATABASE_URL` via `env()`)
  - **Goal**: Runtime Route Handlers use Supabase's pooled connection string; `prisma migrate deploy` uses the direct connection string (research.md §16) — additive `datasource` config, no repository query code changes (FR-038).
  - **Acceptance Criteria**: `npx prisma validate` passes with both URLs configured; `prisma migrate deploy` succeeds using `DIRECT_URL`.
  - **Verification**: `npx prisma validate`; `npx prisma migrate deploy`
  - **Dependencies**: T007, T019

- [ ] T174 [P] Connection-pool concurrency smoke test
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `src/features/operations/__tests__/connectionPooling.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US8 concurrency check (50 concurrent `/api/system/status` requests) confirming all succeed and `db_connection_count` stays within the pool's configured max.
  - **Acceptance Criteria**: Matches quickstart.md's expected behavior.
  - **Verification**: `npm run test`
  - **Dependencies**: T173, T054, T094

- [ ] T175 [P] Verify existing GiST spatial indexes remain untouched
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `prisma/schema.prisma` (verify — no change to `Feature.geometry` or any existing index)
  - **Goal**: Confirm T001's additive migration introduces zero changes to any existing spatial index (Constitution Principle III) — this feature adds no new geometry column and no new spatial query path.
  - **Acceptance Criteria**: `git diff` on `prisma/schema.prisma` shows only additions, zero modified lines within any pre-existing model.
  - **Verification**: `git diff prisma/schema.prisma`
  - **Dependencies**: T001

- [ ] T176 [P] Add B-tree indexes for new time-series query patterns (verify)
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `prisma/schema.prisma` (verify — indexes already declared in T001 per data-model.md)
  - **Goal**: Confirm every new model's `@@index` matches its actual query pattern (`[component, checkedAt]`, `[metricName, recordedAt]`, `[category, occurredAt]`, `[backupJobId, startedAt]`, `[expiresAt]`) — a review task, not new schema work.
  - **Acceptance Criteria**: Every repository query in Phases 5–7 is covered by an index (no query requires a full-table scan).
  - **Verification**: `EXPLAIN ANALYZE` spot-check on `queryLogs`/`queryMetrics` against a seeded test dataset
  - **Dependencies**: T001, T092, T116

- [ ] T177 [P] Database optimization documentation
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document the connection-pooling setup (T173) and index strategy (T176) for future operators (FR-034, SC-013).
  - **Acceptance Criteria**: Section present, accurate.
  - **Verification**: Manual review
  - **Dependencies**: T173, T176

- [ ] T178 [P] Performance benchmarking script — response time baseline
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `scripts/deploy/benchmark.ps1` (new)
  - **Goal**: A repeatable script issuing a fixed batch of requests against a target URL and reporting p50/p95/p99 response times, usable against Staging before/after this feature's changes (SC-011).
  - **Acceptance Criteria**: Script runs and produces a report.
  - **Verification**: `pwsh scripts/deploy/benchmark.ps1 -Url http://localhost:3000`
  - **Dependencies**: None

- [ ] T179 [P] Cache-hit verification test
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `src/app/api/ops/metrics/__tests__/metrics.api.test.ts` (modify — add cache-hit timing/call-count assertion)
  - **Goal**: A repeated request for unchanged data is measurably faster and results in fewer database calls than the first (SC-011).
  - **Acceptance Criteria**: Assertion passes.
  - **Verification**: `npm run test`
  - **Dependencies**: T168

- [ ] T180 [P] Verify CDN delivery for static assets — platform-native
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: N/A (verification task)
  - **Goal**: Confirm `_next/static` assets are served with edge-cache headers by the primary platform without any custom configuration (FR-040, research.md §19).
  - **Acceptance Criteria**: `curl -I` against a static asset on a deployed preview shows the platform's cache/CDN response headers.
  - **Verification**: `curl -I <preview-url>/_next/static/...`
  - **Dependencies**: None

- [ ] T181 [P] Bundle-size regression guard for the new `operations` module
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `docs/deployment.md` (modify — additive, records the T032/T178-style baseline for the client bundle)
  - **Goal**: Record the `/operations` route's initial JS chunk size as a baseline (Constitution Principle V's "run bundle-analyzer before merging a PR adding >20KB gzipped dependency" — this task documents the one-time baseline for future comparison).
  - **Acceptance Criteria**: Baseline recorded.
  - **Verification**: `ANALYZE=true npm run build`
  - **Dependencies**: T166, T172

- [ ] T182 [P] Verify React Query cache configuration for operations hooks
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/features/operations/hooks/*.ts` (verify — `staleTime`/`refetchInterval` set deliberately per contracts/client-api.md, not left at React Query defaults)
  - **Goal**: Confirm every read hook's caching configuration matches its documented refresh cadence (`useSystemStatus` 30s, `useMaintenanceStatus` 15s, others default) — avoids both over-fetching and stale-dashboard complaints.
  - **Acceptance Criteria**: Code review confirms explicit `refetchInterval`/`staleTime` on every polling hook.
  - **Verification**: Manual code review
  - **Dependencies**: T112

- [ ] T183 [P] Memoize expensive dashboard computations
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/features/operations/components/MetricsChart.tsx` (built Phase 13 — this task specifically adds `useMemo` around chart-data transformation)
  - **Goal**: Avoid recomputing chart series on every render when underlying data hasn't changed (Constitution Principle V).
  - **Acceptance Criteria**: Chart-data transform is wrapped in `useMemo` keyed on the raw metric samples.
  - **Verification**: Manual code review
  - **Dependencies**: None (finalized after Phase 13)

- [ ] T184 [P] Verify Zustand selector narrowness in `operationsStore`
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/features/operations/store/operationsStore.ts` (verify)
  - **Goal**: Confirm every component consuming `operationsStore` selects only the specific slice it renders, not the whole store object (Constitution Principle V).
  - **Acceptance Criteria**: Code review confirms narrow selectors throughout.
  - **Verification**: Manual code review
  - **Dependencies**: T017

- [ ] T185 [P] Performance test: `LogEntry`/`SystemMetric` query latency at scale
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/server/repositories/__tests__/logRepository.test.ts` (modify — add a seeded-large-table timing assertion), `src/server/repositories/__tests__/metricRepository.test.ts` (modify — same)
  - **Goal**: Seed several thousand rows and confirm `queryLogs`/`queryMetrics` stay within a documented latency bound, validating the indexes from T176 at realistic scale.
  - **Acceptance Criteria**: Assertions pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T176

- [ ] T186 [P] Verify no N+1 query pattern in deployment/backup list endpoints
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/server/repositories/deploymentRepository.ts` (verify — `listDeployments` uses Prisma's `include` for `releaseVersion`, not a per-row follow-up query)
  - **Goal**: Confirm `listDeployments`/`listBackupHistory` fetch their relations in one query.
  - **Acceptance Criteria**: Code review + query-count assertion in existing repository tests confirms a single query per list call.
  - **Verification**: `npm run test`
  - **Dependencies**: T056, T141

- [ ] T187 [P] Document performance optimization decisions
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `docs/deployment.md` (modify — additive "Performance Optimization" section)
  - **Goal**: Summarize caching (T168), connection pooling (T173), CDN/compression (T170/T180), and bundle-splitting (T167/T172) decisions for operators and future contributors (SC-020).
  - **Acceptance Criteria**: Section present, links to research.md for full rationale.
  - **Verification**: Manual review
  - **Dependencies**: T168, T170, T173, T180

- [ ] T188 [P] Lighthouse baseline for `/operations` (post Phase 13)
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: N/A (verification task)
  - **Goal**: Run Lighthouse against the deployed `/operations` route once Phase 13's UI lands, confirming a score consistent with Constitution Principle X's ≥90 Accessibility bar on any new route.
  - **Acceptance Criteria**: Score ≥90 Accessibility.
  - **Verification**: Lighthouse CLI/DevTools run against a preview deployment
  - **Dependencies**: None (finalized after Phase 13)

- [ ] T189 [P] Verify `next.config.ts`'s existing headers/CSP unaffected
  - **Priority**: Must-have
  - **User Story**: [US7]
  - **Files**: `next.config.ts` (verify — only the T022 `output` field added)
  - **Goal**: Confirm the security-headers `curl -I` check from `docs/deployment.md` still passes byte-for-byte after this feature's changes (research.md §11).
  - **Acceptance Criteria**: Header values identical to pre-feature baseline.
  - **Verification**: `curl -I` diff against `docs/deployment.md`'s documented values
  - **Dependencies**: T022

- [ ] T190 [P] Verify test suite execution time unaffected
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: N/A (verification task)
  - **Goal**: Confirm the new test files added across Phases 1–8 don't meaningfully regress `npm run test`'s total execution time (a proxy for overall codebase health, not a spec requirement, but good practice given the scale of this feature).
  - **Acceptance Criteria**: Total suite time documented as a baseline.
  - **Verification**: `npm run test` (timed)
  - **Dependencies**: All prior test tasks

- [ ] T191 [P] Compression/caching integration test
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/features/operations/__tests__/performance.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US7 scenario (build succeeds, bundle analyzer clean, repeat-request caching header present).
  - **Acceptance Criteria**: Matches quickstart.md US7.
  - **Verification**: `npm run test`
  - **Dependencies**: T166, T168

- [ ] T192 [P] Document image optimization posture for map/media-heavy routes (unchanged)
  - **Priority**: Could-have
  - **User Story**: [US7]
  - **Files**: `docs/deployment.md` (modify — additive cross-reference)
  - **Goal**: Confirm and document that existing map/media rendering (Leaflet tiles, existing `next/image` usage elsewhere in the app) is unmodified by this feature — no redesign of prior features' image handling (FR-051).
  - **Acceptance Criteria**: Note present.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T193 [P] Verify `ANALYZE=true` build remains a documented, optional dev-time flag
  - **Priority**: Could-have
  - **User Story**: [US7]
  - **Files**: `next.config.ts` (verify — existing `bundleAnalyzer` wiring, T022's `output` addition composes cleanly with it)
  - **Goal**: Confirm `ANALYZE=true npm run build` still works after T022's `output: "standalone"` addition.
  - **Acceptance Criteria**: Command succeeds and opens/produces the bundle report.
  - **Verification**: `ANALYZE=true npm run build`
  - **Dependencies**: T022

- [ ] T194 [P] Performance regression test for Route Handler timing helper
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: `src/server/ops/__tests__/requestMetrics.test.ts` (new)
  - **Goal**: Confirm `recordRequestMetric` (T093) itself adds negligible overhead to the request path it instruments.
  - **Acceptance Criteria**: Overhead documented as within an acceptable bound (e.g., sub-millisecond).
  - **Verification**: `npm run test`
  - **Dependencies**: T093

- [ ] T195 Phase 8 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm performance optimization work is complete and the standard + performance-specific quality gates pass.
  - **Acceptance Criteria**: All commands below exit 0; bundle analysis and Lighthouse checks reviewed.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && ANALYZE=true npm run build`
  - **Dependencies**: T166–T194

---

## Phase 9: Scalability

**Purpose**: Horizontal scaling, load balancing, auto-scaling, connection
management, CDN integration, high availability, and stress testing
(FR-035–FR-040, US8).

- [ ] T196 Verify Fluid Compute auto-scaling on the primary platform
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive "Scalability" section)
  - **Goal**: Document that horizontal capacity, function-instance reuse, and auto-scale-down are inherited from the primary platform's Fluid Compute model (research.md §13/§18) — no custom autoscaling controller is built (FR-035, FR-037).
  - **Acceptance Criteria**: Section documents the mechanism and references the alternative-target equivalents (Railway/AWS/Azure/GCP autoscaling, Phase 12).
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T197 [P] Verify platform-native load distribution
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive, same section as T196)
  - **Goal**: Document that request distribution across function instances is the primary platform's responsibility, satisfying FR-036 without application code.
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: T196

- [ ] T198 Load test against a Staging preview deployment
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `scripts/deploy/benchmark.ps1` (verify/extend — reused from T178, add a sustained-load mode)
  - **Goal**: Automated version of quickstart.md's US8 scenario — generate a sustained load increase and confirm capacity comes online automatically with no dropped requests, then confirm scale-down after load subsides (SC-012, SC-014).
  - **Acceptance Criteria**: p95 latency stays within budget throughout; zero dropped requests recorded.
  - **Verification**: `pwsh scripts/deploy/benchmark.ps1 -Url <staging-url> -SustainedLoad`
  - **Dependencies**: T178

- [ ] T199 [P] Verify Redis-backed rate limiter under multi-instance load
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `src/server/security/__tests__/rateLimiter.test.ts` (modify — add a simulated-multi-instance test using two independent `RateLimiter` instances sharing the same Redis backend)
  - **Goal**: Confirm the Redis-backed mode (T011) enforces a shared limit correctly across two independent in-process limiter instances (simulating two Vercel function instances) — closing the exact gap `009`'s Risks section flagged for the in-memory-only mode.
  - **Acceptance Criteria**: Two instances sharing a bucket correctly see each other's counts.
  - **Verification**: `npm run test`
  - **Dependencies**: T011

- [ ] T200 [P] Connection-pool sizing documentation
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive, cross-references T173/T177)
  - **Goal**: Document Supabase's pooled-connection sizing relative to the primary platform's expected concurrent function-instance count, satisfying FR-038 at the "thousands of concurrent users" order-of-magnitude target (spec Assumptions).
  - **Acceptance Criteria**: Documented with concrete numbers appropriate to the managed provider's plan tier.
  - **Verification**: Manual review
  - **Dependencies**: T173

- [ ] T201 [P] Shared-cache verification for FR-039
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `src/server/cache/__tests__/cache.test.ts` (new)
  - **Goal**: Confirm `cache.ts` (T010) is genuinely shared across "instances" by writing from one client instantiation and reading from a second independent one against the same Redis backend.
  - **Acceptance Criteria**: Cross-instance read after write succeeds.
  - **Verification**: `npm run test`
  - **Dependencies**: T010

- [ ] T202 [P] CDN integration verification (reuse of T180)
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: N/A (cross-reference to T180, no new file)
  - **Goal**: Confirm FR-040 (geographically-distributed static/cacheable content delivery) is satisfied by the same platform-native CDN behavior already verified in T180 — no separate CDN integration task needed.
  - **Acceptance Criteria**: Cross-reference documented in `docs/deployment.md`'s Scalability section.
  - **Verification**: Manual review
  - **Dependencies**: T180, T196

- [ ] T203 High availability — multi-region documentation (primary platform native)
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document the primary platform's edge-network multi-region request routing and the managed database provider's availability posture (read replicas/failover, if enabled on the chosen plan tier) as the source of this feature's high-availability property.
  - **Acceptance Criteria**: Documented, no application code required.
  - **Verification**: Manual review
  - **Dependencies**: T196

- [ ] T204 [P] Stress test — sustained peak beyond auto-scale threshold
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `scripts/deploy/benchmark.ps1` (verify/extend — add a stress-mode exceeding the expected auto-scale ceiling)
  - **Goal**: Confirm behavior at/beyond the configured maximum capacity (spec Edge Cases: "auto-scaling reaches its configured maximum while demand is still increasing") — requests should degrade gracefully (queued/`429`), never crash the application.
  - **Acceptance Criteria**: No unhandled exceptions or crash under stress; graceful degradation observed and documented.
  - **Verification**: `pwsh scripts/deploy/benchmark.ps1 -Url <staging-url> -Stress`
  - **Dependencies**: T198

- [ ] T205 [P] DoS-vs-organic-peak distinction documentation
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive, spec Edge Cases)
  - **Goal**: Document how the rate limiter (T011/T199) plus the primary platform's own DDoS mitigation together address the "is this a DoS attempt or organic peak load" edge case — the per-user-bucket limiter catches abusive single actors, platform-level mitigation catches broader attack patterns (research.md §15).
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: T011

- [ ] T206 [P] In-flight request preservation during scale-down (spec Edge Cases)
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive, cross-references the primary platform's documented graceful-shutdown/request-cancellation behavior for Fluid Compute)
  - **Goal**: Document that a user's in-progress, unsaved edit is not abruptly terminated by an instance being scaled down, because Fluid Compute's graceful shutdown lets in-flight requests complete before an instance is reclaimed (spec Edge Cases).
  - **Acceptance Criteria**: Documented with the platform behavior cited accurately.
  - **Verification**: Manual review
  - **Dependencies**: T196

- [ ] T207 [P] `useMetrics`/`SystemStatusPanel` dashboard scale indicators (data contract)
  - **Priority**: Could-have
  - **User Story**: [US8]
  - **Files**: `src/features/operations/types/operations.types.ts` (verify `MetricSamplesResponse` supports a `throughput_rps` series for the future dashboard)
  - **Goal**: Confirm the metrics response shape supports displaying current scale/throughput on the operations dashboard (Phase 13).
  - **Acceptance Criteria**: Type review confirms support.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T004

- [ ] T208 [P] Queue-depth metric (if applicable) — documented as N/A
  - **Priority**: Could-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document that this architecture has no application-managed request queue (the primary platform's own request routing handles this) — explicitly noting "Queue optimization" from the requested phase outline maps to platform-native behavior, not new code, avoiding a silently-skipped item being mistaken for an oversight.
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T209 [P] Redis connection resilience — graceful degradation when Upstash is unreachable
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `src/server/cache/cache.ts` (modify), `src/server/security/rateLimiter.ts` (modify)
  - **Goal**: Confirm both the cache wrapper and the Redis-backed rate limiter fail open/fall back gracefully (cache: treat as a miss; rate limiter: fall back to in-memory mode) if Upstash is temporarily unreachable, rather than causing every request to 500.
  - **Acceptance Criteria**: A simulated Redis outage does not break `/api/system/status` or any write endpoint's core function.
  - **Verification**: `npm run test`
  - **Dependencies**: T010, T011

- [ ] T210 [P] Scalability integration test
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `src/features/operations/__tests__/scalability.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US8 local connection-pooling smoke check (50 concurrent requests) as a lightweight CI-runnable proxy for the full Staging load test (T198).
  - **Acceptance Criteria**: Matches quickstart.md US8's local check.
  - **Verification**: `npm run test`
  - **Dependencies**: T174

- [ ] T211 [P] Document connection pooling failure mode
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document what happens if the connection pool is exhausted (a queued/timeout error surfaced as `DATABASE_ERROR` via the existing `handleRouteError` mapping, not a crash) and how to recognize it via the `db_connection_count` metric (T094).
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: T173, T094

- [ ] T212 [P] Verify existing repositories unaffected by pooling change
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: N/A (regression verification across existing repository test suites)
  - **Goal**: Confirm `projectRepository`/`layerRepository`/`featureRepository`/etc.'s existing tests remain green after T173's `datasource` change — no existing query behavior changes.
  - **Acceptance Criteria**: Full existing test suite green.
  - **Verification**: `npm run test`
  - **Dependencies**: T173

- [ ] T213 [P] Document alternative-target scaling (Railway/AWS/Azure/GCP cross-reference)
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive, cross-references Phase 12's Deployment Targets)
  - **Goal**: Short cross-reference from the Scalability section to Phase 12's per-target autoscaling notes, avoiding duplicating the same content twice.
  - **Acceptance Criteria**: Cross-reference present.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T214 [P] Verify `SystemMetric` write path scales with request volume
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `src/server/ops/__tests__/requestMetrics.test.ts` (verify — extends T194)
  - **Goal**: Confirm the per-request metric-recording helper (T093) does not become a bottleneck under the load levels exercised in T198/T204.
  - **Acceptance Criteria**: No measurable throughput regression attributable to metric recording.
  - **Verification**: `npm run test`; cross-reference T198's results
  - **Dependencies**: T093, T198

- [ ] T215 [P] Document rate-limit threshold tuning for scale
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document how per-user-bucket rate-limit thresholds (T003's constants) should be reviewed as real concurrent-user volume approaches the spec's "thousands of concurrent users" target, without hardcoding a number this spec's Assumptions leave for load-testing to determine.
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: T003

- [ ] T216 [P] Verify `opsBackupRepository`/`retentionRepository` scale independently of app-tier scaling
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: N/A (verification task)
  - **Goal**: Confirm scheduled endpoints (backups, retention, metrics-sample) are single-invocation-per-schedule (via `vercel.ts` crons), not accidentally triggered once per scaled app instance.
  - **Acceptance Criteria**: Cron log shows exactly one invocation per scheduled interval regardless of app-tier instance count.
  - **Verification**: Manual post-deploy verification
  - **Dependencies**: T109, T129, T148

- [ ] T217 [P] Document scalability decisions
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (modify — additive, consolidates T196–T216 into one coherent "Scalability" section)
  - **Goal**: Ensure the individually-additive documentation tasks above read as one coherent section, not scattered fragments (SC-020).
  - **Acceptance Criteria**: Section reads coherently top-to-bottom.
  - **Verification**: Manual review
  - **Dependencies**: T196–T216

- [ ] T218 [P] Verify no vendor lock-in introduced by scaling choices
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (verify — cross-references spec Out of Scope)
  - **Goal**: Confirm every scaling decision (Fluid Compute, Redis, connection pooling) is expressed through standard protocols (HTTP, Redis protocol, Postgres wire protocol) with a documented alternative-target equivalent (Phase 12) — no scaling decision requires a primary-platform-specific API in application code.
  - **Acceptance Criteria**: Review confirms no non-portable API call in `src/server/**`.
  - **Verification**: Manual code review
  - **Dependencies**: T010, T011, T173

- [ ] T219 [P] Scalability accessibility note — N/A (no new UI this phase)
  - **Priority**: Could-have
  - **User Story**: [US8]
  - **Files**: N/A
  - **Goal**: Explicitly record Phase 9 introduces no new UI (mirrors T089's reasoning for Phase 4).
  - **Acceptance Criteria**: Noted in `docs/deployment.md`.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T220 Phase 9 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm scalability work is complete and the standard quality gates pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T196–T219

---

## Phase 10: Security Hardening

**Purpose**: HTTPS/TLS, security headers, CORS, CSRF, secrets management,
rate limiting, input validation, OWASP compliance, and security testing
(FR-041–FR-046, US9).

- [ ] T221 Verify HTTPS/TLS is platform-terminated
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (verify — existing content already documents this; add explicit FR-041 cross-reference)
  - **Goal**: Confirm no application code manages TLS certificates; the primary platform auto-provisions/renews them (research.md §10).
  - **Acceptance Criteria**: `curl -I` against a deployed preview over `http://` redirects/upgrades to `https://`.
  - **Verification**: `curl -I http://<preview-domain>/`
  - **Dependencies**: None

- [ ] T222 [P] Verify existing security headers unchanged
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `next.config.ts` (verify — no change beyond T022's `output` field)
  - **Goal**: Re-run `docs/deployment.md`'s existing `curl -I`/securityheaders.com verification steps against a deployment including this feature's changes (SC-015).
  - **Acceptance Criteria**: All 6 headers present with documented exact values, unchanged.
  - **Verification**: `curl -I <deployed-url>`; securityheaders.com scan
  - **Dependencies**: T022, T189

- [ ] T223 Implement CORS allow-list enforcement on `/api/ops/*` endpoints
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: All `src/app/api/ops/**/route.ts` files (modify — apply `corsHeaders.ts` from T013)
  - **Goal**: Every `/api/ops/*` endpoint applies `buildCorsHeaders` (T013) per contracts/api-contracts.md, restricting cross-origin access to `ALLOWED_ORIGINS` (FR-043).
  - **Acceptance Criteria**: A request from a disallowed origin receives no CORS headers; existing same-origin-only endpoints elsewhere in the app remain unaffected.
  - **Verification**: `npx tsc --noEmit`; test in T226
  - **Dependencies**: T013

- [ ] T224 [P] CSRF posture documentation (session-cookie-based endpoints)
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: Document that CSRF protection for this feature's operator endpoints relies on the same `SameSite=Lax` cookie posture `009`'s plan already establishes platform-wide for session cookies — this feature introduces no new cookie-based auth mechanism, so no new CSRF surface (cross-reference, not new code).
  - **Acceptance Criteria**: Documented accurately.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T225 Apply Redis-backed rate limiting to all `/api/ops/*` write endpoints
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/app/api/ops/maintenance/route.ts` (modify, cross-referenced from Phase 11), `src/app/api/ops/deployments/[deploymentId]/rollback/route.ts` (modify), `src/app/api/ops/backups/[backupJobId]/restore/route.ts` (modify)
  - **Goal**: Every write endpoint calls `assertWriteRateLimit` with the `"ops:deploy-webhook"`/`"ops:maintenance-toggle"` buckets (T003), reusing the exact existing call pattern (`assertWriteRateLimit(user.id, bucket)`) from `src/app/api/projects/route.ts` (FR-045).
  - **Acceptance Criteria**: Exceeding the configured threshold returns `429 RATE_LIMITED` for each endpoint.
  - **Verification**: `npm run test`; test in T226
  - **Dependencies**: T003, T011, T059, T145

- [ ] T226 [P] Security tests — CORS, rate limiting, confirmation-gated actions
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/app/api/ops/__tests__/security.api.test.ts` (new)
  - **Goal**: Cross-cutting security test file covering: disallowed-origin CORS rejection (T223), rate-limit threshold enforcement (T225) on each write endpoint, and unconfirmed-restore rejection (T145, re-verified here for completeness).
  - **Acceptance Criteria**: All cases pass (SC-017).
  - **Verification**: `npm run test`
  - **Dependencies**: T223, T225

- [ ] T227 [P] Input validation audit — every `/api/ops/*` endpoint uses `ops.schema.ts`
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: All `src/app/api/ops/**/route.ts` files (verify — every `POST`/`PATCH` parses its body with a T005 schema before use)
  - **Goal**: Confirm no endpoint added by this feature trusts an unvalidated `request.json()` result, per Constitution Principle II/VI.
  - **Acceptance Criteria**: Code review confirms zero unvalidated body usage.
  - **Verification**: Manual code review
  - **Dependencies**: T005, all Phase 3–7/11 Route Handler tasks

- [ ] T228 Secrets-handling audit
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: N/A (audit task across the full feature's new files)
  - **Goal**: Manual confirmation that `CRON_SECRET`, `DATABASE_URL`/`DIRECT_URL`, and Redis credentials never appear in a JSON response, a `LogEntry.context` value, or a committed test fixture (plan.md Quality Gates).
  - **Acceptance Criteria**: Zero findings.
  - **Verification**: Manual grep-assisted audit across `src/app/api/ops/**`, `src/server/repositories/*.ts`, and all new test files
  - **Dependencies**: T125, T228 depends on all prior phases' files existing

- [ ] T229 [P] OWASP Top 10 compliance checklist walkthrough
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — additive "OWASP Compliance" checklist section)
  - **Goal**: Walk through each OWASP Top 10 category against this feature's new endpoints (Injection — Prisma-only, no raw SQL introduced; Broken Access Control — `assertIsOperator`; Cryptographic Failures — no new secret-at-rest handling beyond existing patterns; etc.) and document the finding per category.
  - **Acceptance Criteria**: All 10 categories addressed with a specific finding, not a generic "N/A."
  - **Verification**: Manual review
  - **Dependencies**: T014, T227, T228

- [ ] T230 [P] Verify WAF readiness (structural, no product commitment)
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — additive, per research.md §15)
  - **Goal**: Document that no application code assumes direct-to-origin traffic — everything flows through the primary platform's edge network, where a WAF layer can sit without an architecture change (FR-046).
  - **Acceptance Criteria**: Documented as an architectural property, not a purchased product.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T231 [P] Maintenance-mode bypass-safety verification
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `middleware.ts` (verify, built Phase 11 — confirm the allow-list is a fixed, hardcoded set, not derived from request input)
  - **Goal**: Security review confirming the maintenance-mode allow-list cannot be manipulated by an attacker-controlled path/header.
  - **Acceptance Criteria**: Code review confirms hardcoded allow-list.
  - **Verification**: Manual code review
  - **Dependencies**: None (finalized after Phase 11)

- [ ] T232 [P] Verify `assertIsOperator`'s fail-closed behavior
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/server/ops/__tests__/assertIsOperator.test.ts` (new)
  - **Goal**: Confirm `assertIsOperator` (T014) rejects by default on any ambiguous/error condition (fail-closed, never fail-open).
  - **Acceptance Criteria**: A malformed/missing user context is rejected, not silently allowed.
  - **Verification**: `npm run test`
  - **Dependencies**: T014

- [ ] T233 [P] Dependency audit resolution pass
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `package.json`/`package-lock.json` (modify, if any high-severity finding from T050 requires a version bump)
  - **Goal**: Address any high-severity finding surfaced by `ci.yml`'s `dependency-scan` job (T050), including for the newly-added `@upstash/redis`.
  - **Acceptance Criteria**: Zero unresolved high-severity findings for new dependencies.
  - **Verification**: `npm audit --audit-level=high`
  - **Dependencies**: T050, T018

- [ ] T234 [P] Secrets-validation checklist
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — additive checklist)
  - **Goal**: A pre-Production checklist item confirming every secret this feature introduces is provisioned via the primary platform's managed store, not a `.env` file committed anywhere.
  - **Acceptance Criteria**: Checklist present; cross-references T080.
  - **Verification**: Manual review
  - **Dependencies**: T080

- [ ] T235 [P] Rate-limit threshold configuration review
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `src/server/config/opsConstants.ts` (verify — thresholds from T003 are sane defaults, not placeholders)
  - **Acceptance Criteria**: Every threshold has a documented justification (SC-017).
  - **Goal**: Confirm rate-limit bucket thresholds are deliberately chosen, not arbitrary placeholder numbers.
  - **Verification**: Manual review
  - **Dependencies**: T003

- [ ] T236 [P] Verify existing endpoints' rate limiting unaffected
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: N/A (regression verification)
  - **Goal**: Confirm `src/app/api/projects/route.ts` and other existing write endpoints' rate-limiting behavior is bit-for-bit unchanged when Redis is not configured (T011's fallback guarantee, re-verified in a security context).
  - **Acceptance Criteria**: Existing rate-limiter tests remain green.
  - **Verification**: `npm run test`
  - **Dependencies**: T011

- [ ] T237 [P] Header/CORS interaction verification
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `src/app/api/ops/__tests__/security.api.test.ts` (modify — add a combined header+CORS assertion)
  - **Goal**: Confirm a CORS-allowed cross-origin request to an `/api/ops/*` endpoint still receives the full standard security-header set (T222), not a stripped-down response.
  - **Acceptance Criteria**: Assertion passes.
  - **Verification**: `npm run test`
  - **Dependencies**: T222, T223

- [ ] T238 [P] Security documentation consolidation
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — consolidates T221–T237 into one "Security Hardening" section)
  - **Goal**: Same reasoning as T217, applied to security documentation.
  - **Acceptance Criteria**: Section reads coherently.
  - **Verification**: Manual review
  - **Dependencies**: T221–T237

- [ ] T239 [P] Penetration-style smoke check (manual, documented)
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — additive checklist of manual checks: plaintext-connection rejection, header presence, rate-limit trigger, secret-leak grep)
  - **Goal**: A concise, repeatable manual security smoke-test checklist an operator runs before a major release (matches quickstart.md's US9 scenario).
  - **Acceptance Criteria**: Checklist present and matches quickstart.md US9 exactly.
  - **Verification**: Manual review
  - **Dependencies**: T221, T222, T225

- [ ] T240 [P] Integration test: security hardening end-to-end
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/features/operations/__tests__/security.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US9 scenario (headers present, rate limit triggers `429` past threshold).
  - **Acceptance Criteria**: Matches quickstart.md US9 (SC-015, SC-017).
  - **Verification**: `npm run test`
  - **Dependencies**: T222, T225

- [ ] T241 [P] Verify `009` `FORBIDDEN` error-code non-duplication (re-check)
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `src/shared/errors/apiError.ts` (verify)
  - **Goal**: Re-verify T006's conditional `FORBIDDEN` addition hasn't been duplicated if `009` has since landed its own copy (defensive re-check before this feature is considered complete).
  - **Acceptance Criteria**: Exactly one `FORBIDDEN`/`ForbiddenError` definition exists.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T006

- [ ] T242 [P] Confirm no `any` types introduced across the feature
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: N/A (audit task)
  - **Goal**: ESLint's `--max-warnings 0` (already run every checkpoint) is the primary enforcement; this task is an explicit manual spot-check across the largest/most complex new files (`deploymentRepository.ts`, `opsBackupRepository.ts`, `logRepository.ts`).
  - **Acceptance Criteria**: Zero `any` found.
  - **Verification**: `npx eslint src --max-warnings 0`
  - **Dependencies**: None

- [ ] T243 [P] Verify destructive-action UI confirmation (data-contract readiness; UI built Phase 13)
  - **Priority**: Should-have
  - **User Story**: [US9]
  - **Files**: `src/features/operations/hooks/useRequestRestore.ts` (verify, built T152), `src/features/operations/hooks/useRollbackDeployment.ts` (verify, built Phase 13)
  - **Goal**: Confirm both mutation hooks require an explicit confirmation argument/flow before firing, matching the API layer's own confirmation requirement (T145).
  - **Acceptance Criteria**: Code review confirms no one-click destructive action exists client-side.
  - **Verification**: Manual code review
  - **Dependencies**: T152

- [ ] T244 [P] Verify `ALLOWED_ORIGINS` default is restrictive, not permissive
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/server/config/env.ts` (verify — no default value that resolves to `"*"`)
  - **Goal**: Confirm an unset `ALLOWED_ORIGINS` results in zero allowed cross-origins (fail-closed), not a wildcard.
  - **Acceptance Criteria**: Test asserts unset `ALLOWED_ORIGINS` rejects every origin.
  - **Verification**: `npm run test`
  - **Dependencies**: T007, T013

- [ ] T245 [P] Document break-glass considerations (deferred to `009`)
  - **Priority**: Could-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — additive cross-reference)
  - **Goal**: Note that IP-restriction break-glass recovery is `009`'s scope (its `IP_RESTRICTION_BYPASS_TOKEN`), not this feature's — this feature's operator gate (`assertIsOperator`) has no IP-restriction concept to need one.
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T246 [P] Verify scheduled endpoints reject non-`CRON_SECRET` requests
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/app/api/ops/metrics/sample/__tests__/sample.api.test.ts` (new), `src/app/api/ops/backups/run-due/__tests__/runDue.api.test.ts` (verify — extends T146), `src/app/api/ops/retention/run-due/__tests__/runDue.api.test.ts` (verify — extends T128)
  - **Goal**: Explicit `401`/`403` test for a request to any `*/run-due`/`metrics/sample` endpoint lacking a valid `CRON_SECRET`.
  - **Acceptance Criteria**: All three scheduled endpoints reject unauthenticated requests.
  - **Verification**: `npm run test`
  - **Dependencies**: T094, T127, T143

- [ ] T247 [P] Accessibility of security-related UI states (data-contract readiness)
  - **Priority**: Could-have
  - **User Story**: [US9]
  - **Files**: `src/features/operations/types/operations.types.ts` (verify)
  - **Goal**: Confirm rate-limit/error states surfaced to the client carry a plain-text, screen-reader-friendly message (existing `ApiError.message` shape already satisfies this — verification only).
  - **Acceptance Criteria**: Confirmed.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T006

- [ ] T248 [P] Verify Constitution Principle VI compliance summary
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (modify — additive, explicit checklist mapping to Principle VI's five bullet points)
  - **Goal**: One-to-one checklist confirming every Constitution Principle VI requirement (headers, Zod validation, SQL-injection prevention, auth-before-handler-logic, server-only secrets) is met by this feature's new endpoints.
  - **Acceptance Criteria**: All five items checked with a specific file/task reference.
  - **Verification**: Manual review
  - **Dependencies**: T014, T222, T227, T228

- [ ] T249 [P] Final OWASP/security re-scan before Phase 10 close
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: N/A (verification task)
  - **Goal**: Re-run `ci.yml`'s `security-scan`/`dependency-scan` jobs (T050, T051) one final time against the fully Phase-10-complete branch.
  - **Acceptance Criteria**: Zero new high-severity findings.
  - **Verification**: CI run review
  - **Dependencies**: T050, T051, T233

- [ ] T250 Phase 10 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm security hardening is complete and the standard + security-specific quality gates pass.
  - **Acceptance Criteria**: All commands below exit 0; OWASP checklist (T229) fully reviewed.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npm audit --audit-level=high`
  - **Dependencies**: T221–T249

---

## Phase 11: Production Operations

**Purpose**: Deployment dashboard data layer, release management,
version tracking, maintenance mode, diagnostics, system status, and
notifications (FR-047–FR-050, US10).

- [ ] T251 Create `maintenanceRepository.ts`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/server/repositories/maintenanceRepository.ts` (new)
  - **Goal**: `getActiveMaintenanceWindow`, `activateMaintenance` (transactional check-then-insert), `deactivateMaintenance` exactly per contracts/repository-api.md.
  - **Acceptance Criteria**: Two concurrent `activateMaintenance` calls result in exactly one `ACTIVE` row, the second call returning the existing window (spec Edge Cases, data-model.md concurrency note).
  - **Verification**: `npx tsc --noEmit`; repository test in T255
  - **Dependencies**: T001

- [ ] T252 Implement `GET /api/ops/maintenance`, `POST /api/ops/maintenance`, `DELETE /api/ops/maintenance/:id`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/maintenance/route.ts` (new), `src/app/api/ops/maintenance/[id]/route.ts` (new)
  - **Goal**: Operator-gated per contracts/api-contracts.md (FR-049); `POST` calls T121/T122's `logger.persist` (`SECURITY`+`AUDIT` categories) and T225's rate limiting.
  - **Acceptance Criteria**: `POST` while already active returns the existing window with `200`, not a duplicate `201`.
  - **Verification**: `npx tsc --noEmit`; API test in T255
  - **Dependencies**: T251, T014

- [ ] T253 Create `middleware.ts` — maintenance-mode gate
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `middleware.ts` (new, project root)
  - **Goal**: Checks `maintenanceRepository.getActiveMaintenanceWindow()` on every request; returns `503` with `Retry-After` for any **new** request except the hardcoded allow-list (`/api/system/status`, `/api/ops/maintenance*`) per contracts/api-contracts.md and spec FR-049a — requests already past this check when a window activates are unaffected (middleware runs at request start only).
  - **Acceptance Criteria**: Matches quickstart.md US10 step 2 exactly (new request blocked, in-flight request completes normally).
  - **Verification**: `npx tsc --noEmit`; integration test in T262
  - **Dependencies**: T251

- [ ] T254 [P] Compose `middleware.ts` with `009`'s auth-gate if present (documented merge point)
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `middleware.ts` (verify — documented composition pattern, not a code change unless `009`'s `middleware.ts` already exists)
  - **Goal**: Document (plan.md Technical Context) that if `009` has landed its own `middleware.ts` by implementation time, this feature's maintenance check is added as one additional composed check in that same file, since Next.js permits only one `middleware.ts`.
  - **Acceptance Criteria**: Documented merge instructions present in `docs/deployment.md`.
  - **Verification**: Manual review
  - **Dependencies**: T253

- [ ] T255 [P] Repository + API + middleware tests
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/server/repositories/__tests__/maintenanceRepository.test.ts` (new), `src/app/api/ops/maintenance/__tests__/maintenance.api.test.ts` (new), `src/__tests__/middleware.test.ts` (new)
  - **Goal**: Cover activation-race handling, endpoint success/validation/auth paths, and middleware's block/allow-list/pass-through behavior.
  - **Acceptance Criteria**: All cases pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T251, T252, T253

- [ ] T256 Wire `/api/ops/diagnostics` full consolidation
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/diagnostics/route.ts` (modify — replace Phase 5's stubs with real `LogEntry` recent-errors query and real `getActiveMaintenanceWindow` call)
  - **Goal**: Close the stubs left in T102 now that `logRepository` (Phase 6) and `maintenanceRepository` (T251) exist, producing the full consolidated report per contracts/api-contracts.md (FR-050).
  - **Acceptance Criteria**: Response includes real recent-error entries and real maintenance-window state, not placeholders.
  - **Verification**: `npm run test` (extends T103's suite)
  - **Dependencies**: T102, T116, T251

- [ ] T257 [P] `opsService.ts`/hooks — maintenance client wiring
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/services/opsService.ts` (modify — add `getMaintenanceStatus`/`activateMaintenance`/`deactivateMaintenance`), `src/features/operations/hooks/useMaintenanceStatus.ts` (new, `refetchInterval: 15_000`), `src/features/operations/hooks/useActivateMaintenance.ts` (new), `src/features/operations/hooks/useDeactivateMaintenance.ts` (new)
  - **Goal**: Client access per contracts/client-api.md.
  - **Acceptance Criteria**: Mutation hooks invalidate `opsKeys.maintenance()` on success.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T252, T111

- [ ] T258 [P] `opsService.ts`/hooks — deployments/releases client wiring (finalized)
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/features/operations/services/opsService.ts` (modify — add `listDeployments`/`listDeploymentEvents`/`rollbackDeployment`/`listReleases`), `src/features/operations/hooks/useDeployments.ts` (new), `src/features/operations/hooks/useDeploymentEvents.ts` (new), `src/features/operations/hooks/useRollbackDeployment.ts` (new), `src/features/operations/hooks/useReleases.ts` (new)
  - **Goal**: Client access per contracts/client-api.md, completing the deployment/release client layer started conceptually in Phase 3.
  - **Acceptance Criteria**: `useRollbackDeployment` invalidates `opsKeys.deployments()` on success.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T058, T059, T061, T111

- [ ] T259 [P] Service-layer unit tests for T257/T258
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/__tests__/opsService.test.ts` (modify — add maintenance/deployment/release cases)
  - **Goal**: Mocked-`fetch` request-shaping tests.
  - **Acceptance Criteria**: Pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T257, T258

- [ ] T260 [P] Version tracking — `ReleaseVersion.status` rollup
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/server/repositories/deploymentRepository.ts` (modify — `updateDeploymentStatus` also updates the parent `ReleaseVersion.status` when the deployment is Production-targeted)
  - **Goal**: Confirm the "currently deployed version" (FR-047) is derivable as "the most recent `ReleaseVersion` whose Production `DeploymentHistory` is `SUCCEEDED`," not a separately-tracked field prone to drift.
  - **Acceptance Criteria**: Query/derivation logic tested explicitly.
  - **Verification**: `npm run test` (extends T060's suite)
  - **Dependencies**: T056

- [ ] T261 [P] `assertIsOperator` unit tests
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/server/ops/__tests__/assertIsOperator.test.ts` (verify — extends T232, no new file)
  - **Goal**: Confirm T014's interim gate is exercised by this phase's own new endpoints (maintenance, diagnostics), not only Phase 3's.
  - **Acceptance Criteria**: Every Phase 11 operator-gated endpoint has a corresponding 401/403 test.
  - **Verification**: `npm run test`
  - **Dependencies**: T014, T252

- [ ] T262 [P] Integration test: production operations end-to-end
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/__tests__/productionOperations.integration.test.ts` (new)
  - **Goal**: Automated version of quickstart.md's US10 scenario — view version/history, activate maintenance, confirm new request blocked while in-flight request completes, deactivate, run diagnostics.
  - **Acceptance Criteria**: Matches quickstart.md US10 exactly (SC-018, SC-019).
  - **Verification**: `npm run test`
  - **Dependencies**: T252, T253, T256, T258

- [ ] T263 [P] Store unit tests for `operationsStore`
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/__tests__/operationsStore.test.ts` (new)
  - **Goal**: Cover every action/selector in T017's store.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T017

- [ ] T264 [P] Hook unit tests for T112/T257/T258
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/__tests__/hooks.test.tsx` (new)
  - **Goal**: Cache-invalidation-target tests for every mutation hook (`useRollbackDeployment`, `useActivateMaintenance`, `useDeactivateMaintenance`, `useAcknowledgeNotification`, `useRequestRestore`).
  - **Acceptance Criteria**: Each mutation's `onSuccess` invalidates the documented query key.
  - **Verification**: `npm run test`
  - **Dependencies**: T112, T152, T257, T258

- [ ] T265 [P] Diagnostics report performance check
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/diagnostics/__tests__/diagnostics.api.test.ts` (modify — add a timing assertion)
  - **Goal**: Confirm the consolidated diagnostics report (T256) returns within SC-018's 1-minute-assessable budget under realistic data volume.
  - **Acceptance Criteria**: Assertion passes.
  - **Verification**: `npm run test`
  - **Dependencies**: T256

- [ ] T266 [P] Document the operations dashboard's operator workflow
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `docs/deployment.md` (modify — additive "Production Operations" section)
  - **Goal**: Document how an operator uses the dashboard (Phase 13) for version tracking, maintenance mode, and diagnostics, referencing the API contracts.
  - **Acceptance Criteria**: Section present.
  - **Verification**: Manual review
  - **Dependencies**: T256

- [ ] T267 [P] Two-operator race condition test (maintenance + rollback)
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/server/repositories/__tests__/maintenanceRepository.test.ts` (modify — add a concurrent-activation test), `src/server/repositories/__tests__/deploymentRepository.test.ts` (modify — add a concurrent-rollback test)
  - **Goal**: Explicit spec-Edge-Case coverage for "two operators activate maintenance mode or trigger rollback at the same time."
  - **Acceptance Criteria**: Both scenarios resolve deterministically without a duplicate/corrupted row.
  - **Verification**: `npm run test`
  - **Dependencies**: T251, T056

- [ ] T268 [P] Interrupted-pipeline-stage handling
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/server/ops/deploymentTimeout.ts` (new)
  - **Goal**: A function/scheduled check that treats a `DeploymentHistory` stuck in `IN_PROGRESS` past a documented timeout as `FAILED` (spec Edge Cases: "pipeline stage interrupted midway"), triggering a `SystemNotification`.
  - **Acceptance Criteria**: A manually-backdated `IN_PROGRESS` row is marked `FAILED` by the check.
  - **Verification**: `npm run test`
  - **Dependencies**: T056, T097

- [ ] T269 [P] Add deployment-timeout check to `vercel.ts` cron config
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `vercel.ts` (modify — additive cron entry or folded into the existing metrics-sample schedule)
  - **Goal**: Schedule T268's check to run periodically.
  - **Acceptance Criteria**: Visible in cron log post-deploy.
  - **Verification**: Manual post-deploy verification
  - **Dependencies**: T109, T268

- [ ] T270 [P] `NoPreviousDeploymentError` operator-facing message verification
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/deployments/[deploymentId]/rollback/__tests__/rollback.api.test.ts` (new, or extends T060's suite)
  - **Goal**: Confirm the error message surfaced to the client for a no-prior-deployment rollback attempt is clear and actionable (spec Edge Cases), not a generic failure string.
  - **Acceptance Criteria**: Message reviewed and asserted in test.
  - **Verification**: `npm run test`
  - **Dependencies**: T056, T059

- [ ] T271 [P] Verify `assertIsOperator` swap-point documentation
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/server/ops/assertIsOperator.ts` (verify — inline comment documenting the future `009` swap, per plan.md Complexity Tracking)
  - **Goal**: Confirm the single-line-change swap point is clearly marked so `009`'s eventual implementation doesn't need to hunt for every call site.
  - **Acceptance Criteria**: Comment present and accurate.
  - **Verification**: Manual review
  - **Dependencies**: T014

- [ ] T272 [P] Verify `SystemNotification` dashboard feed completeness
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/notifications/__tests__/notifications.api.test.ts` (modify — add cases confirming health/backup/deployment-failure notification types all surface through this one endpoint)
  - **Goal**: Confirm every notification-producing code path (T098 health alerts, T157 backup failures, T268 deployment timeouts) is retrievable through `GET /api/ops/notifications` — one unified feed, not scattered per-feature alert lists.
  - **Acceptance Criteria**: All three notification `type` values appear in test fixtures and are retrievable.
  - **Verification**: `npm run test`
  - **Dependencies**: T098, T157, T268, T099

- [ ] T273 [P] Correlate `deploymentId`/`requestId` across diagnostics
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: `src/app/api/ops/diagnostics/route.ts` (modify)
  - **Goal**: Where available, thread the currently-active `deploymentId` (from the latest `SUCCEEDED` Production `DeploymentHistory`) into the diagnostics response so an operator can correlate "which release" with "what's failing" (research.md §21, FR-050).
  - **Acceptance Criteria**: Response includes `activeDeploymentId` when derivable.
  - **Verification**: `npm run test` (extends T256's suite)
  - **Dependencies**: T256, T260

- [ ] T274 [P] `009` `assertSystemPermission` forward-compat check (documentation only)
  - **Priority**: Could-have
  - **User Story**: [US10]
  - **Files**: `docs/deployment.md` (modify — additive)
  - **Goal**: A short note for whoever implements `009` describing exactly how to swap `assertIsOperator`'s body to delegate to `assertSystemPermission(userId, "manage_operations")` once available (plan.md Complexity Tracking).
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: T271

- [ ] T275 Phase 11 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm production operations is fully wired and the standard quality gates pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy`
  - **Dependencies**: T251–T274

---

## Phase 12: Cloud Deployments

**Purpose**: Vercel (primary, built/tested), and documented-only
deployment notes for Railway, AWS, Azure, Google Cloud, generic Docker,
and self-hosted Linux (spec FR-052, plan.md Deployment Targets).

- [ ] T276 Configure the Vercel project (primary target)
  - **Priority**: Must-have
  - **User Story**: [US2] [US3]
  - **Files**: `vercel.ts` (modify — finalize `buildCommand`, `framework: "nextjs"`, consolidate all `crons` entries from T109/T129/T148/T269 into one file)
  - **Goal**: One authoritative `vercel.ts` with `buildCommand: "prisma migrate deploy && next build"` (reusing `003`'s documented ordering) and every scheduled endpoint registered.
  - **Acceptance Criteria**: `vercel.ts` is syntactically valid and lists exactly the four scheduled endpoints this feature introduces.
  - **Verification**: Manual review; post-deploy cron-log check
  - **Dependencies**: T053, T109, T129, T148, T269

- [ ] T277 [P] Configure Vercel environment variables (Production/Preview scoped)
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: N/A (Vercel dashboard/CLI configuration, documented in `docs/deployment.md`)
  - **Goal**: Every variable from `env.ts` (T007) provisioned per environment scope (Production vs. Preview) via Vercel's managed store.
  - **Acceptance Criteria**: `GET /api/ops/config/validate` returns `valid: true` in both Preview and Production.
  - **Verification**: Manual post-configuration check via T072's endpoint
  - **Dependencies**: T007, T072

- [ ] T278 [P] Configure Supabase project (primary database target)
  - **Priority**: Must-have
  - **User Story**: [US1] [US7]
  - **Files**: N/A (Supabase dashboard configuration, documented)
  - **Goal**: Supabase Postgres project with PostGIS enabled; pooled connection string as `DATABASE_URL`, direct connection string as `DIRECT_URL` (T173).
  - **Acceptance Criteria**: `npx prisma migrate deploy` succeeds against the Supabase project.
  - **Verification**: `npx prisma migrate deploy`
  - **Dependencies**: T173

- [ ] T279 [P] Configure Upstash Redis (primary cache/rate-limit target)
  - **Priority**: Must-have
  - **User Story**: [US7] [US9]
  - **Files**: N/A (Vercel Marketplace/Upstash dashboard configuration, documented)
  - **Goal**: Upstash Redis instance provisioned via Vercel Marketplace; `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` set.
  - **Acceptance Criteria**: T041's connectivity smoke check passes against the real instance, not just local Compose Redis.
  - **Verification**: Manual post-configuration smoke check
  - **Dependencies**: T041

- [ ] T280 Vercel deployment validation (full quickstart run)
  - **Priority**: Must-have
  - **User Story**: [US2] [US3]
  - **Files**: N/A (verification task)
  - **Goal**: Run every quickstart.md scenario against a real Vercel Preview deployment (not just local Docker Compose) to confirm the primary target works end-to-end.
  - **Acceptance Criteria**: All ten quickstart.md sections pass against the deployed Preview.
  - **Verification**: Manual full quickstart.md walkthrough against a Preview URL
  - **Dependencies**: T276, T277, T278, T279

- [ ] T281 [P] Document Railway deployment (alternative, documentation-only)
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting, alternative target)
  - **Files**: `docs/deployment.md` (modify — additive "Railway" subsection under Deployment Targets)
  - **Goal**: Document running the production `Dockerfile` image directly on Railway, Railway Cron for scheduled endpoints, Railway Postgres (PostGIS-enabled) or an external Supabase instance (plan.md Deployment Targets table).
  - **Acceptance Criteria**: Documented; no code written or CI-tested against Railway.
  - **Verification**: Manual review
  - **Dependencies**: T021

- [ ] T282 [P] Document AWS deployment (alternative, documentation-only)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive "AWS" subsection)
  - **Goal**: Document ECS/Fargate running the production image behind an ALB, EventBridge Scheduler for scheduled endpoints, RDS/Aurora Postgres with `postgis` enabled, Parameter Store/Secrets Manager for secrets.
  - **Acceptance Criteria**: Documented; no code written or CI-tested against AWS.
  - **Verification**: Manual review
  - **Dependencies**: T021

- [ ] T283 [P] Document Azure deployment (alternative, documentation-only)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive "Azure" subsection)
  - **Goal**: Document Azure Container Apps (not AKS — Kubernetes explicitly out of scope) running the production image, Azure Database for PostgreSQL Flexible Server with `postgis`, Azure Key Vault for secrets.
  - **Acceptance Criteria**: Documented; no code written or CI-tested against Azure.
  - **Verification**: Manual review
  - **Dependencies**: T021

- [ ] T284 [P] Document Google Cloud deployment (alternative, documentation-only)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive "Google Cloud" subsection)
  - **Goal**: Document Cloud Run running the production image (native autoscaling), Cloud SQL for PostgreSQL with `postgis` enabled, Secret Manager for secrets.
  - **Acceptance Criteria**: Documented; no code written or CI-tested against Google Cloud.
  - **Verification**: Manual review
  - **Dependencies**: T021

- [ ] T285 [P] Document generic Docker deployment (alternative, documentation-only)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive "Docker (generic self-hosted)" subsection)
  - **Goal**: Document `docker-compose.yml` (T025) as the reference production topology for any Docker host, with an operator-supplied reverse proxy (Caddy/Nginx/Traefik) for TLS termination (research.md §10) and optional WAF front-ending (FR-046).
  - **Acceptance Criteria**: Documented; matches T025's actual file.
  - **Verification**: Manual review
  - **Dependencies**: T025

- [ ] T286 [P] Document self-hosted Linux deployment (alternative, documentation-only)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive "Self-hosted Linux" subsection)
  - **Goal**: Document `docker compose up -d` as the deployment unit and host-level `cron`/`systemd` timers triggering the scheduled endpoints, mirroring `009`'s already-documented Docker deployment note for its own scheduled endpoint.
  - **Acceptance Criteria**: Documented.
  - **Verification**: Manual review
  - **Dependencies**: T025, T285

- [ ] T287 [P] Document the `pg_dump` fallback backup approach for alternative targets
  - **Priority**: Should-have
  - **User Story**: [US6]
  - **Files**: `docs/deployment.md` (verify — cross-references T160, no new content beyond a link from the Cloud Deployments section)
  - **Goal**: Ensure Railway/AWS/Azure/GCP/Docker/self-hosted sections each link to T160's fallback backup documentation rather than repeating it per-target.
  - **Acceptance Criteria**: Cross-references present in each alternative-target subsection.
  - **Verification**: Manual review
  - **Dependencies**: T160, T281–T286

- [ ] T288 [P] Verify Docker image portability across alternative targets
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: N/A (verification task)
  - **Goal**: Confirm the production `Dockerfile` (T021) builds and runs correctly on a plain `docker run` invocation with only environment variables supplied — no Vercel-specific assumption baked into the image itself.
  - **Acceptance Criteria**: `docker run` with a manually-supplied `.env` file starts the application successfully outside Docker Compose.
  - **Verification**: `docker run --env-file .env -p 3000:3000 spatialmind-ai:prod`
  - **Dependencies**: T021

- [ ] T289 [P] Verify no vendor-specific SDK imported in application code
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (audit task, spec Out of Scope's "avoid cloud vendor lock-in")
  - **Goal**: Confirm `src/server/**` uses only the Redis wire protocol (`@upstash/redis`, which speaks standard Redis REST, not an AWS/GCP-proprietary SDK) and standard `pg`/Prisma connections — no `@aws-sdk/*`/`@google-cloud/*`/`@azure/*` package introduced.
  - **Acceptance Criteria**: `package.json` contains no cloud-vendor-specific SDK.
  - **Verification**: Manual `package.json` review
  - **Dependencies**: T018

- [ ] T290 [P] Cross-target environment-variable parity check
  - **Priority**: Should-have
  - **User Story**: [US1]
  - **Files**: `docs/environment-variables.md` (verify — every variable documented is target-agnostic in name/format)
  - **Goal**: Confirm no environment variable name or format is Vercel-specific in a way that would break on Railway/AWS/etc. (e.g., `DATABASE_URL` format is the standard Postgres connection-string format everywhere).
  - **Acceptance Criteria**: Reviewed and confirmed portable.
  - **Verification**: Manual review
  - **Dependencies**: T019

- [ ] T291 [P] Document target-selection guidance
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive short guidance paragraph)
  - **Goal**: One short paragraph explaining *why* Vercel+Supabase was chosen as primary (research.md §13) and when an operator might reasonably choose an alternative (e.g., existing AWS infrastructure/compliance requirements), without recommending against the primary choice.
  - **Acceptance Criteria**: Present, matches research.md §13's stated rationale.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T292 [P] Deployment Targets table finalization
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — reproduces plan.md's Deployment Targets table with links into each subsection)
  - **Goal**: One authoritative, linked table in `docs/deployment.md` matching plan.md's Deployment Targets table exactly.
  - **Acceptance Criteria**: Table present, all links resolve.
  - **Verification**: Manual review
  - **Dependencies**: T281–T286

- [ ] T293 [P] Verify migration ordering documented per target
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `docs/deployment.md` (verify — each target's subsection states "migrate before build/deploy," matching `003`'s established requirement)
  - **Goal**: Confirm the "migrate before new version receives traffic" rule (T053) is explicitly restated for every alternative target, not just Vercel.
  - **Acceptance Criteria**: Present in all six subsections.
  - **Verification**: Manual review
  - **Dependencies**: T053, T281–T286

- [ ] T294 [P] Verify PostGIS availability requirement stated per target
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (verify)
  - **Goal**: Confirm every target's documented database option explicitly supports PostGIS (Constitution Principle III) — no alternative-target note suggests a Postgres offering that cannot install the extension.
  - **Acceptance Criteria**: Confirmed for all six alternatives.
  - **Verification**: Manual review
  - **Dependencies**: T281–T286

- [ ] T295 [P] Rollback procedure per target
  - **Priority**: Should-have
  - **User Story**: [US3]
  - **Files**: `docs/deployment.md` (modify — additive per-target rollback note)
  - **Goal**: For each alternative target, one sentence on how rollback is achieved (Railway: redeploy previous build; AWS: previous task definition revision; Azure/GCP: previous revision; Docker/self-hosted: previous image tag) — Vercel's own is already covered (research.md §5).
  - **Acceptance Criteria**: Present for all five alternatives.
  - **Verification**: Manual review
  - **Dependencies**: T281–T286

- [ ] T296 [P] Load-balancing/autoscaling note per target
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `docs/deployment.md` (verify — cross-references plan.md Deployment Targets table's own notes, no duplication)
  - **Goal**: Confirm each alternative-target subsection states its native load-balancing/autoscaling mechanism (already summarized in plan.md's table).
  - **Acceptance Criteria**: Present.
  - **Verification**: Manual review
  - **Dependencies**: T281–T286

- [ ] T297 [P] Secrets-management note per target
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `docs/deployment.md` (verify)
  - **Goal**: Confirm each alternative-target subsection names its secrets mechanism (Railway variables, AWS Secrets Manager/Parameter Store, Azure Key Vault, GCP Secret Manager, Docker Compose `secrets:`/`.env`).
  - **Acceptance Criteria**: Present for all six.
  - **Verification**: Manual review
  - **Dependencies**: T281–T286

- [ ] T298 [P] Cross-check plan.md and `docs/deployment.md` Deployment Targets tables for drift
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (verify against `specs/010-deployment-enterprise/plan.md`)
  - **Goal**: One final consistency pass ensuring the two documents agree.
  - **Acceptance Criteria**: No discrepancy found.
  - **Verification**: Manual diff review
  - **Dependencies**: T292

- [ ] T299 [P] Deployment validation integration test (Vercel Preview)
  - **Priority**: Must-have
  - **User Story**: [US2] [US3]
  - **Files**: N/A (extends T280, no new file)
  - **Goal**: Confirm T280's manual walkthrough is repeated once more after all Phase 12 documentation lands, as a final sanity check before Phase 13's UI work begins consuming these deployed endpoints.
  - **Acceptance Criteria**: Passes.
  - **Verification**: Manual walkthrough
  - **Dependencies**: T280

- [ ] T300 Phase 12 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm cloud deployment documentation is complete and the primary target is validated.
  - **Acceptance Criteria**: All commands below exit 0; T280/T299 walkthroughs passed.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T276–T299

---

## Phase 13: UI Components

**Purpose**: The `src/features/operations/` dashboard UI — deployment
dashboard, health dashboard, monitoring dashboard, backup manager,
release manager, configuration page, maintenance page, loading/error
states (FR-047, FR-050, contracts/client-api.md).

- [ ] T301 Create `OperationsDashboard.tsx` — top-level layout + tab navigation
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/components/OperationsDashboard.tsx` (new)
  - **Goal**: Tabbed layout (`overview`/`deployments`/`backups`/`logs`/`maintenance`, driven by `operationsStore.activeTab`, T017) using `shadcn/ui` primitives already vendored, satisfying FR-047/FR-050's "single place" requirement.
  - **Acceptance Criteria**: All five tabs render; switching tabs updates `operationsStore`.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T016, T017

- [ ] T302 [P] Create `SystemStatusPanel.tsx`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/features/operations/components/SystemStatusPanel.tsx` (new)
  - **Goal**: Component-health cards (application/database/API) using `useSystemStatus` (T112), auto-refreshing every 30s, using `shared/components/ui/alert.tsx` for unhealthy states.
  - **Acceptance Criteria**: Displays healthy/degraded/unhealthy per component with appropriate visual+textual (not color-only) indication.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T112

- [ ] T303 [P] Create `DeploymentHistoryPanel.tsx` and `DeploymentEventsTimeline.tsx`
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/features/operations/components/DeploymentHistoryPanel.tsx` (new), `src/features/operations/components/DeploymentEventsTimeline.tsx` (new)
  - **Goal**: Release/deploy history list + per-deployment event timeline using `useDeployments`/`useDeploymentEvents` (T258), environment-filterable via `operationsStore.selectedEnvironment`.
  - **Acceptance Criteria**: Selecting a deployment shows its event timeline (FR-047, FR-048).
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T258, T017

- [ ] T304 [P] Create `RollbackConfirmDialog.tsx`
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: `src/features/operations/components/RollbackConfirmDialog.tsx` (new)
  - **Goal**: Reuses `src/shared/components/ui/alert-dialog.tsx` (already vendored) to require explicit confirmation before calling `useRollbackDeployment` (T258) — FR-015, mirroring the explicit destructive-action pattern.
  - **Acceptance Criteria**: Rollback mutation never fires without the dialog's explicit confirm click.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T258

- [ ] T305 [P] Create `BackupManagementPanel.tsx`
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/features/operations/components/BackupManagementPanel.tsx` (new)
  - **Goal**: Job list + history using `useBackupJobs`/`useBackupHistory` (T152), restore action gated behind an `AlertDialog` confirmation calling `useRequestRestore` (FR-025–FR-027).
  - **Acceptance Criteria**: Restore action requires explicit confirmation; history shows status/size/expiry.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T152

- [ ] T306 [P] Create `MaintenanceModePanel.tsx`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/components/MaintenanceModePanel.tsx` (new)
  - **Goal**: Activate/deactivate toggle + active-window banner using `useMaintenanceStatus`/`useActivateMaintenance`/`useDeactivateMaintenance` (T257) — FR-049, with the reason/notify-message form fields validated against `ops.schema.ts` (T005) client-side before submit.
  - **Acceptance Criteria**: Active window displays `reason`/`startedAt`; deactivation requires an operator click, not automatic.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T257

- [ ] T307 [P] Create `DiagnosticsPanel.tsx`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/components/DiagnosticsPanel.tsx` (new)
  - **Goal**: On-demand diagnostics report display using `useDiagnostics` (T112) — a manual "Run Diagnostics" button, not auto-polled (FR-050, matching contracts/client-api.md's "manual `refetch` trigger" note).
  - **Acceptance Criteria**: Report renders application/database/API health, recent errors, resource status in one view.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T112

- [ ] T308 [P] Create `NotificationsPanel.tsx`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/features/operations/components/NotificationsPanel.tsx` (new)
  - **Goal**: Alert list + acknowledge action using `useNotifications`/`useAcknowledgeNotification` (T112) — FR-018.
  - **Acceptance Criteria**: Acknowledged notifications visually distinguish from unacknowledged ones.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T112

- [ ] T309 [P] Create `LogExplorer.tsx`
  - **Priority**: Must-have
  - **User Story**: [US5]
  - **Files**: `src/features/operations/components/LogExplorer.tsx` (new)
  - **Goal**: Filterable (category/level/time-range), paginated centralized log view using `useLogs` (T131), filter state via `operationsStore.logFilterDraft` (T017) — FR-023.
  - **Acceptance Criteria**: Filtering by category+level narrows results correctly; pagination loads additional pages via `useInfiniteQuery`.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T131, T017

- [ ] T310 [P] Create `MetricsChart.tsx`
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `src/features/operations/components/MetricsChart.tsx` (new)
  - **Goal**: Reuses Recharts (already introduced by `008`'s plan precedent) via `next/dynamic({ ssr: false })` (T167), fed by `useMetrics` (T112), with `useMemo`'d data transformation (T183).
  - **Acceptance Criteria**: Renders a time-series chart for a selected `metricName`; no second charting library added.
  - **Verification**: `npx tsc --noEmit`; component test in T316
  - **Dependencies**: T112, T167, T183

- [ ] T311 Create `src/app/operations/page.tsx`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/app/operations/page.tsx` (new)
  - **Goal**: Mounts `<OperationsDashboard />` (T301) as the `/operations` route, wrapped in a React error boundary per Constitution's Error Handling standard (matching every existing top-level feature route).
  - **Acceptance Criteria**: `/operations` renders the dashboard; a thrown error inside any panel is caught by the boundary, not a blank page.
  - **Verification**: `npx tsc --noEmit`; `npm run build`
  - **Dependencies**: T301

- [ ] T312 Add "Operations" nav entry to `Navbar.tsx`
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/dashboard/components/Navbar.tsx` (modify — one additive nav-link line, mirroring `009`'s own precedent for this file)
  - **Goal**: A single new nav entry linking to `/operations`, visible only to authorized operators (client-side check via a lightweight "am I an operator" signal — server-side enforcement remains `assertIsOperator` on every API call regardless of what the client shows).
  - **Acceptance Criteria**: Nav entry present; existing `Navbar.tsx` content/tests unaffected beyond this one addition.
  - **Verification**: `npx tsc --noEmit`; existing `Navbar.tsx` tests remain green
  - **Dependencies**: T311

- [ ] T313 [P] Loading states across all Phase 13 components
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: All components from T302–T310 (modify — add `isLoading` skeleton/spinner states per React Query's status)
  - **Goal**: Every panel shows an explicit loading indicator while its query is pending, never a blank/flash-of-empty-content state.
  - **Acceptance Criteria**: Code review confirms every `useQuery` consumer handles `isLoading`.
  - **Verification**: Manual code review; component tests in T316
  - **Dependencies**: T302–T310

- [ ] T314 [P] Error states across all Phase 13 components
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: All components from T302–T310 (modify — add `isError` explicit error state with a recovery action where one exists, per Constitution's Error Handling standard)
  - **Goal**: Every panel shows a clear error state (reusing `shared/components/ui/alert.tsx`) rather than crashing or silently showing stale/empty data.
  - **Acceptance Criteria**: Code review confirms every `useQuery` consumer handles `isError`.
  - **Verification**: Manual code review; component tests in T316
  - **Dependencies**: T302–T310

- [ ] T315 [P] Accessibility pass — WCAG 2.2 AA across all new panels
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: All components from T301–T310 (modify as needed — ARIA labels on interactive controls, `aria-live="polite"` on auto-refreshing status regions per Constitution's Accessibility standard)
  - **Goal**: Every interactive control keyboard-navigable with a visible focus indicator; `SystemStatusPanel`/`NotificationsPanel`'s live-updating regions use `aria-live="polite"`; `LogExplorer`'s filter controls and `RollbackConfirmDialog`/restore-confirmation dialogs specifically checked for keyboard/screen-reader usability.
  - **Acceptance Criteria**: axe + RTL a11y assertions pass for every component (component tests in T316).
  - **Verification**: `npm run test`; manual screen-reader spot-check
  - **Dependencies**: T301–T310

- [ ] T316 Component tests for all Phase 13 UI
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/__tests__/OperationsDashboard.test.tsx` (new), `src/features/operations/__tests__/SystemStatusPanel.test.tsx` (new), `src/features/operations/__tests__/DeploymentHistoryPanel.test.tsx` (new), `src/features/operations/__tests__/BackupManagementPanel.test.tsx` (new), `src/features/operations/__tests__/MaintenanceModePanel.test.tsx` (new), `src/features/operations/__tests__/DiagnosticsPanel.test.tsx` (new), `src/features/operations/__tests__/NotificationsPanel.test.tsx` (new), `src/features/operations/__tests__/LogExplorer.test.tsx` (new), `src/features/operations/__tests__/MetricsChart.test.tsx` (new)
  - **Goal**: Vitest + React Testing Library tests covering conditional rendering, user interaction, loading/error states, and ARIA state for every Phase 13 component (Constitution Principle VII).
  - **Acceptance Criteria**: All pass, including axe a11y assertions.
  - **Verification**: `npm run test`
  - **Dependencies**: T301–T315

- [ ] T317 [P] `RollbackConfirmDialog`/restore-confirmation keyboard-navigation test
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `src/features/operations/__tests__/DeploymentHistoryPanel.test.tsx` (modify — add explicit keyboard-only interaction test), `src/features/operations/__tests__/BackupManagementPanel.test.tsx` (modify — same for restore)
  - **Goal**: Explicit test that both destructive-action confirmations are fully operable via keyboard alone (Tab/Enter/Escape), per Constitution Accessibility standard and this feature's own destructive-action-confirmation requirement (T243).
  - **Acceptance Criteria**: Pass.
  - **Verification**: `npm run test`
  - **Dependencies**: T304, T305

- [ ] T318 [P] Integration test: full dashboard walkthrough
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `src/features/operations/__tests__/dashboard.integration.test.tsx` (new)
  - **Goal**: Renders `OperationsDashboard` with mocked query responses, exercises every tab, confirms each panel's primary interaction (view history, acknowledge notification, filter logs) works together as one cohesive dashboard.
  - **Acceptance Criteria**: Passes.
  - **Verification**: `npm run test`
  - **Dependencies**: T301–T310

- [ ] T319 [P] Responsive-layout verification (mobile-first, 320px)
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: All components from T301–T310 (modify as needed — Tailwind mobile-first classes, per Constitution's Responsive Design standard)
  - **Goal**: `OperationsDashboard` and every panel remain fully functional at 320px width with no horizontal scroll; touch targets ≥44×44px.
  - **Acceptance Criteria**: Manual viewport check at 320px passes for every panel.
  - **Verification**: Manual browser DevTools responsive check
  - **Dependencies**: T301–T310

- [ ] T320 Phase 13 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm the operations dashboard UI is complete, accessible, and the standard quality gates pass.
  - **Acceptance Criteria**: All commands below exit 0; Lighthouse Accessibility ≥90 on `/operations` (T188, re-verified now that the UI exists).
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && ANALYZE=true npm run build`
  - **Dependencies**: T301–T319

---

## Phase 14: Performance & Reliability

**Purpose**: Consolidated load/stress/recovery/availability/reliability
testing across the whole feature, now that every phase's code exists
(SC-006, SC-007, SC-009, SC-012, SC-014, SC-017).

- [ ] T321 Full-scale load test against Staging
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `scripts/deploy/benchmark.ps1` (verify/extend — reused, no new file)
  - **Goal**: Re-run T198 at a larger, spec-Assumptions-scale load level against the now-fully-built Staging deployment (including the operations dashboard's own polling traffic).
  - **Acceptance Criteria**: SC-012/SC-014 met at the tested scale.
  - **Verification**: `pwsh scripts/deploy/benchmark.ps1 -Url <staging-url> -SustainedLoad`
  - **Dependencies**: T198, T320

- [ ] T322 [P] Stress test at auto-scale ceiling (final)
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: `scripts/deploy/benchmark.ps1` (verify/extend)
  - **Goal**: Re-run T204 with the complete feature deployed, confirming graceful degradation still holds with the operations dashboard and all scheduled jobs active.
  - **Acceptance Criteria**: No crash; documented degradation behavior matches T204's findings.
  - **Verification**: `pwsh scripts/deploy/benchmark.ps1 -Url <staging-url> -Stress`
  - **Dependencies**: T204, T320

- [ ] T323 Recovery test — full rollback timing (final)
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: N/A (extends T069, no new file)
  - **Goal**: Time a full rollback against Staging with the complete feature deployed, confirming SC-006's 10-minute budget holds end-to-end (dashboard click → API call → restored release).
  - **Acceptance Criteria**: Rollback completes and is confirmed via the dashboard within 10 minutes.
  - **Verification**: Manual timed Staging test
  - **Dependencies**: T069, T304

- [ ] T324 [P] Recovery test — disaster-recovery runbook timing (final)
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: N/A (extends T151, no new file)
  - **Goal**: Re-run T151's dry-run once more with the complete feature deployed, confirming the RTO 4h / RPO 1h targets (FR-029a) hold with realistic accumulated data volume.
  - **Acceptance Criteria**: Dry-run completes within budget.
  - **Verification**: Manual timed Staging dry-run
  - **Dependencies**: T151, T320

- [ ] T325 [P] Availability test — uptime measurement over a sustained window
  - **Priority**: Should-have
  - **User Story**: [US4]
  - **Files**: N/A (verification task using T108's `getUptimePercentage`)
  - **Goal**: Measure a real Staging deployment's uptime percentage over a multi-day window using `HealthCheck` history (T108), validating the health-check/alerting pipeline under real conditions rather than synthetic tests alone.
  - **Acceptance Criteria**: Uptime percentage computed and documented as a baseline.
  - **Verification**: Manual review after a multi-day observation window
  - **Dependencies**: T108, T280

- [ ] T326 [P] Reliability test — alert false-positive rate over a sustained window
  - **Priority**: Should-have
  - **User Story**: [US4]
  - **Files**: N/A (verification task)
  - **Goal**: Over the same observation window as T325, count `SystemNotification` rows created vs. genuine incidents, confirming SC-007's <5% false-positive budget holds under real (not synthetic) conditions.
  - **Acceptance Criteria**: Ratio documented and within budget; if not, T003's thresholds are revisited.
  - **Verification**: Manual review
  - **Dependencies**: T098, T280

- [ ] T327 [P] Reliability test — retention sweep runs correctly over multiple cycles
  - **Priority**: Should-have
  - **User Story**: [US5]
  - **Files**: N/A (verification task)
  - **Goal**: Confirm the daily retention sweep (T127) has run successfully every day over the observation window, with T130's "watch the watcher" check never firing a missed-run alert.
  - **Acceptance Criteria**: Confirmed via `BackupJob`/retention `lastRunAt` history.
  - **Verification**: Manual review
  - **Dependencies**: T127, T130, T280

- [ ] T328 [P] Performance optimization — final regression sweep
  - **Priority**: Should-have
  - **User Story**: [US7]
  - **Files**: N/A (verification task)
  - **Goal**: Re-run T178's benchmark script against Staging with the complete feature deployed, comparing to the pre-feature baseline to confirm no unexpected regression from the operations dashboard's own polling traffic.
  - **Acceptance Criteria**: No response-time regression beyond a documented acceptable margin.
  - **Verification**: `pwsh scripts/deploy/benchmark.ps1 -Url <staging-url>`
  - **Dependencies**: T178, T320

- [ ] T329 [P] Reliability test — Redis outage graceful degradation (final)
  - **Priority**: Must-have
  - **User Story**: [US8]
  - **Files**: N/A (extends T209, no new file)
  - **Goal**: Re-verify T209's graceful-degradation behavior against the real Upstash instance (not just local mocks) by temporarily revoking its credentials in a Staging test.
  - **Acceptance Criteria**: Core functionality (health check, rate-limited writes falling back to in-memory) continues to work.
  - **Verification**: Manual Staging test
  - **Dependencies**: T209, T279

- [ ] T330 [P] Reliability test — scheduled-job idempotency
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `src/app/api/ops/backups/run-due/__tests__/runDue.api.test.ts` (modify — add a double-invocation idempotency test), `src/app/api/ops/retention/run-due/__tests__/runDue.api.test.ts` (modify — same)
  - **Goal**: Confirm calling `run-due` twice in quick succession does not double-trigger an already-due job or double-delete already-swept rows (defends against a cron misfire/retry).
  - **Acceptance Criteria**: Second immediate call is a no-op relative to the first.
  - **Verification**: `npm run test`
  - **Dependencies**: T143, T127

- [ ] T331 [P] Reliability test — deployment-timeout check accuracy (final)
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: N/A (extends T268's test, no new file)
  - **Goal**: Confirm T268's stuck-deployment check does not false-positive on a legitimately slow (but progressing) deployment.
  - **Acceptance Criteria**: A deployment that emits `DeploymentEvent` rows periodically (even if slow) is not marked `FAILED`.
  - **Verification**: `npm run test`
  - **Dependencies**: T268

- [ ] T332 [P] Full quickstart.md re-run against Staging (final)
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting, all stories)
  - **Files**: N/A (extends T280/T299, no new file)
  - **Goal**: One final, complete quickstart.md walkthrough (all ten sections) against the fully-built Staging deployment before Production promotion.
  - **Acceptance Criteria**: All ten sections pass.
  - **Verification**: Manual walkthrough
  - **Dependencies**: T280, T320

- [ ] T333 [P] Connection pool exhaustion recovery test
  - **Priority**: Should-have
  - **User Story**: [US8]
  - **Files**: `src/features/operations/__tests__/connectionPooling.integration.test.ts` (modify — add an exhaustion-and-recovery scenario)
  - **Goal**: Confirm the application recovers automatically (no restart needed) once a temporary connection-pool-exhaustion condition clears.
  - **Acceptance Criteria**: Requests succeed again once pool pressure subsides, without manual intervention.
  - **Verification**: `npm run test`
  - **Dependencies**: T174

- [ ] T334 [P] Backup restore data-integrity spot check
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: N/A (extends T151's Staging dry-run, no new file)
  - **Goal**: During T324's re-run, explicitly verify restored data matches pre-backup state (not just "the restore command succeeded") — a data-integrity check, not just a process-completion check.
  - **Acceptance Criteria**: Spot-checked rows match exactly.
  - **Verification**: Manual Staging verification
  - **Dependencies**: T324

- [ ] T335 [P] Maintenance-mode reliability under real traffic
  - **Priority**: Should-have
  - **User Story**: [US10]
  - **Files**: N/A (verification task against Staging)
  - **Goal**: Activate maintenance mode against Staging under simulated real traffic (T321's load generator), confirming new requests are blocked and in-flight ones complete cleanly under load, not just in a quiet test environment.
  - **Acceptance Criteria**: Behavior matches T253's unit-level guarantee under load.
  - **Verification**: Manual Staging test combined with T321
  - **Dependencies**: T253, T321

- [ ] T336 [P] Notification delivery reliability under load
  - **Priority**: Could-have
  - **User Story**: [US4]
  - **Files**: N/A (verification task)
  - **Goal**: Confirm alert generation (T098) continues to function correctly while the system is under the load levels exercised in T321/T322 — alerting must not be the first thing to fail under stress.
  - **Acceptance Criteria**: Alerts still fire correctly during the load test window.
  - **Verification**: Manual review during T321/T322
  - **Dependencies**: T098, T321

- [ ] T337 [P] Document all Phase 14 findings
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive "Performance & Reliability Validation Results" section)
  - **Goal**: Record every measured result from T321–T336 (load-test numbers, uptime percentage, false-positive rate, rollback/restore timings) as a documented baseline for future comparison.
  - **Acceptance Criteria**: All measured values from this phase recorded.
  - **Verification**: Manual review
  - **Dependencies**: T321–T336

- [ ] T338 [P] Re-verify all spec Success Criteria (SC-001–SC-020) against measured results
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive SC-by-SC traceability table)
  - **Goal**: A table mapping each of spec.md's 20 Success Criteria to the specific task(s) and measured result that satisfies it.
  - **Acceptance Criteria**: All 20 SCs have a documented, evidenced status.
  - **Verification**: Manual review
  - **Dependencies**: T337

- [ ] T339 [P] Re-verify all spec Edge Cases are handled
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive edge-case traceability table)
  - **Goal**: A table mapping each of spec.md's 11 Edge Cases to the specific task(s) that address it (T158, T159, T206, T267, T268, T130, T205, T209, T330, etc.).
  - **Acceptance Criteria**: All 11 edge cases have a documented handling task.
  - **Verification**: Manual review
  - **Dependencies**: T337

- [ ] T340 Phase 14 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm performance/reliability validation is complete and the standard quality gates pass.
  - **Acceptance Criteria**: All commands below exit 0; T338/T339 traceability tables complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T321–T339

---

## Phase 15: Documentation

**Purpose**: README, Deployment Guide, Infrastructure Guide, Operations
Guide, Disaster Recovery Guide, Monitoring Guide, Security Guide,
Environment Guide (spec Accessibility section: "Deployment
documentation. Operational documentation.", SC-020).

- [ ] T341 Update root `README.md` with deployment/operations pointers
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `README.md` (modify — additive section; create if it does not yet exist)
  - **Goal**: A short "Deployment & Operations" section pointing to `docs/deployment.md`, `docs/environment-variables.md`, and this feature's quickstart.md, so a new contributor finds these docs from the repository root.
  - **Acceptance Criteria**: Section present with working links.
  - **Verification**: Manual review
  - **Dependencies**: T340

- [ ] T342 [P] Consolidate the Deployment Guide
  - **Priority**: Must-have
  - **User Story**: [US1] [US2] [US3]
  - **Files**: `docs/deployment.md` (modify — add a top-level table of contents covering every section added across Phases 1–14)
  - **Goal**: Ensure `docs/deployment.md` — now grown substantially across this feature — reads as one coherent Deployment Guide with a navigable structure, not an unordered append-log.
  - **Acceptance Criteria**: Table of contents present; every major section (Phases 2–3 existing content, plus this feature's additions) reachable from it.
  - **Verification**: Manual review
  - **Dependencies**: T037, T066, T075–T078, T150, T217, T238, T266, T292

- [ ] T343 [P] Write the Infrastructure Guide
  - **Priority**: Must-have
  - **User Story**: [US2]
  - **Files**: `docs/infrastructure.md` (new)
  - **Goal**: Consolidates Docker/Compose architecture (Phase 2), the ten new Prisma models (data-model.md), and the primary/alternative deployment targets (Phase 12) into one infrastructure-focused reference distinct from the step-by-step Deployment Guide.
  - **Acceptance Criteria**: Covers container architecture, database schema additions, and infrastructure topology.
  - **Verification**: Manual review
  - **Dependencies**: T045, T300

- [ ] T344 [P] Write the Operations Guide
  - **Priority**: Must-have
  - **User Story**: [US10]
  - **Files**: `docs/operations.md` (new)
  - **Goal**: Operator-facing guide to the `/operations` dashboard (Phase 13), maintenance mode, diagnostics, deployment/release management, and rollback — the day-to-day reference for whoever runs this platform in production.
  - **Acceptance Criteria**: A new operator can perform every US10 action using only this guide.
  - **Verification**: Manual review
  - **Dependencies**: T320

- [ ] T345 [P] Write the Disaster Recovery Guide
  - **Priority**: Must-have
  - **User Story**: [US6]
  - **Files**: `docs/disaster-recovery.md` (new)
  - **Goal**: Extracts and expands T150's runbook into a standalone, dedicated Disaster Recovery Guide (RTO/RPO targets, restore procedure, verification steps, escalation path) — significant enough (FR-029a is spec-critical) to warrant its own document rather than a `docs/deployment.md` subsection alone (which retains a summary + link).
  - **Acceptance Criteria**: Standalone document complete; `docs/deployment.md`'s T150 section updated to link here as the canonical source.
  - **Verification**: Manual review
  - **Dependencies**: T150, T324

- [ ] T346 [P] Write the Monitoring Guide
  - **Priority**: Must-have
  - **User Story**: [US4]
  - **Files**: `docs/monitoring.md` (new)
  - **Goal**: Consolidates health checks, metrics, alerting, and the `SystemStatusPanel`/`MetricsChart`/`NotificationsPanel` dashboard views (Phase 5, Phase 13) into one Monitoring Guide.
  - **Acceptance Criteria**: Covers what's monitored, how alerts fire, and how to read the dashboard.
  - **Verification**: Manual review
  - **Dependencies**: T115, T320

- [ ] T347 [P] Write the Security Guide
  - **Priority**: Must-have
  - **User Story**: [US9]
  - **Files**: `docs/security.md` (new)
  - **Goal**: Consolidates T238's Security Hardening section, the OWASP checklist (T229), and Constitution Principle VI's compliance summary (T248) into one Security Guide.
  - **Acceptance Criteria**: A security reviewer can assess this feature's posture from this document alone.
  - **Verification**: Manual review
  - **Dependencies**: T250

- [ ] T348 [P] Write the Environment Guide
  - **Priority**: Must-have
  - **User Story**: [US1]
  - **Files**: `docs/environment-guide.md` (new — distinct from the existing variable-reference `docs/environment-variables.md`, this is the narrative "how to think about environments" companion)
  - **Goal**: Narrative guide to the four-environment model (T074), when to use each, and how promotion between them works (Development → Testing → Staging → Production), cross-referencing `docs/environment-variables.md` for the exhaustive variable list rather than repeating it.
  - **Acceptance Criteria**: Complements, does not duplicate, `docs/environment-variables.md`.
  - **Verification**: Manual review
  - **Dependencies**: T090

- [ ] T349 [P] Cross-link all new guides from `docs/deployment.md`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive links)
  - **Goal**: `docs/deployment.md` remains the entry point; every new standalone guide (T343–T348) is linked from it, avoiding orphaned documentation.
  - **Acceptance Criteria**: All six new documents linked.
  - **Verification**: Manual review
  - **Dependencies**: T343–T348

- [ ] T350 [P] Document every new npm script
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `README.md` (modify — additive scripts table)
  - **Goal**: Document `stack:up`/`stack:down`/`stack:dev` (T036) alongside the existing `dev`/`build`/`test`/`lint`/`test:db:up`/`test:db:down` scripts already listed (if a scripts table exists) or newly added.
  - **Acceptance Criteria**: Every `package.json` script has a one-line description.
  - **Verification**: Manual review
  - **Dependencies**: T036, T341

- [ ] T351 [P] Document every new repository file's public API
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All eight new repository files under `src/server/repositories/` (verify — JSDoc single-line summary per exported function, Constitution Principle VIII)
  - **Goal**: Confirm every exported function across `deploymentRepository.ts`, `healthRepository.ts`, `metricRepository.ts`, `logRepository.ts`, `opsBackupRepository.ts`, `maintenanceRepository.ts`, `notificationRepository.ts`, `retentionRepository.ts` carries a JSDoc summary.
  - **Acceptance Criteria**: 100% coverage, spot-checked.
  - **Verification**: Manual review
  - **Dependencies**: T056, T091, T092, T116, T141, T251, T097, T126

- [ ] T352 [P] Document every new hook/service's public API
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/operations/services/opsService.ts`, all hook files under `src/features/operations/hooks/` (verify — JSDoc summaries)
  - **Goal**: Same reasoning as T351, applied to the client layer.
  - **Acceptance Criteria**: 100% coverage, spot-checked.
  - **Verification**: Manual review
  - **Dependencies**: T111, T112, T152, T257, T258

- [ ] T353 [P] Write `src/features/operations/README.md`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/operations/README.md` (new)
  - **Goal**: Feature-level README per Constitution Principle VIII — purpose, public API (barrel exports), a usage example, and known limitations (the interim `assertIsOperator` gate, the documentation-only alternative deployment targets), matching every existing feature module's README convention.
  - **Acceptance Criteria**: Present, follows the established feature-README format.
  - **Verification**: Manual review
  - **Dependencies**: T320

- [ ] T354 [P] Document Complexity Tracking resolution status
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (modify — additive, tracks plan.md's two Complexity Tracking items' resolution status)
  - **Goal**: A living note on the `assertIsOperator`→`009` swap and the `opsBackupRepository.ts` naming decision, so future readers understand why these exist without re-reading plan.md in full.
  - **Acceptance Criteria**: Present, accurate as of this feature's completion.
  - **Verification**: Manual review
  - **Dependencies**: T271, T141

- [ ] T355 [P] Update `docs/environment-variables.md` table of contents
  - **Priority**: Should-have
  - **User Story**: [US1]
  - **Files**: `docs/environment-variables.md` (modify — additive)
  - **Goal**: With this feature's additions (T019), the file now spans four phases' worth of variables — add a short table of contents for navigability.
  - **Acceptance Criteria**: Present.
  - **Verification**: Manual review
  - **Dependencies**: T019

- [ ] T356 [P] Verify all documentation cross-references resolve
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All `docs/*.md` files (verify — every internal link)
  - **Goal**: A final link-check pass across every markdown file touched or created by this feature.
  - **Acceptance Criteria**: Zero broken internal links.
  - **Verification**: Manual/automated link-check pass
  - **Dependencies**: T341–T355

- [ ] T357 [P] Update `CLAUDE.md`'s Spec Kit pointer (verify, no change expected)
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `CLAUDE.md` (verify — already points at `specs/010-deployment-enterprise/plan.md` since `/speckit-plan`; no change needed here, this task exists to explicitly confirm it wasn't accidentally reverted)
  - **Acceptance Criteria**: Confirmed pointing at the correct plan file.
  - **Verification**: Manual review
  - **Dependencies**: None

- [ ] T358 [P] Final documentation quality pass
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: All new/modified `docs/*.md` files
  - **Goal**: A single editorial pass for consistency of tone/formatting across every document this feature touched (matching the existing `docs/deployment.md`/`docs/environment-variables.md` style already established).
  - **Acceptance Criteria**: Consistent heading levels, table formatting, and terminology (e.g., "operator" used consistently, not mixed with "admin").
  - **Verification**: Manual review
  - **Dependencies**: T356

- [ ] T359 [P] Documentation completeness self-check against SC-020
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/deployment.md` (verify)
  - **Goal**: Confirm SC-020 ("a new operator can follow deployment/operational documentation without direct implementer assistance") is satisfied — walk through onboarding a hypothetical new operator using only the written docs.
  - **Acceptance Criteria**: Every US1–US10 capability has a documented, followable procedure.
  - **Verification**: Manual walkthrough
  - **Dependencies**: T358

- [ ] T360 Phase 15 Checkpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm documentation is complete and the standard quality gates pass.
  - **Acceptance Criteria**: All commands below exit 0.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T341–T359

---

## Phase 16: Final Quality Gate

**Purpose**: Full-spectrum verification across every quality dimension
before this feature is considered complete (Constitution Principle X;
plan.md Quality Gates).

- [ ] T361 TypeScript verification (full repository)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Zero TypeScript errors across the entire repository, including every file this feature added.
  - **Acceptance Criteria**: Exit code 0.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T360

- [ ] T362 [P] ESLint verification (full repository)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Zero ESLint errors/warnings across the entire repository.
  - **Acceptance Criteria**: Exit code 0.
  - **Verification**: `npx eslint src --max-warnings 0`
  - **Dependencies**: T360

- [ ] T363 [P] Unit test suite (full repository)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Every unit test (hooks, pure utilities, repositories) passes.
  - **Acceptance Criteria**: Exit code 0, zero skipped tests outside documented skip-if-unavailable cases.
  - **Verification**: `npm run test`
  - **Dependencies**: T360

- [ ] T364 [P] Integration test suite (full repository)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Every integration test added across Phases 2–14 passes together, not just individually.
  - **Acceptance Criteria**: Exit code 0.
  - **Verification**: `npm run test`
  - **Dependencies**: T360

- [ ] T365 [P] Database tests (schema + migration + repository)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: `prisma validate`/`generate`/`migrate deploy` all succeed against a fresh database; every repository test passes against the real ephemeral PostGIS test database.
  - **Acceptance Criteria**: All three Prisma commands and the full repository test suite pass.
  - **Verification**: `npx prisma validate && npx prisma generate && npx prisma migrate deploy`; `npm run test`
  - **Dependencies**: T360

- [ ] T366 [P] Deployment tests (Docker + CI/CD)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Both Dockerfiles build; `docker-compose.yml`/`docker-compose.dev.yml` validate; `ci.yml`/`deploy.yml` pass `actionlint` and have each been exercised at least once against a real PR/deploy (T068, T069, T280).
  - **Acceptance Criteria**: All pass.
  - **Verification**: `docker build -t spatialmind-ai:prod . && docker build -f Dockerfile.dev -t spatialmind-ai:dev . && docker compose config --quiet`
  - **Dependencies**: T360, T068, T069, T280

- [ ] T367 [P] Performance tests (final)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Bundle analyzer clean (`@upstash/redis` server-only); Lighthouse Accessibility ≥90 on `/operations`; T337's recorded performance baselines within acceptable bounds.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `ANALYZE=true npm run build`; Lighthouse run
  - **Dependencies**: T360, T320, T337

- [ ] T368 [P] Security tests (final)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: `npm audit --audit-level=high` clean for new dependencies; T229's OWASP checklist fully green; T228's secrets-handling audit finds zero issues.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm audit --audit-level=high`
  - **Dependencies**: T360, T229, T228

- [ ] T369 [P] Accessibility verification (final)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Every Phase 13 component's axe + RTL a11y assertions pass (T316); Lighthouse Accessibility ≥90 on `/operations` (Constitution Principle X).
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm run test`; Lighthouse run
  - **Dependencies**: T316, T320

- [ ] T370 Production build verification (final)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: `next build` succeeds cleanly with zero errors/warnings, producing the standalone output T021's Dockerfile depends on.
  - **Acceptance Criteria**: Exit code 0.
  - **Verification**: `npm run build`
  - **Dependencies**: T361, T362, T363

- [ ] T371 [P] Release verification — end-to-end release/rollback cycle (final)
  - **Priority**: Must-have
  - **User Story**: [US3]
  - **Files**: N/A (verification only)
  - **Goal**: One final, complete release → verify → rollback → re-release cycle against Staging, confirming `ReleaseVersion`/`DeploymentHistory`/`DeploymentEvent` tracking is accurate throughout.
  - **Acceptance Criteria**: Cycle completes with an accurate audit trail.
  - **Verification**: Manual Staging cycle
  - **Dependencies**: T323, T280

- [ ] T372 [P] Final documentation review (cross-check against this checklist)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (verification only)
  - **Goal**: Confirm T338/T339's SC/Edge-Case traceability tables and T359's SC-020 self-check are all still accurate as of the final implementation state (nothing drifted during Phases 14–16).
  - **Acceptance Criteria**: No drift found.
  - **Verification**: Manual review
  - **Dependencies**: T338, T339, T359

- [ ] T373 [P] Project completion checklist — spec.md requirement traceability
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/010-deployment-enterprise/checklists/requirements.md` (verify — re-confirm all items still pass now that implementation is complete, not just at spec-approval time)
  - **Goal**: Re-run the original spec-quality checklist's intent against the *implemented* feature: every FR-001–FR-052 has a corresponding implemented capability, traceable via T338.
  - **Acceptance Criteria**: 100% FR coverage confirmed.
  - **Verification**: Manual cross-check against spec.md's Functional Requirements
  - **Dependencies**: T338

- [ ] T374 [P] Constitution Check re-verification (post-implementation)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/010-deployment-enterprise/plan.md` (verify — Constitution Check table, no edit expected unless a genuine deviation is found)
  - **Goal**: Re-confirm all ten Constitution Principles still PASS against the actually-implemented code, not just the planned design (plan.md's Constitution Check was verified at design time; this re-verifies at completion time).
  - **Acceptance Criteria**: All ten principles PASS; any deviation found is documented in Complexity Tracking, not silently accepted.
  - **Verification**: Manual review against `.specify/memory/constitution.md`
  - **Dependencies**: T370

- [ ] T375 Final enterprise validation — full quickstart.md + Constitution + Success Criteria sign-off
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A (final sign-off task)
  - **Goal**: The single closing task: confirm quickstart.md's ten sections all pass (T332), the Constitution re-check (T374) is clean, all 20 Success Criteria are met (T338), all 11 Edge Cases are handled (T339), and every checkpoint from Phases 1–16 is green — this feature is production-ready, scalable, secure, observable, supports automated deployment/rollback/disaster recovery, and reuses the existing application architecture (spec.md's own closing Success Criteria framing).
  - **Acceptance Criteria**: All of the above confirmed true simultaneously.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && npx prisma validate && npx prisma generate && npx prisma migrate deploy`
  - **Dependencies**: T332, T338, T339, T361–T374

---

## Dependencies & Execution Order

- **Phase 1 (Foundation)** blocks every other phase — schema, env
  validation, health checker, logger extension, cache wrapper, rate
  limiter extension, error vocabulary, and the `operations` module
  scaffold are depended on throughout.
- **Phase 2 (Deployment Infrastructure)** depends on Phase 1; Phase 3's
  Docker-build CI job depends on Phase 2's Dockerfile/scripts.
- **Phase 3 (CI/CD)** depends on Phases 1–2; introduces
  `deploymentRepository.ts` and `/api/system/status`, both depended on by
  Phases 5, 11, 12, 13.
- **Phase 4 (Environment Management)** depends on Phase 1's `env.ts`; can
  proceed in parallel with Phase 2/3 once Phase 1 is done.
- **Phases 5 (Monitoring), 6 (Logging), 7 (Backup & Recovery)** each
  depend on Phase 1 (schema, health checker, logger) and Phase 3's
  `/api/system/status`; they can proceed largely in parallel with each
  other once those are done.
- **Phase 8 (Performance)** depends on Phase 1's cache wrapper and Phase
  5/7's endpoints (to cache); Phase 9 (Scalability) depends on Phase 1's
  Redis-backed rate limiter and Phase 8's connection-pooling work.
- **Phase 10 (Security Hardening)** depends on nearly every prior
  server-side phase (it hardens what already exists) — sequenced after
  Phases 1–9.
- **Phase 11 (Production Operations)** depends on Phase 3
  (`deploymentRepository`), Phase 5/6/7 (diagnostics consolidation), and
  introduces `maintenanceRepository.ts`/`middleware.ts`, both new
  dependencies for Phase 13's UI.
- **Phase 12 (Cloud Deployments)** depends on Phase 2 (Docker artifacts)
  and Phase 3 (`vercel.ts`'s deploy job) — primarily a configuration and
  documentation phase.
- **Phase 13 (UI Components)** depends on nearly every server-side
  phase's client-service/hook work (Phases 5–7, 11) — it is the
  integration point where all the API contracts become a usable
  dashboard.
- **Phase 14 (Performance & Reliability)** depends on the complete
  feature (Phases 1–13) being deployed to Staging.
- **Phase 15 (Documentation)** can start incrementally alongside every
  phase (many tasks are additive doc sections placed right after the
  code they describe) but its consolidation/completeness tasks (T342,
  T356, T359) depend on everything else being done.
- **Phase 16 (Final Quality Gate)** depends on all fifteen prior phases.

## Parallel Example: Phases 5, 6, 7 (post-Phase 3)

```text
# Once T054 (/api/system/status) and Phase 1 land, these three phases'
# repository-layer tasks can run in parallel (different files, no
# cross-dependency until their respective diagnostics/documentation tasks):
T091 [P] healthRepository.ts
T092 [P] metricRepository.ts
T116 [P] logRepository.ts
T141 [P] opsBackupRepository.ts
```

## Parallel Example: Phase 1 constants/types/utilities

```text
T003 [P] opsConstants.ts
T004 [P] operations.types.ts
T008 [P] healthChecker.ts
T009 [P] logger.ts persist() shell
T010 [P] cache.ts
T013 [P] corsHeaders.ts
T015 [P] queryKeys.ts
T018 [P] @upstash/redis dependency
```

## Implementation Strategy

**MVP scope**: Phases 1–4 (Foundation, Deployment Infrastructure, CI/CD,
Environment Management) deliver a working, containerized, CI/CD-gated
application with validated environments — US1/US2/US3, the three highest-
priority user stories — before any monitoring/logging/backup/performance/
scalability/security/operations work begins. This is independently
valuable: a team could stop after Phase 4 and already have "the app
builds, tests, and deploys reliably across four environments," which is
the foundational promise of "enterprise deployment" even before the
observability and hardening layers exist.

**Incremental delivery after MVP**: Phases 5–11 each deliver one
additional, independently-testable user story (US4–US10) on top of the
MVP, in the priority order spec.md establishes. Phase 12 (Cloud
Deployments) can be done in parallel with Phases 5–11 once Phase 2/3 are
complete, since it is primarily configuration/documentation, not new
application code. Phase 13 (UI) is sequenced after Phases 5–11 because it
is the dashboard that surfaces all of their data — building it earlier
would mean building against contracts that don't exist yet. Phases 14–16
are validation/documentation/gate phases that apply to the whole,
completed feature.

**Recommended team split** (if parallelizing across people): one track
owns Phases 1–4 (foundation/infra/CI-CD/environments) first since
everything else depends on it; once done, up to four more tracks can take
Phases 5/6, 7, 8/9, and 10 in parallel, converging on Phase 11 (which
needs Phase 5/6/7's diagnostics) and then Phase 13 (which needs
everything).

## Notes

- `[P]` tasks touch different files with no unresolved dependency and can
  run in parallel within their phase.
- Every task lists exact file paths — no task requires guessing a
  location.
- Commit after each task or logical group of `[P]` tasks, per this
  repository's Constitution Principle IX (Conventional Commits, feature
  branch).
- Avoid: vague tasks, same-file conflicts marked `[P]` (none exist in
  this roadmap — every `[P]` pair below has been checked for file
  overlap), and any task that would modify a previously delivered
  feature's functional behavior (FR-051) — none exists in this roadmap;
  every "modify" task above touches only files this feature itself
  introduced or an explicitly additive touch-point (`next.config.ts`'s
  `output` field, `Navbar.tsx`'s one nav-link, `logger.ts`'s new method,
  `rateLimiter.ts`'s new mode, `apiError.ts`'s new codes,
  `handleRouteError.ts`'s new log call, `prisma/schema.prisma`'s new
  models) — each called out explicitly at its task above as additive-only.
- Total: **375 tasks** (T001–T375) across 16 phases, covering all 10 user
  stories (US1–US10) from spec.md, all 52 functional requirements
  (FR-001–FR-052), all 20 success criteria (SC-001–SC-020), and all 11
  edge cases.
