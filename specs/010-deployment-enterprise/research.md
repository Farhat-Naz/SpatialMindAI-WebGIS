# Research: Enterprise Deployment & Production Operations

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves every open technical decision needed before Phase 1
design. Each entry follows Decision / Rationale / Alternatives Considered.
Decisions already fixed by the approved spec (single primary hosting
platform, RTO 4h/RPO 1h, maintenance-mode session behavior) are treated as
inputs here, not re-litigated.

---

## 0. Relationship to `009-administration-security`

**Decision**: 010 owns infrastructure/operations-level concerns (deployment,
release, health, metrics, centralized logs, infra backups, maintenance,
notifications). It does **not** redefine or duplicate anything
`009-administration-security` already specifies at the application layer:
`009`'s `Backup` model is a **per-project, user-triggered, application-level
data export/reimport** (Bytes column, `backupRepository.createBackup`); 010's
`BackupJob`/`BackupHistory` are **infrastructure-level, scheduled, whole-
database** backups for disaster recovery — same English word, different
layer, non-overlapping tables. `009`'s `SecurityAuditLog` remains the system
of record for administrative/security audit detail (actor, target, category);
010's centralized `LogEntry` table is the cross-category **searchable log
aggregation point** (FR-023) that a security/audit event is also mirrored
into as a summary row, not a replacement authority. `009`'s
`GET /api/health` and `monitoringRepository.getMonitoringOverview` are
extended by 010's `HealthCheck`/`SystemMetric` model and richer
`/api/system/status` endpoint, not replaced — the existing route continues
to work unmodified for any caller already depending on it.

**Rationale**: The user's explicit instruction is "do not redesign any
previous feature" and "reuse existing architecture." `009` has an approved
spec/plan but, per the current repository state, has not yet been
implemented (no migration, no `src/features/admin/`) — the same situation
`009`'s own plan documented for its dependency on `006`/`008` (Complexity
Tracking). 010 follows the identical precedent: design against `009`'s
*documented* shape, treat the integration points as a forward dependency,
and record it explicitly (see plan.md Complexity Tracking) rather than
silently duplicating a table `009` will also create.

**Alternatives considered**: Merging 010's operational tables into `009`'s
admin module — rejected, conflates identity/RBAC concerns with
infrastructure-ops concerns and would force 010 to depend on `009`'s
authentication system landing first for even a bare health check, which
contradicts environments/health being the *first* priority (US1/US4) of an
enterprise deployment story. Renaming 010's tables to avoid any lexical
overlap with `009` — rejected as unnecessary; the tables live in different
conceptual domains and Prisma model names do not collide.

---

## 1. Environment Management

**Decision**: A single server-only `src/server/config/env.ts` module defines
one Zod object schema per environment tier (Development/Testing/
Staging/Production share a base schema; Production extends it with stricter
refinements — e.g., rejecting `NODE_ENV !== "production"`-only debug flags).
The schema is parsed **once, at module load** (mirroring the search
feature's existing `src/features/search/api/config.ts` read-once-at-module-
scope convention) and the process exits with a specific, per-field error
listing if parsing fails — never a partially-configured start.

**Rationale**: Reuses the exact pattern already established for
`NOMINATIM_BASE_URL`/`SEARCH_USER_AGENT` and `DATABASE_URL`/`DEV_USER_ID`
(`docs/environment-variables.md`) instead of introducing a second
configuration mechanism. Zod is already the platform's mandatory validation
library (Constitution Principle II), so no new dependency is needed.

**Alternatives considered**: A third-party env-validation library
(`envalid`, `t3-env`) — rejected, Zod alone already satisfies every
requirement (FR-001–FR-004) and adding a dependency for something the
existing stack already does would violate "reuse existing architecture."

---

## 2. Docker Architecture & Multi-Stage Builds

