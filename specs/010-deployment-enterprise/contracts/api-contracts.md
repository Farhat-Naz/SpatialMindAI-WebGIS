# API Contracts: Enterprise Deployment & Production Operations

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Data Model**: [data-model.md](../data-model.md)

All endpoints follow the existing Route Handler conventions
(`src/app/api/projects/route.ts`): Zod-validated input, the shared
`{ error: { code, message } }` envelope via `handleRouteError`, structured
`logger.request()` logging on every response. New error codes this feature
introduces (added to `src/shared/errors/apiError.ts`'s `ApiErrorCode` union,
additively):

| Code | HTTP Status | Meaning |
|---|---|---|
| `MAINTENANCE_ACTIVE` | 503 | Request rejected because an active `MaintenanceWindow` exists (FR-049a) |
| `FORBIDDEN` | 403 | Authenticated but not authorized for an operator-only endpoint (reuses `009`'s planned `FORBIDDEN` code if already added by the time this ships — see plan.md Complexity Tracking) |

Every endpoint below except `GET /api/system/status` and the two `*/run-due`
scheduled endpoints requires an **authorized operator** — see
plan.md Architecture ("Operator Authorization") for how this gate is
implemented ahead of `009`'s full RBAC landing.

---

## Health

### `GET /api/system/status`

Extends (does not replace) `009`'s planned `GET /api/health`. Unauthenticated
— used by load balancers, uptime checks, and Docker Compose `healthcheck:`.

**Response `200`** (all components healthy) / **`503`** (any unhealthy):

```json
{
  "status": "healthy",
  "components": {
    "application": { "status": "healthy", "latencyMs": 2 },
    "database": { "status": "healthy", "latencyMs": 14 },
    "api": { "status": "healthy", "latencyMs": 3 }
  },
  "checkedAt": "2026-07-24T12:00:00.000Z"
}
```

Satisfies FR-016.

---

## Metrics

### `GET /api/ops/metrics?metricName=&from=&to=`

**Response `200`**:

```json
{
  "metricName": "response_time_ms",
  "samples": [
    { "value": 42.5, "unit": "ms", "recordedAt": "2026-07-24T12:00:00.000Z", "tags": { "route": "/api/projects" } }
  ]
}
```

`metricName` required; `from`/`to` optional ISO 8601, default last 24h.
Satisfies FR-017.

### `POST /api/ops/metrics/sample` (scheduled)

Body: none. Header: `Authorization: Bearer <CRON_SECRET>` (reuses `009`'s
convention). Snapshots current DB/system metrics into `SystemMetric` rows.
**Response `200`**: `{ "recorded": 4 }`.

---

## System Status / Diagnostics

### `GET /api/ops/diagnostics`

**Response `200`**:

```json
{
  "health": { "...": "same shape as GET /api/system/status" },
  "recentErrors": [
    { "message": "...", "level": "error", "occurredAt": "..." }
  ],
  "resourceStatus": {
    "dbConnectionCount": 12,
    "dbSizeBytes": 104857600
  },
  "activeMaintenanceWindow": null
}
```

Satisfies FR-050, SC-018.

---

## Deployment History / Release Management

### `GET /api/ops/deployments?environment=&limit=`

**Response `200`**:

```json
{
  "deployments": [
    {
      "id": "dep_123",
      "environment": "PRODUCTION",
      "status": "SUCCEEDED",
      "release": { "id": "rel_1", "version": "v2026.07.24-1", "commitSha": "abc123" },
      "startedAt": "...",
      "completedAt": "...",
      "rolledBackFromId": null
    }
  ]
}
```

Satisfies FR-047, SC-018.

### `GET /api/ops/deployments/:deploymentId/events`

**Response `200`**: `{ "events": [ { "type": "build_succeeded", "message": null, "occurredAt": "..." } ] }`.

### `POST /api/ops/deployments` (CI/CD only, shared-secret auth)

Records a new `DeploymentHistory` + creates/links its `ReleaseVersion`.
Called from `.github/workflows/deploy.yml`, not from the browser. Satisfies
FR-013/FR-014.

**Request**:

```json
{ "version": "v2026.07.24-1", "commitSha": "abc123", "environment": "PRODUCTION" }
```

### `PATCH /api/ops/deployments/:deploymentId` (CI/CD only, shared-secret auth)

Updates `status`/`completedAt` as the pipeline progresses; each call also
appends one `DeploymentEvent`.

### `POST /api/ops/deployments/:deploymentId/rollback` (operator)

**Response `200`**: new `DeploymentHistory` row with `rolledBackFromId` set
to the target. Satisfies FR-015, SC-006.

### `GET /api/ops/releases`

**Response `200`**: `{ "releases": [ { "id", "version", "commitSha", "status", "createdAt" } ] }`.
Satisfies FR-048.

---

## Backup Management

### `GET /api/ops/backups?environment=`

**Response `200`**:

```json
{
  "jobs": [
    {
      "id": "job_1",
      "name": "production-hourly",
      "environment": "PRODUCTION",
      "scheduleCron": "0 * * * *",
      "retentionDays": 30,
      "enabled": true,
      "lastRunAt": "...",
      "nextRunAt": "..."
    }
  ]
}
```

### `GET /api/ops/backups/:backupJobId/history?limit=`

**Response `200`**: `{ "history": [ { "id", "status", "sizeBytes", "startedAt", "completedAt", "expiresAt" } ] }`.
Satisfies FR-025–FR-028, SC-009, SC-010.

### `POST /api/ops/backups/run-due` (scheduled, shared-secret auth)

Triggers any `BackupJob` whose `nextRunAt <= now()`. **Response `200`**:
`{ "triggered": 1 }`.

### `POST /api/ops/backups/:backupJobId/restore` (operator, Production requires
confirmation token in body per FR-027's "restore to exact state" — a
destructive action)

