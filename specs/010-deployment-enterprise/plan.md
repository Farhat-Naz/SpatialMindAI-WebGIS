# Implementation Plan: Enterprise Deployment & Production Operations

**Branch**: `010-deployment-enterprise` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-deployment-enterprise/spec.md`

---

## Summary

This plan delivers enterprise deployment, DevOps, monitoring, operations,
scalability, and production-infrastructure capability around the existing
SpatialMindAI-WebGIS application — all ten user stories from the approved
spec (Environment Management, Containerized Packaging, CI/CD, Monitoring,
Logging, Backup & Disaster Recovery, Performance Optimization, Scalability,
Security Hardening, Production Operations) — **without redesigning any
previously delivered feature**. The technical approach is deliberately
additive: ten new, platform-wide operational Prisma models; a new
`src/features/operations/` client module; ~20 new Route Handlers under
`src/app/api/ops/*` and `src/app/api/system/status`; new Docker/Docker
Compose/GitHub Actions artifacts; and a single primary production hosting
platform (Vercel + Supabase Postgres/PostGIS, per the spec's resolved
clarification) chosen so that horizontal scaling, load balancing, CDN
delivery, and compression are inherited from the platform rather than
built. Every existing repository, service, hook, store, contract, Route
Handler, and shared component is reused unmodified; the one exception —
`next.config.ts`'s security headers — is explicitly *not* touched (research.md
§11), since it already satisfies this spec's header requirements.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged)

**Primary Dependencies**:
- next@16, react@19/react-dom@19, @tanstack/react-query@5, zustand@5, zod,
  Prisma (existing — reused, no new state/validation/ORM library)
- shadcn/ui (existing — `alert-dialog`/`alert`/`toggle`/`toggle-group`/
  `slider`/`context-menu`, already vendored per current `git status`, cover
  every new operations UI need)
- Recharts (introduced by `008-dashboard-analytics`'s plan precedent,
  reused unchanged for `MetricsChart.tsx` — no second charting library)
- **Two new npm dependencies**: `@upstash/redis` (research.md §12 — REST-
  based Redis client compatible with serverless without a persistent
  connection pool, used by the rate limiter's new Redis mode and the new
  cache wrapper) and `node-cron`-equivalent is **not** needed — scheduling
  is handled by the primary platform's Cron feature calling HTTP endpoints
  (research.md §4/§17), not an in-process scheduler. So exactly **one** new
  runtime dependency: `@upstash/redis`.

**Storage**: Ten new, additive Prisma models (data-model.md) —
`ReleaseVersion`, `DeploymentHistory`, `DeploymentEvent`, `HealthCheck`,
`SystemMetric`, `LogEntry`, `BackupJob`, `BackupHistory`,
`MaintenanceWindow`, `SystemNotification` — plus eight new enums. One
migration. No existing model (`User`, `Project`, `Layer`, `Feature`,
`FeatureAttribute`, `FeatureStyle`, `AnalysisRun`) changes.

**Testing**: Vitest + React Testing Library (unchanged). New Route Handlers
tested against the real ephemeral PostGIS test database (existing
`docker-compose.test.yml` pattern), skip-if-unavailable, per every prior
feature's established pattern. New tiers specific to this feature: Docker
build validation, CI workflow validation (`act`-style or a dedicated
smoke-test job), health-check tests (each component's degraded/unhealthy
paths), backup/restore tests, and disaster-recovery runbook verification.

**Target Platform**: Vercel (primary production target for the Next.js
application) + Supabase Postgres/PostGIS (primary production database) —
research.md §13. Docker/Docker Compose remain the local-development and
documented-alternative-target packaging mechanism (Railway, AWS, Azure,
Google Cloud, self-hosted Linux — Deployment Targets table below), but
none of those alternatives is built or CI-tested as a first-class target in
this feature, matching the spec's resolved "single primary platform"
clarification.

**Project Type**: Web application — single Next.js app. Adds one new
top-level client feature module, `src/features/operations/`, following the
exact internal structure every existing feature module uses. Adds one new
root-level `middleware.ts` for the maintenance-mode gate (research.md §20)
— if `009-administration-security` has landed its own `middleware.ts` by
the time this feature is implemented, the maintenance-mode check is added
to that existing file as one additional, composed check rather than a
second competing `middleware.ts` (Next.js permits only one); if `009` has
not yet landed, this feature's `middleware.ts` is the first of its kind,
structured so `009`'s auth-gate check can be added alongside it later
without conflict.

**Performance Goals** (from spec Success Criteria):
- SC-002: new environment stood up and confirmed healthy in under 30 min.
- SC-003: local stack healthy in under 5 min.
- SC-005: production deploy in under 15 min from approval.
- SC-006: rollback in under 10 min, no rebuild.
- SC-007: alerted within 5 min of a genuine degradation, <5% false positives.
- SC-012/SC-014: sustains the target concurrent-user scale (Assumptions)
  with capacity added automatically and no dropped requests.

**Constraints**:
- No redesign of any previously delivered feature (spec FR-051) — enforced
  by construction: every file this plan touches is new, except
  `next.config.ts` (explicitly unchanged) and `Navbar.tsx` (one additive
  nav-link line, mirroring `009`'s own precedent for the identical touch).
- Single primary production hosting platform (spec FR-052, resolved).
- RTO 4h / RPO 1h for Production disaster recovery (spec FR-029a, resolved).
- Maintenance mode blocks new requests only, lets in-flight operations
  finish (spec FR-049a, resolved).
- No Kubernetes, no Terraform, no billing/cost-management functionality, no
  design choice that creates cloud vendor lock-in (spec Out of Scope) — the
  primary-platform choice is implemented behind the same `DATABASE_URL`/
  Prisma/Docker-image abstractions already in place, so switching platforms
  later remains a configuration change, not a rewrite.

**Scale/Scope**: Ten new Prisma models, eight new enums, six new repository
files (research.md/data-model.md — one repository per concern), ~20 new
Route Handler files under `src/app/api/ops/*` + `src/app/api/system/status`,
one new Zod contract file (`ops.schema.ts`), one new client feature module
(`src/features/operations/` — ~10 components, ~14 hooks across a handful of
files, 1 service file + `queryKeys.ts`, 1 store), one new `middleware.ts`,
two new Dockerfiles, two new Docker Compose files, two new GitHub Actions
workflows, one new npm dependency (`@upstash/redis`).

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design —
see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | New client code lives entirely in `src/features/operations/` with its own barrel; six new repository files each own their respective concern; Route Handlers are the only code touching Prisma (all six repositories called only from `src/app/api/**`) |
| II. Type Safety | ✅ PASS | New Zod schema file (`ops.schema.ts`) follows the established per-concern-file pattern; every new Prisma enum has a matching Zod schema; zero `any` |
| III. Database | ✅ PASS | Purely additive migration (ten new models, no existing model/index/column touched); every new time-series model has an appropriate B-tree index (data-model.md); no new geometry column, so no new GiST index is needed |
| IV. GIS Principles | ✅ PASS | This feature introduces no geometry column and no spatial computation of any kind — operational/ops data only |
| V. Performance | ✅ PASS | The one new dependency (`@upstash/redis`) is server-only (rate limiter, cache wrapper, scheduled-endpoint handlers) — never imported by client components — verified via bundle analyzer (Quality Gates); time-series tables are indexed for their actual query patterns; retention sweeps keep them bounded in size |
| VI. Security | ✅ PASS | Secrets remain environment-variable-only, provisioned via the primary platform's managed store (research.md §9); no secret is ever written into `LogEntry.context` (enforced at the one repository function permitted to write it); TLS/headers are explicitly reused, not reimplemented |
| VII. Testing | ✅ PASS | Unit/store/hook/API/integration tiers planned per user story (Testing Strategy below), plus new Docker/CI/health/backup/recovery tiers specific to this feature |
| VIII. Documentation | ✅ PASS | spec→plan→(tasks→implementation→tests→docs) lifecycle in progress; this plan itself is the deployment/operational documentation spec.md's Accessibility section requires (SC-020) |
| IX. Git Workflow | ✅ PASS (process) | Standard workflow applies; this feature's own CI/CD (US3) is what will enforce it going forward for every subsequent feature too |
| X. Quality Gates | ✅ PASS | TypeScript/ESLint/tests/`next build` all gate merge; the new dependency triggers a mandatory bundle-analyzer confirmation it is server-only; this feature is also what *automates* Quality Gates enforcement platform-wide (US3) |

**No violations requiring justification beyond the two items in Complexity
Tracking below** (both are sequencing/naming notes, not principle
violations).

**Re-check after Phase 1 design**: Confirmed still PASS. `data-model.md` and
`contracts/` confirm the scope stays at ten new models, one new npm
dependency, and one new client feature module — no further deviation
surfaced during design.

---

## Project Structure

### Documentation (this feature)

```text
specs/010-deployment-enterprise/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── api-contracts.md
│   ├── repository-api.md
│   └── client-api.md
└── tasks.md               # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root) — additions/changes only

```text
prisma/
└── schema.prisma                                    # MODIFIED (additive): 10 new models + 8 new enums

Dockerfile                                             # NEW — multi-stage production image
Dockerfile.dev                                         # NEW — development image
docker-compose.yml                                     # NEW — app + postgres + redis, healthchecks, volumes, 2 networks
docker-compose.dev.yml                                 # NEW — dev override (bind mount, Dockerfile.dev)
.dockerignore                                           # NEW

.github/workflows/ci.yml                                 # NEW — lint, typecheck, test, build
.github/workflows/deploy.yml                               # NEW — migrate deploy + deploy + DeploymentHistory recording

middleware.ts                                                # NEW (or composed into 009's, if it lands first) — maintenance-mode gate

vercel.ts                                                      # NEW — cron schedules (metrics sample, backups run-due, retention run-due)

src/
├── server/
│   ├── config/
│   │   └── env.ts                                              # NEW — Zod-validated environment schema, fail-fast at module load
│   ├── ops/
│   │   └── healthChecker.ts                                     # NEW — shared check function (app/db/api), used by /api/system/status and (later) 009's /api/health
│   ├── cache/
│   │   └── cache.ts                                              # NEW — generic get/set/invalidate wrapper over @upstash/redis
│   ├── security/
│   │   ├── rateLimiter.ts                                        # MODIFIED (additive) — Redis-backed mode alongside existing in-memory mode
│   │   └── corsHeaders.ts                                        # NEW
│   └── repositories/
│       ├── deploymentRepository.ts                                # NEW
│       ├── healthRepository.ts                                     # NEW
│       ├── metricRepository.ts                                      # NEW
│       ├── logRepository.ts                                          # NEW
│       ├── opsBackupRepository.ts                                     # NEW (namespaced — see Complexity Tracking)
│       ├── maintenanceRepository.ts                                    # NEW
│       ├── notificationRepository.ts                                    # NEW
│       └── retentionRepository.ts                                        # NEW
│
├── app/api/
│   ├── system/status/route.ts                                              # NEW
│   └── ops/
│       ├── metrics/route.ts                                                  # NEW
│       ├── metrics/sample/route.ts                                            # NEW (scheduled)
│       ├── diagnostics/route.ts                                                # NEW
│       ├── deployments/route.ts                                                 # NEW
│       ├── deployments/[deploymentId]/route.ts                                   # NEW
│       ├── deployments/[deploymentId]/events/route.ts                             # NEW
│       ├── deployments/[deploymentId]/rollback/route.ts                            # NEW
│       ├── releases/route.ts                                                         # NEW
│       ├── backups/route.ts                                                           # NEW
│       ├── backups/[backupJobId]/history/route.ts                                       # NEW
│       ├── backups/run-due/route.ts                                                       # NEW (scheduled)
│       ├── backups/[backupJobId]/restore/route.ts                                          # NEW
│       ├── maintenance/route.ts                                                              # NEW
│       ├── maintenance/[id]/route.ts                                                          # NEW
│       ├── notifications/route.ts                                                              # NEW
│       ├── notifications/[id]/acknowledge/route.ts                                               # NEW
│       ├── logs/route.ts                                                                          # NEW
│       ├── config/validate/route.ts                                                                # NEW
│       └── retention/run-due/route.ts                                                                # NEW (scheduled)
│
├── shared/
│   ├── contracts/
│   │   └── ops.schema.ts                                                                              # NEW
│   ├── errors/apiError.ts                                                                              # MODIFIED (additive): + MAINTENANCE_ACTIVE, FORBIDDEN (if not already added by 009)
│   └── lib/logger.ts                                                                                    # MODIFIED (additive): + persist() method, existing methods unchanged
│
└── features/operations/                                                                                  # NEW module
    ├── components/  # OperationsDashboard, SystemStatusPanel, DeploymentHistoryPanel, DeploymentEventsTimeline, RollbackConfirmDialog, BackupManagementPanel, MaintenanceModePanel, DiagnosticsPanel, NotificationsPanel, LogExplorer, MetricsChart
    ├── hooks/       # useSystemStatus, useDiagnostics, useDeployments, useDeploymentEvents, useRollbackDeployment, useReleases, useBackupJobs, useBackupHistory, useRequestRestore, useMaintenanceStatus, useActivateMaintenance, useDeactivateMaintenance, useNotifications, useAcknowledgeNotification, useLogs, useMetrics
    ├── services/{opsService.ts,queryKeys.ts}
    ├── store/operationsStore.ts
    ├── types/operations.types.ts
    └── index.ts

src/features/dashboard/components/Navbar.tsx                          # MODIFIED: + one "Operations" nav entry (additive, mirrors 009's own precedent for this file)
src/app/operations/page.tsx                                             # NEW — mounts <OperationsDashboard />
```

**Structure Decision**: One new client feature module
(`src/features/operations/`), distinct from `009`'s planned
`src/features/admin/`, for the same separation-of-concerns reasoning `009`
itself applied when splitting `auth`/`admin` — operations (deployments,
releases, maintenance, diagnostics) is a different concern and potentially
different operator audience than identity/RBAC administration. Server-side:
eight new repository files (one per concern, data-model.md), one new
`middleware.ts` (or a composed addition to `009`'s), ~20 new Route Handler
files, one new Zod contract file. `next.config.ts` is explicitly untouched.
`Navbar.tsx` gets exactly one additive line, the same scale of touch `009`'s
own plan already made to this shared shell component.

---

## Architecture

### Deployment pipeline

`.github/workflows/ci.yml` (lint/typecheck/test/build, parallel jobs) gates
every PR; `.github/workflows/deploy.yml` runs only on `main` after `ci.yml`
succeeds, executing `prisma migrate deploy` before the new version receives
traffic (reusing `003`'s already-documented "migrate before build" ordering
verbatim), then deploying to the primary platform, then calling
`POST /api/ops/deployments` and `PATCH /api/ops/deployments/:id` to record
the `ReleaseVersion`/`DeploymentHistory`/`DeploymentEvent` trail
(research.md §4–§5).

### Infrastructure layer

Vercel (application, Fluid Compute auto-scaling, edge network for CDN/
compression/TLS) + Supabase Postgres/PostGIS (pooled connection for runtime,
direct connection for migrations) + Upstash Redis (rate limiting, shared
cache) is the production infrastructure layer (research.md §13). Docker/
Docker Compose is the local-parity and documented-alternative-target
packaging layer (research.md §2–§3).

### Monitoring services

`healthChecker.ts` is the single function both `/api/system/status` and
(once implemented) `009`'s `/api/health` call — one health-probing
implementation, two consumers. `metricRepository.ts` + the scheduled
`/api/ops/metrics/sample` endpoint populate `SystemMetric`; a degraded/
unhealthy `HealthCheck` or a breached metric threshold creates a
`SystemNotification` (`notificationRepository.createNotification`),
satisfying FR-018's alert generation/routing without a separate alerting
service.

### Logging services

`logger.ts`'s new `persist()` method writes to `LogEntry` via
`logRepository.recordLogEntry` — called from `handleRouteError` (all
`error`-level entries) and from new Route Handlers for security/audit-
relevant events this feature's own scope produces (e.g., maintenance-mode
activation, rollback execution). stdout/stderr structured logging
(existing, unchanged) remains the first tier of centralization via the
primary platform's own log capture.

### Backup services

`opsBackupRepository.ts` + the scheduled `/api/ops/backups/run-due`
endpoint trigger the managed database provider's native backup/PITR API
(research.md §17) and record `BackupHistory`. Restore is a documented
runbook (quickstart.md, plan.md Risks) initiated via
`POST /api/ops/backups/:backupJobId/restore`, which records intent/audit
trail rather than synchronously executing an infrastructure-level restore
in-process.

### Health services

See "Monitoring services" above — `healthChecker.ts` is shared, not
duplicated, across this feature and `009`'s planned health endpoint.

### Configuration management / environment loading

`src/server/config/env.ts` (research.md §1) is the single Zod-validated
environment schema, parsed once at module load, imported by every server
module that needs a `process.env` value going forward — existing direct
`process.env.X` reads elsewhere (e.g., `src/features/search/api/config.ts`)
are **not** retrofitted to use it (would be a redesign of working code);
new code introduced by this feature and future features are expected to
route through it.

### Secrets handling

Primary platform's managed environment variables (research.md §9) — no
application code manages secret storage or rotation directly.

### Operational tooling

`src/features/operations/` (client dashboard) + `vercel.ts`'s `crons`
config (scheduled endpoint triggers) + the GitHub Actions workflows are the
three pieces of "operational tooling" this feature ships: a UI for humans,
a scheduler for recurring jobs, and a pipeline for delivering code changes.

### Operator Authorization

Every operator-only endpoint (all of `/api/ops/*` except the `*/run-due`
scheduled endpoints, which use `CRON_SECRET` bearer auth instead) calls
`getCurrentUser(request)` (existing, unchanged seam) and then a small,
local `assertIsOperator(user)` check
(`src/server/ops/assertIsOperator.ts`, new). Until `009`'s
`assertSystemPermission`/`SystemRole` lands, `assertIsOperator` is a
minimal, documented interim check (mirrors the interim-seam precedent
`getCurrentUser` itself already established for authentication, research.md
Decision 6 in `003`'s plan) — see Complexity Tracking for the explicit
forward-dependency this creates on `009`, resolved automatically once `009`
ships by `assertIsOperator` delegating to `assertSystemPermission(userId,
"manage_operations")` instead.

---

## Database Changes

See data-model.md in full. Summary: ten new models
(`ReleaseVersion`, `DeploymentHistory`, `DeploymentEvent`, `HealthCheck`,
`SystemMetric`, `LogEntry`, `BackupJob`, `BackupHistory`,
`MaintenanceWindow`, `SystemNotification`) and eight new enums, in one
migration. No existing model, index, or relation is altered. Seed data: one
`BackupJob` row per environment (documented defaults, quickstart.md).

## Performance

- **Time-series write volume**: `HealthCheck`/`SystemMetric` are the
  highest-write-frequency new tables; both are indexed exactly for their
  read pattern (`[component/metricName, timestamp]`) and bounded by the
  retention sweep (data-model.md), so they never grow unbounded.
- **`LogEntry` write path**: `logger.persist()` is called only for
  `error`-level and security/audit-relevant events (not every request) —
  no per-request write-amplification beyond what `logger.request()` already
  does to stdout today.
- **Redis-backed rate limiting**: `@upstash/redis`'s REST protocol adds one
  network round-trip per rate-limit check on write endpoints; this is an
  explicit, accepted trade-off for closing the existing in-memory limiter's
  multi-instance gap (research.md §12/§14) — write endpoints, not read-heavy
  ones, so the added latency does not affect the platform's read-heavy
  spatial query paths.
- **Connection pooling**: pooled `DATABASE_URL` (Supabase Transaction mode)
  for all runtime Route Handlers; `DIRECT_URL` used only by
  `prisma migrate deploy` in CI, never at request time (research.md §16).
- **Bundle impact**: `@upstash/redis` is imported only from
  `src/server/**` files — confirmed server-only via bundle analyzer
  (Quality Gates), zero client-bundle bytes, consistent with `009`'s own
  precedent for `nodemailer`.

## Security

- **Ownership/authorization**: every `/api/ops/*` endpoint (except the
  three shared-secret scheduled endpoints) requires `getCurrentUser` +
  `assertIsOperator` (Architecture section above) — never a bare,
  unauthenticated read of operational data.
- **Secrets**: `CRON_SECRET` (reused from `009`'s convention, not
  redefined), `DATABASE_URL`/`DIRECT_URL`, `UPSTASH_REDIS_REST_URL`/
  `UPSTASH_REDIS_REST_TOKEN` are all server-only environment variables,
  provisioned via the primary platform's managed store — never logged,
  never in a client bundle, never in `LogEntry.context`.
- **No secrets in logs**: `logRepository.recordLogEntry` is the one
  function permitted to write `LogEntry`; it is the single enforcement
  point for FR-024 (documented convention, same discipline the existing
  `logger.error`'s `fields` parameter already relies on).
- **Destructive-action confirmation**: restore (`POST
  /api/ops/backups/:backupJobId/restore`) and rollback require explicit
  confirmation at both the API layer (`confirm: true` body field for
  restore) and the client layer (`AlertDialog` confirmation before either
  mutation fires).
- **Maintenance-mode bypass safety**: the middleware allow-list
  (`/api/system/status`, `/api/ops/maintenance*`) is a fixed, hardcoded set
  — never derived from request input — so maintenance mode cannot be
  trivially bypassed by an attacker-controlled path.
- **CORS**: new `ALLOWED_ORIGINS`-driven allow-list (research.md §11); no
  existing same-origin-only endpoint's behavior changes.
- **Headers/TLS**: explicitly reused unchanged (research.md §10–§11) — no
  new code, no new risk surface introduced here.

## Monitoring

- **Health checks**: `healthChecker.ts` probes application (process alive),
  database (`SELECT 1` with a timeout), and API layer (a lightweight
  internal round-trip), returning healthy/degraded/unhealthy per component
  (FR-016).
- **Metrics**: per-request `response_time_ms` (extends the existing
  `respond()`/`logger.request()` timing computation every Route Handler
  already performs) + scheduled DB/system snapshots (FR-017).
- **Logging**: `LogEntry` centralizes application/database/security/audit
  categories (FR-019–FR-023), coexisting with `009`'s `SecurityAuditLog`
  per research.md §0/§8.
- **Tracing**: not built this phase — `deploymentId`/`requestId`
  correlation across tables (research.md §21) satisfies this spec's actual
  requirements (FR-050, SC-018) without introducing distributed tracing
  infrastructure; documented as a future upgrade path (Risks).
- **Alerting**: threshold breach or unhealthy status →
  `SystemNotification` row, surfaced on the operations dashboard and via
  `GET /api/ops/notifications` (FR-018).
- **Error reporting**: `handleRouteError`'s existing `logger.error` call
  gains a sibling `logger.persist()` call — errors become both an
  immediate stdout line (today's behavior, unchanged) and a queryable
  `LogEntry` row (this feature's addition).
- **Application/Database/Infrastructure monitoring**: application via
  `HealthCheck`/`SystemMetric`; database via the same plus the primary
  managed provider's own dashboard (referenced, not duplicated); Infra via
  the primary platform's own deployment/function observability (referenced,
  not duplicated) — this feature does not attempt to re-platform
  capabilities the chosen managed providers already provide well.

## Testing Strategy

| Tier | Coverage |
|---|---|
| **Repository** | Every function in contracts/repository-api.md across all eight new repository files — success, not-found, and edge cases (`rollbackDeployment` with no prior success, `activateMaintenance` race), against the real PostGIS test database |
| **Route Handler (API)** | Every endpoint in contracts/api-contracts.md: success, validation failure, `401`/`403`, `429`, `503` (maintenance-active); the three `*/run-due` endpoints' shared-secret auth; `/api/system/status`'s unauthenticated success and degraded paths |
| **Docker validation** | `docker build` succeeds for both `Dockerfile` and `Dockerfile.dev`; `docker compose up --wait` reaches all-healthy within SC-003's 5-minute budget; a restart preserves volume data (FR-009) |
| **CI validation** | `ci.yml` blocks a PR with a failing test/lint/typecheck/build; a passing PR proceeds through all four jobs |
| **Health check tests** | Each component's healthy/degraded/unhealthy transition, individually and combined |
| **Backup tests** | `run-due` triggers due jobs only; `BackupHistory.expiresAt` computed correctly; retention sweep removes only expired rows |
| **Security tests** | Rate-limit threshold enforcement (both in-memory and Redis-backed modes); CORS allow-list rejection of a disallowed origin; confirmation-gated destructive actions reject an unconfirmed request |
| **Performance tests** | `SystemMetric` write path under concurrent load; connection-pool behavior under the concurrency smoke check (quickstart.md US8) |
| **Recovery tests** | Rollback restores the previous release without a rebuild (SC-006); documented restore runbook validated against a test backup (SC-009) |
| **Service** | `opsService`'s request-shaping (mocked `apiFetch`) |
| **Hook** | Each `useX` hook's cache-invalidation targets, especially `useRollbackDeployment`/`useActivateMaintenance`'s success-path invalidation |
| **Store** | `operationsStore` actions/selectors |
| **Integration** | One full run-through per user story matching quickstart.md's ten sections |
| **Accessibility** | Every new operations panel against WCAG 2.2 AA (axe + RTL a11y assertions) — the `LogExplorer`'s filter controls and confirmation dialogs specifically checked for keyboard/screen-reader usability |

## Deployment Targets

| Target | Notes |
|---|---|
| **Vercel** (primary) | Application tier. `vercel.ts` `crons` config triggers `metrics/sample`, `backups/run-due`, `retention/run-due`. Environment variables via Vercel's managed store, scoped per Preview/Production. |
| **Supabase** (primary, database) | Postgres + PostGIS, pooled connection string for runtime, direct connection string for `prisma migrate deploy`. Native backup/PITR API used by `opsBackupRepository`. |
| **Railway** (documented alternative) | Runs the production `Dockerfile` image directly; Railway Cron triggers the same scheduled endpoints; Railway's managed Postgres (with PostGIS enabled) or an external Supabase instance as the database. |
| **AWS** (documented alternative) | ECS/Fargate (or equivalent) running the production `Dockerfile` image behind an ALB (load balancing/autoscaling native to the service); EventBridge Scheduler triggers the scheduled endpoints; RDS Postgres with the `postgis` extension enabled, or Aurora Postgres. Secrets via Parameter Store/Secrets Manager feeding standard env vars. |
| **Azure** (documented alternative) | Azure Container Apps (or AKS, out of this feature's Kubernetes-excluded scope, so Container Apps specifically) running the same image; Azure Database for PostgreSQL Flexible Server with the `postgis` extension; Azure Key Vault feeding env vars. |
| **Google Cloud** (documented alternative) | Cloud Run running the same image (autoscaling native); Cloud SQL for PostgreSQL with `postgis` enabled; Secret Manager feeding env vars. |
| **Docker (generic self-hosted)** | `docker compose up -d` using `docker-compose.yml` as the reference production topology (app + postgres + redis); a reverse proxy (Caddy/Nginx/Traefik) supplied by the operator handles TLS termination (research.md §10) and can front a WAF (FR-046). |
| **Self-hosted Linux** | Same as Docker (generic self-hosted) — `docker-compose.yml` is the deployment unit; host-level `cron`/`systemd` timer triggers the scheduled endpoints, mirroring `009`'s already-documented Docker deployment note. |

Only Vercel + Supabase are built and CI/CD-tested by this feature (spec
FR-052, resolved). Every other row is a documented deployment path using
the same production Docker image and the same environment-variable
contract — no additional application code is required to use them.

## Risks

| Risk | Mitigation |
|---|---|
| A distributed brute-force/abuse attempt across multiple Vercel function instances before the Redis-backed rate limiter is fully rolled out | Redis-backed mode (research.md §12) closes the gap the in-memory limiter left, documented as the direct fix for the exact limitation `009`'s own Risks section already flagged |
| `LogEntry`/`HealthCheck`/`SystemMetric` unbounded growth if the retention sweep (`/api/ops/retention/run-due`) fails silently | The sweep endpoint's own execution is itself health-checked (a `SystemNotification` fires if it hasn't run successfully within its expected interval — "who watches the watcher," spec Edge Cases) |
| Deployment pipeline interrupted mid-stage (spec Edge Cases) | Each `DeploymentHistory` has a `status`; a deploy that never reaches `SUCCEEDED`/`FAILED` within a bounded timeout is treated as `FAILED` by a follow-up check (documented for `/speckit-tasks`, not a new infrastructure component) |
| Rollback requested with no prior successful deployment (spec Edge Cases) | `rollbackDeployment` throws a dedicated `NoPreviousDeploymentError`, surfaced to the operator UI as a clear, actionable message rather than a generic failure |
| Managed-provider backup/restore API outage during a real disaster | Documented runbook (quickstart.md) includes the provider's support escalation path as a fallback step; RTO 4h budget (spec FR-029a) has margin built in for this scenario at the data volumes this spec's Assumptions describe |
| Two operators racing to activate maintenance mode or trigger rollback simultaneously (spec Edge Cases) | Transactional check-then-act in `maintenanceRepository.activateMaintenance` (data-model.md); `rollbackDeployment` is similarly guarded by checking the target deployment's current `status` inside the same transaction as the insert |
| Secrets-retrieval failure at startup (spec Edge Cases) | `src/server/config/env.ts`'s fail-fast validation (research.md §1) means this surfaces immediately as a blocked deploy/start, never a partially-configured running instance |
| Growing log/metric volume eventually outgrowing in-database storage | Documented future upgrade path (research.md §7/§8/§21): external log/metrics aggregation or distributed tracing, explicitly deferred, not built now, to avoid introducing a new paid vendor dependency this spec's scope does not call for |
| Interim `assertIsOperator` check (Architecture section) is weaker than `009`'s full RBAC until `009` ships | Explicitly documented as a forward dependency (Complexity Tracking) with a clear, single swap point (`assertIsOperator`'s body) once `009` lands — mirrors the exact pattern `getCurrentUser`'s own interim seam already established platform-wide |

---

## Development Phases (for `/speckit-tasks`)

**Phase 1 — Setup**: Ten-model/eight-enum schema change + migration;
`env.ts`; two Dockerfiles; `docker-compose.yml`/`docker-compose.dev.yml`;
`.dockerignore`; `@upstash/redis` dependency; `ops.schema.ts` shell;
`operations` module scaffold.

**Phase 2 — Foundational**: `healthChecker.ts`; `cache.ts`; Redis-backed
`rateLimiter.ts` mode; `corsHeaders.ts`; `assertIsOperator.ts`;
`middleware.ts` (maintenance-mode gate); `logger.persist()` +
`logRepository.ts`.

**Phase 3 — Environment Management (US1)**: `env.ts` wired into app
startup; `/api/ops/config/validate`; documentation of every required
variable per environment (mirrors `docs/environment-variables.md`'s
existing format).

**Phase 4 — Containerized Packaging (US2)**: `Dockerfile`/`Dockerfile.dev`
finalized; `docker-compose.yml` healthchecks/volumes/networks; local
quickstart validated (SC-003).

**Phase 5 — CI/CD (US3)**: `deploymentRepository.ts`; `.github/workflows/
ci.yml` + `deploy.yml`; `/api/ops/deployments*`, `/api/ops/releases`;
`DeploymentHistoryPanel`/`RollbackConfirmDialog`.

**Phase 6 — Monitoring (US4)**: `/api/system/status`, `healthRepository.ts`;
`metricRepository.ts`, `/api/ops/metrics*`; `notificationRepository.ts`,
`/api/ops/notifications*`; `SystemStatusPanel`/`NotificationsPanel`/
`MetricsChart`.

**Phase 7 — Logging (US5)**: `/api/ops/logs`; `LogExplorer`.

**Phase 8 — Backup & Disaster Recovery (US6)**: `opsBackupRepository.ts`;
`/api/ops/backups*`; `retentionRepository.ts`, `/api/ops/retention/run-due`;
`BackupManagementPanel`; disaster-recovery runbook documented.

**Phase 9 — Performance Optimization (US7)**: cache wrapper adoption on the
new metrics/diagnostics reads; bundle-analyzer pass; database index review.

**Phase 10 — Scalability (US8)**: Redis-backed rate limiter fully wired;
`vercel.ts` cron config; connection-pooling (`DIRECT_URL`) finalized; load
test against a preview deployment.

**Phase 11 — Security Hardening (US9)**: `ALLOWED_ORIGINS`/CORS; rate-limit
threshold tuning; `docs/deployment.md` verification re-run against the
production deployment.

**Phase 12 — Production Operations (US10)**: `maintenanceRepository.ts`,
`/api/ops/maintenance*`; `/api/ops/diagnostics`; `OperationsDashboard`,
`MaintenanceModePanel`, `DiagnosticsPanel`; `Navbar.tsx` nav-entry addition;
`/operations` page route.

**Phase 13 — Testing & Polish**: full test-tier pass (Testing Strategy
above); accessibility audit; quickstart.md full run-through; Constitution
Check re-verification; `docs/deployment.md`/`docs/environment-variables.md`
updated with every new variable this feature introduces.

Phases 1–2 block everything (env validation and the health checker are
depended on by nearly every later endpoint). Phase 3 (Environment
Management) and Phase 4 (Containerized Packaging) can proceed in parallel
once Phase 2 lands. Phase 5 (CI/CD) depends on Phase 4's Docker artifacts
existing. Phases 6–8 (Monitoring/Logging/Backup) share `healthChecker.ts`/
`logger.persist()` from Phase 2 and can otherwise proceed in parallel.
Phase 12 (Production Operations) is last because its dashboard surfaces
data from every other phase.

---

## Quality Gates

- **TypeScript**: `tsc --noEmit` — zero errors
- **ESLint**: `eslint src --max-warnings 0` — zero errors/warnings
- **Vitest**: all applicable tiers above passing
- **Production build**: `next build` succeeds
- **Bundle analyzer**: confirms `@upstash/redis` (server-only) contributes
  zero bytes to any client bundle
- **Docker build**: both `Dockerfile` and `Dockerfile.dev` build
  successfully; the production image starts and passes its health check
- **CI workflow validation**: `ci.yml` and `deploy.yml` are syntactically
  valid (`actionlint` or equivalent) and exercised at least once against a
  real PR before this feature is considered complete
- **Secret-handling audit**: manual confirmation that no `CRON_SECRET`,
  database credential, or Redis token ever appears in a JSON response, a
  log line (`LogEntry.context` included), or a test fixture committed to
  the repository

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `assertIsOperator` is a minimal interim authorization check rather than `009`'s full `assertSystemPermission`/`SystemRole` system, which does not yet exist in code (still spec/plan only) | This feature's operator-only endpoints (deployments, backups, maintenance mode) need *some* authorization gate now, and this spec explicitly must not depend on `009`'s implementation landing first (parallel, independently deployable features per Spec Kit's own model) | Blocking this entire feature until `009` ships (rejected — makes environment management, CI/CD, and monitoring, all P1–P4 priorities, hostage to a P9-in-its-own-spec administrative feature with no functional relationship to *whether* a deployment pipeline works); building a second, competing full RBAC system just for this feature (rejected — directly contradicts "reuse existing architecture" and would need reconciling with `009`'s system the moment it lands, the exact failure mode `009`'s own plan already avoided for its analogous 006/008 dependency) |
| `opsBackupRepository.ts` name (namespaced away from a plain `backupRepository.ts`) to avoid a file-name collision with `009`'s planned per-project `backupRepository.ts` | Both features independently need a file literally named for "backup," but they own conceptually different tables (research.md §0) — namespacing is a naming decision resolved once, not a structural violation | An unnamespaced `backupRepository.ts` (rejected — whichever feature implements second would either silently overwrite the first feature's file or require a disruptive rename mid-implementation; naming it correctly now costs nothing and avoids that entirely) |