**Decision**: Two Dockerfiles. `Dockerfile` (production) is a three-stage
build — `deps` (install production `node_modules` only), `builder` (installs
full deps, runs `prisma generate` + `next build` with Next.js `output:
"standalone"`), `runner` (a minimal `node:22-alpine` image copying only the
standalone server output, `public/`, and `.next/static`) — producing a
non-root, minimal runtime image. `Dockerfile.dev` is a single-stage image
built on the same Node version with bind-mounted source and `next dev`
running, optimized for iteration speed, not size.

**Rationale**: `output: "standalone"` is the Next.js-native way to produce a
minimal deployable server bundle without hand-rolling a file allowlist; a
three-stage split keeps the final image free of dev dependencies and build
toolchain (satisfies FR-005's "minimal, runnable artifact" and Constitution
Principle X's production-build gate). A separate dev Dockerfile avoids
forcing local iteration through a full production-optimized build (FR-006).

**Alternatives considered**: A single multi-target Dockerfile
(`docker build --target=dev|prod`) — viable and slightly more DRY, but two
files are clearer to read and diff independently, and match the pattern
`docker-compose.test.yml` already established of one file per purpose.

---

## 3. Docker Compose (Local & Alternative-Target Stacks)

**Decision**: `docker-compose.yml` (new, production-shaped local stack,
distinct from the existing `docker-compose.test.yml` used only by
`npm run test:db:up`) defines three services — `app` (built from
`Dockerfile`), `postgres` (`postgis/postgis:16-3.4`, matching the test
compose file's image), and `redis` (`redis:7-alpine`) — each with a
`healthcheck:` block, `app` declared `depends_on: { condition:
service_healthy }` for both. Named volumes (`postgres-data`, `redis-data`)
persist data across restarts (FR-009). Two networks: `internal` (database +
cache + app-to-them traffic, not published) and `public` (only `app`'s
mapped port), satisfying FR-010's traffic isolation. `docker-compose.dev.yml`
overrides `app` to use `Dockerfile.dev` with a bind mount and `next dev`.

**Rationale**: Directly satisfies FR-007/FR-008/FR-009/FR-010 with the
smallest possible file set, reusing the exact Postgres/PostGIS image tag the
test compose file already pins (no new image to validate). `docker compose
up --wait` (the same flag `test:db:up` already uses) is the single command
that only returns once every `healthcheck` passes.

**Alternatives considered**: Extending `docker-compose.test.yml` itself to
also serve local dev — rejected; that file's single job (a disposable,
`tmpfs`-backed test database) would become ambiguous if it also had to model
production-like persistence and a Redis service.

---

## 4. GitHub Actions CI/CD

**Decision**: `.github/workflows/ci.yml` (new — no workflow currently
exists) runs on every PR and push to `main`: parallel jobs `lint`
(`npm run lint`), `typecheck` (`tsc --noEmit`), and `test` (boots
`docker-compose.test.yml` exactly as `npm run test:db:up` does today, then
`npm run test`, then `test:db:down`), followed by a `build` job
(`next build`) gated on all three passing. A separate
`.github/workflows/deploy.yml` runs only on `main` after `ci.yml` succeeds:
`prisma migrate deploy` against the target environment's `DATABASE_URL`,
then deploy (Vercel: `vercel deploy --prod` via the standard GitHub
integration/CLI; container targets: build + push the production image).
Every deploy writes one `DeploymentHistory` row (status transitions
`pending → in_progress → succeeded/failed`) and one `DeploymentEvent` row per
pipeline stage transition.

**Rationale**: Mirrors the job boundaries Constitution Principle X already
mandates as merge gates (TypeScript, ESLint, tests, production build) —
CI enforces exactly what code review already requires, so a PR that would
fail Quality Gates cannot merge (FR-011/FR-012). Splitting `ci.yml` from
`deploy.yml` keeps "verify" and "ship" independently re-runnable (a flaky
deploy can be retried without re-running the whole test suite).

**Alternatives considered**: One monolithic workflow file — rejected, harder
to re-run only the deploy step after a transient infra failure, and mixes
two different trigger/permission scopes (PRs need no deploy credentials at
all) in one file.

---

## 5. Release Strategy & Deployment Model

**Decision**: A `ReleaseVersion` row is created from the `deploy.yml`
workflow at the start of every production deploy, tagged with the merged
commit SHA and an auto-incremented `vYYYY.MM.DD-N` version string. On
Vercel (the chosen primary platform, §13), every deployment is already
atomic and immutable — the new version is built and health-checked (FR-008)
*before* traffic is switched, which is Vercel's native equivalent of a
Blue/Green deploy, requiring no custom orchestration. Rollback (FR-015)
re-promotes the previous `ReleaseVersion`'s already-built Vercel deployment
to production — no rebuild. For the documented container/self-hosted
alternatives, a Rolling deployment (one instance replaced at a time behind
the load balancer, each new instance required to pass its health check
before the next is replaced) is documented as the equivalent strategy.

**Rationale**: Satisfies FR-013/FR-014/FR-015/SC-006 (rollback under 10
minutes, no rebuild) using the primary platform's native atomic-deployment
model instead of building a custom Blue/Green controller — directly
supports "reuse existing architecture," here read as "reuse the platform's
built-in deployment model" rather than reimplementing one.

**Alternatives considered**: A custom Blue/Green implementation (two full
environment stacks, a manual traffic-switch step) — rejected as unnecessary
complexity given the primary platform already provides this property
natively; would only be justified for the container/self-hosted alternative
targets, where it is documented as optional beyond the simpler Rolling
approach.

---

## 6. Health Checks

**Decision**: `HealthCheck` rows are written by a lightweight, dependency-
light check function (`src/server/ops/healthChecker.ts`) invoked by
`GET /api/system/status` (new, 010) and, unchanged, by `009`'s existing
`GET /api/health` contract once implemented — both read the same underlying
check function, so there is exactly one place that knows how to probe the
application, database (`SELECT 1`), and API layer, not two. Docker Compose
`healthcheck:` blocks call the same `/api/system/status` endpoint (app
service) and each image's native health probe (`pg_isready` for Postgres,
`redis-cli ping` for Redis).

