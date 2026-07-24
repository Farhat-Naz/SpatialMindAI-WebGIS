# Quickstart: Enterprise Deployment & Production Operations

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Validation scenarios proving each user story works end-to-end, referencing
[data-model.md](./data-model.md) and [contracts/](./contracts/) for exact
shapes rather than duplicating them. These are runnable checks for
`/speckit-tasks`/implementation to validate against — not implementation
code.

## Prerequisites

- Node.js (version pinned in `package.json`/Dockerfile), Docker Desktop
  (or compatible), `npm install` run once.
- `.env` populated per `docs/environment-variables.md` plus this feature's
  new variables (documented in plan.md's Deployment Notes): `REDIS_URL` (or
  `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`), `DIRECT_URL`
  (migrations), `CRON_SECRET` (reused from `009`'s convention),
  `ALLOWED_ORIGINS`.

## US1 — Environment Management

```bash
# Intentionally omit DATABASE_URL and start the app
DATABASE_URL= npm run dev
```

**Expected**: process exits immediately with a specific error naming
`DATABASE_URL` as missing — never a partial start (SC-001).

```bash
curl http://localhost:3000/api/ops/config/validate
```

**Expected** (Staging/Development only — see contracts/api-contracts.md):
`{ "valid": true, "issues": [] }` once all required vars are set.

## US2 — Containerized Packaging

```bash
docker build -t spatialmind-ai:prod .
docker compose up --wait
```

**Expected**: `docker compose up --wait` returns only once `app`,
`postgres`, and `redis` all report healthy (research.md §3). Restart the
stack and confirm project/layer/feature data created before the restart is
still present (FR-009).

```bash
docker compose -f docker-compose.dev.yml up
```

**Expected**: dev container starts, edits to `src/` hot-reload without a
rebuild.

## US3 — CI/CD

1. Open a PR with a deliberately failing test.
   **Expected**: `.github/workflows/ci.yml`'s `test` job fails; the `build`
   and `deploy` jobs never run (FR-012).
2. Fix the test, push.
   **Expected**: `lint`, `typecheck`, `test`, `build` all pass; merging to
   `main` triggers `deploy.yml`, which creates one `DeploymentHistory` row
   (`GET /api/ops/deployments?environment=PRODUCTION`) transitioning
   `PENDING → IN_PROGRESS → SUCCEEDED`.
3. `POST /api/ops/deployments/:id/rollback` against that deployment.
   **Expected**: a new `DeploymentHistory` row appears with
   `rolledBackFromId` set, `SUCCEEDED`, within the SC-006 10-minute budget.

## US4 — Monitoring

```bash
docker compose stop postgres
curl http://localhost:3000/api/system/status
```

**Expected**: `503`, `components.database.status: "unhealthy"`. A
`SystemNotification` (`type: "health_alert"`) is created within the SC-007
5-minute budget once the scheduled health-check cron next runs; restarting
`postgres` and re-checking clears it (`resolvedAt` set).

```bash
curl "http://localhost:3000/api/ops/metrics?metricName=response_time_ms"
```

**Expected**: recent samples returned, matching real request activity.

## US5 — Logging

Trigger one event per category (an application error via a malformed
request, a database error via a temporarily-stopped `postgres`, a failed
sign-in once `009` ships, and a maintenance-mode activation as the
"administrative action" for this feature's own scope), then:

```bash
curl "http://localhost:3000/api/ops/logs?from=2026-07-24T00:00:00Z"
```

**Expected**: all four events present, correctly categorized, from one
query (SC-008).

## US6 — Backup & Disaster Recovery

```bash
curl -X POST http://localhost:3000/api/ops/backups/run-due \
  -H "Authorization: Bearer $CRON_SECRET"
curl "http://localhost:3000/api/ops/backups/{jobId}/history"
```

**Expected**: a new `BackupHistory` row, `status: SUCCEEDED`,
`expiresAt` set per the job's `retentionDays`. Trigger
`POST /api/ops/retention/run-due` after manually backdating a test row's
`expiresAt` and confirm it is removed (SC-010, FR-028).

## US7 — Performance Optimization

```bash
npm run build
ANALYZE=true npm run build
```

**Expected**: production build succeeds; bundle analyzer confirms no new
client-bundle regression beyond what each new dependency (Redis client, if
bundled at all — should be server-only) justifies (Constitution Principle V).

```bash
curl -I http://localhost:3000/  # first request
curl -I http://localhost:3000/  # second request
```

**Expected**: cache-related headers indicate a faster-path response on the
second request for any cacheable route (SC-011).

## US8 — Scalability

On the primary platform (Vercel), trigger a load test against a preview
deployment and confirm function invocations scale without manual
intervention and p95 latency stays within the documented budget (SC-012,
SC-014) — validated against the deployed environment, not locally
reproducible with Docker Compose alone (documented limitation, plan.md
Risks).

```bash
# Local connection-pooling smoke check
for i in $(seq 1 50); do curl -s http://localhost:3000/api/system/status & done; wait
```

**Expected**: all 50 concurrent requests succeed; `db_connection_count`
metric stays within the pool's configured max (FR-038).

## US9 — Security Hardening

```bash
curl -I https://<deployed-domain>/
```

**Expected**: all 6 headers present exactly as documented in
`docs/deployment.md` (unchanged by this feature), connection is HTTPS-only
(SC-015).

```bash
for i in $(seq 1 200); do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:3000/api/ops/maintenance \
  -H "Content-Type: application/json" -d '{"reason":"test"}'; done | sort | uniq -c
```

**Expected**: after the configured threshold, responses switch to `429`
(SC-017).

## US10 — Production Operations

1. Open `/operations` (new dashboard route) as an authorized operator.
   **Expected**: current deployed version, deploy time, and recent release
   history visible within SC-018's 1-minute budget.
2. `POST /api/ops/maintenance` then immediately issue a new, unrelated
   request to any existing route (e.g. `GET /api/projects`).
   **Expected**: `503` with `Retry-After` (FR-049a) — while a request
   already in flight when maintenance activated is allowed to complete
   (verified by starting a long-running request just before activation and
   confirming it still returns its normal result, not a `503`).
3. `DELETE /api/ops/maintenance/:id`.
   **Expected**: subsequent requests succeed normally again (SC-019).
4. `GET /api/ops/diagnostics`.
   **Expected**: consolidated report covering application/database/API
   health, recent errors, and resource status in one response (SC-018).