**Request**: `{ "backupHistoryId": "bh_1", "confirm": true }`
**Response `202`**: `{ "status": "restore_initiated" }` (restore itself is a
documented runbook step per research.md §17 — this endpoint records intent
and audit trail, it does not synchronously execute an infrastructure-level
restore).

---

## Maintenance Mode

### `GET /api/ops/maintenance`

**Response `200`**: `{ "active": null }` or
`{ "active": { "id", "reason", "startedAt", "notifyMessage" } }`.

### `POST /api/ops/maintenance` (operator)

**Request**: `{ "reason": "Scheduled database upgrade", "notifyMessage": "Maintenance 2–3am UTC" }`
**Response `201`**: the created `MaintenanceWindow` (`status: ACTIVE`).
If one is already active, returns the existing window with `200` instead of
creating a duplicate (data-model.md concurrency note). Satisfies FR-049.

### `DELETE /api/ops/maintenance/:id` (operator)

Deactivates (`status: COMPLETED`, `endedAt: now()`). **Response `200`**.

### Middleware behavior (all other routes)

While a `MaintenanceWindow` is `ACTIVE`, `middleware.ts` returns `503` with
`Retry-After` for any **new** request except `GET /api/system/status`,
`/api/ops/maintenance*`, and already-established sessions completing an
in-flight operation (research.md §20, spec FR-049a).

---

## Notifications

### `GET /api/ops/notifications?severity=&resolved=`

**Response `200`**: `{ "notifications": [ { "id", "type", "severity", "title", "message", "createdAt", "resolvedAt" } ] }`.

### `POST /api/ops/notifications/:id/acknowledge` (operator)

**Response `200`**: sets `acknowledgedBy`. Does not resolve — acknowledging
and resolving are distinct (an operator can acknowledge without the
underlying condition yet being fixed).

---

## Logs

### `GET /api/ops/logs?category=&level=&from=&to=&limit=`

**Response `200`**: `{ "entries": [ { "id", "category", "level", "message", "requestId", "occurredAt" } ] }`.
Cursor-paginated (mirrors `009`'s planned audit-log pagination approach).
Satisfies FR-023, SC-008.

---

## Configuration Validation

### `GET /api/ops/config/validate` (operator, non-Production only — never
exposes Production's actual values, only pass/fail per required key)

**Response `200`**:

```json
{
  "environment": "STAGING",
  "valid": true,
  "issues": []
}
```

**Response `200`, invalid**:

```json
{
  "environment": "STAGING",
  "valid": false,
  "issues": [ { "key": "DATABASE_URL", "problem": "missing" } ]
}
```

Exercises the same `src/server/config/env.ts` schema the application uses
at startup (research.md §1) — this endpoint never reveals secret values,
only structural validity, satisfying FR-002 while not creating a new way to
leak `DATABASE_URL` or similar.

---

## Retention Sweep

### `POST /api/ops/retention/run-due` (scheduled, shared-secret auth)

Deletes expired rows per the Retention Policies table in data-model.md.
**Response `200`**: `{ "deleted": { "healthCheck": 340, "systemMetric": 1200, "logEntry": 89, "backupHistory": 2, "systemNotification": 0 } }`.