**Rationale**: Directly satisfies FR-008 and FR-016, and explicitly avoids
duplicating `009`'s already-planned `/api/health` — 010 extends the
underlying checker, `009` (when implemented) keeps its existing route
contract pointed at the same function.

**Alternatives considered**: A separate, unrelated health-check
implementation for 010 — rejected per §0.

---

## 7. Application & Database Monitoring

**Decision**: `SystemMetric` rows are written by (a) a lightweight
per-request timing hook already available via `handleRouteError`'s sibling
`respond()` helper pattern (every Route Handler already computes
`durationMs`, per `src/app/api/projects/route.ts`) extended to also record a
`SystemMetric` sample for `response_time_ms`, and (b) a scheduled endpoint
(`POST /api/ops/metrics/sample`, Vercel Cron, §11) that snapshots database
metrics (`pg_stat_activity` connection count, `pg_database_size`) into
`SystemMetric` rows on a fixed interval. Dashboards read aggregated
`SystemMetric` trends; no separate time-series database is introduced.

**Rationale**: Reuses the request-timing data every Route Handler already
computes for `logger.request()` rather than instrumenting a second
mechanism; the scheduled sampling endpoint reuses the exact
externally-triggered-idempotent-endpoint pattern `009`'s plan already
established for `run-due` endpoints (shared-secret auth via `CRON_SECRET`).

**Alternatives considered**: Adopting a third-party APM (Datadog, New
Relic) — explicitly not introduced; the spec's success criteria (SC-007,
SC-017) are satisfiable with in-database metrics plus the primary hosting
platform's own built-in request/function observability, and adding a paid
external dependency is outside what the spec's Out of Scope section
(no billing/vendor lock-in) supports without an explicit ask.

---

## 8. Logging Architecture & Centralization

**Decision**: `src/shared/lib/logger.ts` (existing, unchanged in its public
API) continues to write structured JSON to stdout/stderr — captured
automatically by the primary hosting platform's log stream, which is the
first, zero-code-change tier of centralization. A new, thin addition,
`logger.persist(entry)`, is added *alongside* the existing methods (not a
breaking change to any existing call site) and is called by
`handleRouteError` for `error`-level entries and by new Route Handlers
introduced by this feature for security/audit-relevant events, writing one
row to the new `LogEntry` table. `GET /api/ops/logs` (010) queries
`LogEntry` with category/time-range filters for the centralized search
experience (FR-023).

**Rationale**: Adding one new optional method preserves every existing
`logger.debug/info/warn/error/request` call site exactly as-is (no redesign
of `009`'s or any prior feature's logging calls), while giving 010 a
queryable, centralized store without requiring an external log-aggregation
SaaS.

**Alternatives considered**: Routing all logs through an external
aggregator (Datadog Logs, Better Stack) — rejected for the same
no-new-paid-vendor reasoning as §7; documented in Risks as a future upgrade
path if log volume outgrows in-database storage.

---

## 9. Secrets Management

**Decision**: The primary platform's built-in encrypted environment variable
store (Vercel Environment Variables, scoped per environment — Development/
Preview/Production) is the managed secret store required by FR-042. For the
documented container/self-hosted alternatives, the equivalent
platform-native mechanism is used (Railway variables, AWS Secrets Manager/
Parameter Store feeding standard env vars, Docker Compose `secrets:` /
`.env` file excluded from the image). No secret is ever baked into a Docker
image layer or committed to the repository.

**Rationale**: Every environment variable the codebase already reads
(`DATABASE_URL`, `DEV_USER_ID`, `SEARCH_USER_AGENT`) already flows through
`process.env` read at module scope — this decision keeps that exact pattern
and only changes *where* the values are provisioned from per environment,
not how the application consumes them.

**Alternatives considered**: A dedicated secrets-manager service (HashiCorp
Vault) — rejected as introducing new infrastructure to operate for a
capability the primary platform already provides natively; documented as a
future option for the AWS/self-hosted alternative path only.

---

## 10. SSL/TLS

**Decision**: TLS termination is the primary platform's responsibility
(Vercel provisions and auto-renews certificates for every production
domain) — no application code manages certificates. For the documented
container/self-hosted alternatives, a reverse proxy (e.g., a managed load
balancer with ACM on AWS, or an operator-supplied Caddy/Nginx TLS
termination layer) is documented as the operator's responsibility; the
application itself never terminates TLS directly.

**Rationale**: Satisfies FR-041 without introducing certificate-management
code into the application, consistent with "reuse existing architecture" —
the existing `Strict-Transport-Security` header (`next.config.ts`, already
shipped) already assumes and enforces an HTTPS-terminated deployment.

**Alternatives considered**: Terminating TLS inside the Node.js process —
rejected; unnecessary operational complexity the primary platform already
removes entirely.

---

## 11. HTTP Security Headers

**Decision**: No change to `next.config.ts`'s existing `securityHeaders`
array — it already satisfies FR-044 exactly (CSP, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, Strict-Transport-Security,
Permissions-Policy, documented in `docs/deployment.md`). 010 adds only a
CORS allow-list (`src/server/http/corsHeaders.ts`, new) applied to API
routes that must be reachable cross-origin (none currently are — same-origin
only, per every existing feature's Route Handlers), configured via a new
`ALLOWED_ORIGINS` environment variable for forward-compatibility with any
future cross-origin integration.

**Rationale**: The instruction "do not redesign any previous feature"
applies directly here — the header set already exists, is already tested
(`docs/deployment.md`'s `curl -I`/securityheaders.com verification steps),
and 010's job is to keep it deployed correctly, not rewrite it.

**Alternatives considered**: Moving headers to `vercel.ts`'s `headers()`
config — rejected; `next.config.ts` already owns this and works identically
on the chosen primary platform, so moving it would be a pure redesign with
no functional benefit.

---

## 12. Redis Integration & Caching Strategy

**Decision**: Upstash Redis (Vercel Marketplace-provisioned, REST-based —
compatible with serverless/edge without a persistent TCP connection pool) is
the shared cache and distributed rate-limit store. Two uses: (a)
`src/server/security/rateLimiter.ts` gains a Redis-backed sliding-window
mode, used when `REDIS_URL`/`UPSTASH_REDIS_REST_URL` is configured,
falling back to the existing in-memory implementation otherwise — a
non-breaking extension, not a rewrite, of every existing call site
(`assertWriteRateLimit`, the search feature's limiter); (b) a small,
generic `src/server/cache/cache.ts` `get/set/invalidate` wrapper used by
new 010 endpoints (system status, metrics summaries) and available for
future adoption by expensive, repeatable reads elsewhere in the codebase
(FR-030, FR-039).

**Rationale**: Directly closes the single-instance rate-limiter gap 009's
own Risks section already flagged as a carried-forward limitation, and
gives FR-039's "shared fast-access cache" a concrete implementation that
works with the chosen serverless-first primary platform (no persistent
connections required).

**Alternatives considered**: Self-hosted Redis (Docker-only) — kept as the
local/Docker-Compose-stack implementation (§3) for parity, but not the
production choice, since a self-managed Redis instance would reintroduce
the operational burden (patching, HA) the "reuse existing architecture,
avoid vendor lock-in" balance favors offloading to a managed add-on that
speaks the standard Redis protocol.

---

## 13. Deployment Target Platform

**Decision**: **Vercel** is the single primary production hosting platform
for the Next.js application tier (per the approved spec decision). The
managed PostgreSQL + PostGIS database tier is **Supabase Postgres**
(explicitly PostGIS-capable, satisfying Constitution Principle III's
requirement that the database support PostGIS, and already in the
candidate-technology list) — the application continues to speak to it
through the exact same `DATABASE_URL`-driven Prisma client
(`src/server/db/prismaClient.ts`) already in use, using Supabase's pooled
connection string for runtime queries and its direct connection string for
`prisma migrate deploy` (§16), reusing the pooling pattern already
documented for serverless Postgres access. Docker/Docker Compose (§2–§3)
remain the packaging and local-parity mechanism, and are also the artifact
documented for the alternative targets (Railway, AWS, Azure, Google Cloud,
self-hosted Linux) — each gets a short, concrete deployment note in
plan.md's Deployment Targets table, but none is built or tested as a first-
class CI/CD target in this feature.

**Rationale**: This is the direct implementation of the spec's resolved
clarification (single primary platform). Vercel + Supabase keeps every
existing environment-variable and Prisma pattern unchanged, needs no new
ORM/driver code, and its Fluid Compute model (auto-scaling, reused function
instances) satisfies FR-035–FR-037 without any custom autoscaling
controller.

**Alternatives considered**: AWS as primary (ECS/Fargate + RDS) — rejected
for this phase; it would require building and testing a second, heavier
deployment path (task definitions, ALB, autoscaling groups) the spec's
"single primary platform" resolution does not call for, though it remains
fully documented as a supported alternative via the same Docker image.

---

## 14. Rate Limiting (Production Posture)

**Decision**: Builds directly on §12 — the existing per-user, per-bucket
limiter (`assertWriteRateLimit`) gains a Redis-backed mode; new buckets are
added for the ops endpoints this feature introduces
(`"ops:deploy-webhook"`, `"ops:maintenance-toggle"`), following the exact
naming convention already used for `"projects:write"`. No new limiting
concept is introduced.

**Rationale**: FR-045 is satisfied by extending, not replacing, the
mechanism every existing write endpoint already depends on.

**Alternatives considered**: An edge/WAF-level rate limiter (e.g., a
platform firewall rule) as the *only* layer — rejected as the sole
mechanism because it would bypass the existing per-user-bucket semantics
already relied on elsewhere; documented instead as a complementary,
coarser-grained layer (§15).

---

## 15. Production Security Posture & WAF Readiness

**Decision**: FR-046 ("WAF ready") is satisfied structurally: the
application has no assumption anywhere that a request reaches it directly
without an intermediary — all traffic already flows through the primary
platform's edge network, which is where a WAF layer (the platform's own
managed firewall rules, or a third-party WAF pointed at the same origin)
would sit. No application-level change is required or made; this is
documented as an architectural property, not a new capability.

**Rationale**: Matches the spec's own framing of FR-046 as an architectural
readiness property, not a purchased product — nothing here commits the
project to any specific WAF vendor.

**Alternatives considered**: Provisioning a specific WAF product as part of
this feature — rejected; Out of Scope explicitly excludes vendor-specific
commitments beyond what's needed for readiness.

---

## 16. Database Optimization & Connection Pooling

**Decision**: Runtime Route Handlers use Supabase's pooled ("Transaction
mode") connection string for `DATABASE_URL`; `prisma migrate deploy` (CI/CD
deploy job, §4) uses the direct (non-pooled) connection string via a second
env var, `DIRECT_URL`, following Prisma's documented pattern for pooled
serverless Postgres access — an additive `datasource` config change, not a
redesign of any existing repository or query. All spatial query
optimization continues to rely on the GiST indexes Constitution Principle
III already mandates; 010 adds no new spatial query paths, only operational
tables with their own conventional B-tree indexes (data-model.md).

**Rationale**: Directly satisfies FR-038 using Prisma's own recommended
mechanism for the chosen managed Postgres provider, with zero change to any
existing repository function's query code.

**Alternatives considered**: A self-managed PgBouncer instance — rejected;
Supabase's built-in pooler already provides this, and self-hosting one
would reintroduce operational burden the managed platform choice (§13) is
meant to avoid.

---

## 17. Backup Automation & Disaster Recovery

**Decision**: `BackupJob` rows define schedules (default: hourly
incremental via the managed provider's point-in-time recovery, daily full
snapshot); a scheduled endpoint (`POST /api/ops/backups/run-due`, Vercel
Cron + `CRON_SECRET`, reusing `009`'s exact convention, §4) triggers the
managed database provider's native backup/snapshot API and records the
result as a `BackupHistory` row (status, size, storage location, checksum,
retention expiry). Restore (FR-027) is a documented, operator-run runbook
step using the same provider's point-in-time-restore capability — not a
custom in-application restore engine, since a whole-database restore is an
infrastructure operation, not an application-level one (contrast with
`009`'s per-project application-level restore, which *is* in-application by
design). RTO 4h / RPO 1h (spec FR-029a) is met because the managed
provider's point-in-time recovery grain is well under an hour and restore
initiation-to-ready time is well under four hours for the data volumes this
spec's Assumptions describe.

**Rationale**: Uses the managed database provider's own backup
infrastructure — already durable, tested, and off the application's
critical path — rather than building and maintaining a custom `pg_dump`
pipeline, which would itself become a new operational risk (§ Risks in
plan.md) without improving on what the provider already guarantees.

**Alternatives considered**: Application-triggered `pg_dump` to object
storage — documented as the fallback approach for the Docker/self-hosted
alternative targets (where no managed provider backup API exists), using
the same `BackupJob`/`BackupHistory` tables and the same scheduled-endpoint
trigger pattern.

---

## 18. Scalability & Load Balancing

**Decision**: Covered by §13 (Fluid Compute auto-scaling, platform-managed
load distribution) for the primary target. For documented alternatives,
Railway's autoscaling and AWS's ALB + autoscaling group are noted as the
direct equivalents, using the same production Docker image (§2) unchanged.

**Rationale**: No new code is required for FR-035–FR-037 on the primary
platform; documenting the alternative-path equivalents satisfies the plan's
requirement to address scalability across all documented targets without
building infrastructure this feature does not need for its primary target.

**Alternatives considered**: None beyond what's already covered in §13.

---

## 19. CDN Support & Compression

**Decision**: Both are handled automatically by the primary platform's edge
network (static assets, `_next/static`, and any `Cache-Control`-tagged
responses are edge-cached and geographically distributed; gzip/Brotli
compression is applied platform-side to every response). No application
code is added for either FR-031 or FR-040.

**Rationale**: Building custom compression middleware or a CDN integration
would duplicate a capability the primary platform already provides
correctly and by default — directly contradicts "reuse existing
architecture."

**Alternatives considered**: A dedicated CDN service (Cloudflare) in front
of the primary platform — documented as an optional additional layer for
the alternative container/self-hosted targets only, where no platform-native
CDN exists.

---

## 20. Feature Flags & Maintenance Mode

**Decision**: This spec builds exactly one operational "flag" — maintenance
mode (US10, FR-049/FR-049a) — implemented via a `MaintenanceWindow` table
and a minimal `middleware.ts` check (see plan.md Architecture) that returns
`503` with a `Retry-After` header for any *new* incoming request while an
active window exists, and otherwise passes through untouched. A
general-purpose feature-flag system (arbitrary boolean/percentage rollout
flags unrelated to maintenance) is **not** built — the spec's functional
requirements never call for one beyond maintenance mode, and adding one
would be scope creep beyond FR-001–FR-052.

**Rationale**: Keeps scope bounded to what the approved spec actually
requires; maintenance mode's read-at-request-start check is exactly what
satisfies FR-049a's "block new requests, let in-flight finish" semantics,
since middleware runs before a request is admitted to any Route Handler.

**Alternatives considered**: A full feature-flag service/table (flag key,
rollout percentage, environment scope) — rejected as unrequested scope;
documented here so a future spec can add it deliberately rather than it
being smuggled into this one.

---

## 21. Error Reporting & Observability Correlation

**Decision**: No new external error-tracking SaaS is introduced (§8's
reasoning applies identically here). Correlation across `DeploymentEvent`,
`HealthCheck`, `SystemMetric`, and `LogEntry` is achieved by a shared
`deploymentId`/`requestId` field threaded through each, so an operator
investigating a production issue (US10, FR-050) can trace from "which
release is live" → "what does its health look like" → "what errors logged
around that time" using one consistent key, entirely within the existing
database.

**Rationale**: Satisfies FR-050/SC-018 without a new paid dependency,
consistent with §7/§8's reasoning.

**Alternatives considered**: Distributed tracing (OpenTelemetry spans) —
noted as a natural future upgrade once traffic volume justifies it; not
required to meet this spec's success criteria at the stated scale.

---

## Summary Table

| Topic | Decision |
|---|---|
| Env validation | Zod schema, fail-fast at module load (`src/server/config/env.ts`) |
| Docker | Multi-stage `Dockerfile` (`output: "standalone"`) + `Dockerfile.dev` |
| Compose | New `docker-compose.yml` (app+postgres+redis, healthchecks, volumes, 2 networks) |
| CI | `.github/workflows/ci.yml` (lint/typecheck/test/build) |
| CD | `.github/workflows/deploy.yml` (migrate deploy → deploy → record `DeploymentHistory`) |
| Release model | Atomic deploys native to primary platform; `ReleaseVersion`/`DeploymentHistory` for tracking |
| Health checks | One shared checker function, read by `/api/system/status` and `009`'s `/api/health` |
| Metrics | `SystemMetric`, per-request timing + scheduled DB snapshot |
| Logging | `logger.persist()` addition + `LogEntry` table, existing `logger.*` API unchanged |
| Secrets | Primary platform's managed env vars; no new secrets-manager service |
| TLS | Primary platform-terminated; no application code |
| Headers | Unchanged (`next.config.ts`); + new CORS allow-list |
| Cache/Redis | Upstash Redis; rate limiter gains Redis mode; new generic cache wrapper |
| Primary platform | Vercel (app) + Supabase Postgres/PostGIS (data) |
| Connection pooling | Supabase pooled URL (runtime) + direct URL (migrations) |
| Backups/DR | Managed provider's native backup/PITR API; `BackupJob`/`BackupHistory` tracking |
| Scaling | Platform-native (Fluid Compute); alternatives documented |
| CDN/compression | Platform-native; no application code |
| Feature flags | None beyond maintenance mode (scope-bounded) |
| Error correlation | Shared `deploymentId`/`requestId` across ops tables; no external APM |
