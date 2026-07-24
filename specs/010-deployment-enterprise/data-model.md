# Data Model: Enterprise Deployment & Production Operations

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

All ten models below are **additive** to `prisma/schema.prisma` — no
existing model (`User`, `Project`, `Layer`, `Feature`, `FeatureAttribute`,
`FeatureStyle`, `AnalysisRun`) is modified. None is scoped to a `Project` or
`User` as an owner in the way domain data is — these are platform-wide
operational records, the same pattern `009-administration-security`'s
`SecurityAuditLog` already establishes for platform-wide (non-project-scoped)
data. See research.md §0 for how these relate to `009`'s own models.

## Enums

```prisma
enum Environment {
  DEVELOPMENT
  TESTING
  STAGING
  PRODUCTION
}

enum DeploymentStatus {
  PENDING
  IN_PROGRESS
  SUCCEEDED
  FAILED
  ROLLED_BACK
}

enum HealthComponent {
  APPLICATION
  DATABASE
  API
}

enum HealthStatus {
  HEALTHY
  DEGRADED
  UNHEALTHY
}

enum LogCategory {
  APPLICATION
  DATABASE
  SECURITY
  AUDIT
}

enum LogLevel {
  DEBUG
  INFO
  WARN
  ERROR
}

enum BackupStatus {
  PENDING
  RUNNING
  SUCCEEDED
  FAILED
}

enum MaintenanceStatus {
  SCHEDULED
  ACTIVE
  COMPLETED
  CANCELLED
}

enum NotificationSeverity {
  INFO
  WARNING
  CRITICAL
}
```

## Models

### ReleaseVersion

The immutable, versioned artifact a `DeploymentHistory` row deploys
(spec Key Entity: **Release**). Created once per release, never mutated
except `status`.

```prisma
model ReleaseVersion {
  id          String            @id @default(cuid())
  version     String            @unique
  commitSha   String
  description String?
  status      DeploymentStatus  @default(PENDING)
  createdBy   String?
  deployments DeploymentHistory[]
  createdAt   DateTime          @default(now())

  @@index([createdAt])
}
```

- `version`: e.g. `v2026.07.24-1` (research.md §5).
- `status`: rolls up to `ACTIVE`-equivalent (`SUCCEEDED`) once its most
  recent production `DeploymentHistory` succeeds; superseded by the next
  release's success.

### DeploymentHistory

One act of delivering a `ReleaseVersion` into an `Environment`
(spec Key Entity: **Deployment**).

```prisma
model DeploymentHistory {
  id               String            @id @default(cuid())
  releaseVersionId String
  releaseVersion   ReleaseVersion    @relation(fields: [releaseVersionId], references: [id], onDelete: Cascade)
  environment      Environment
  status           DeploymentStatus  @default(PENDING)
  initiatedBy      String?
  rolledBackFromId String?
  rolledBackFrom   DeploymentHistory? @relation("Rollback", fields: [rolledBackFromId], references: [id], onDelete: SetNull)
  rollbackTargets  DeploymentHistory[] @relation("Rollback")
  events           DeploymentEvent[]
  startedAt        DateTime          @default(now())
  completedAt      DateTime?
  notes            String?

  @@index([environment, startedAt])
  @@index([releaseVersionId])
}
```

- `rolledBackFromId`: when this deployment *is* a rollback, points at the
  deployment it restored (self-relation), satisfying FR-015's traceability
  without a separate "Rollback" table.
- `initiatedBy`: nullable — automated CI/CD deploys have no human actor;
  operator-triggered rollbacks set this to the acting `User.id`.

### DeploymentEvent

A single timeline entry within one deployment's lifecycle
(pipeline stage transitions — FR-011–FR-013).

```prisma
model DeploymentEvent {
  id                  String            @id @default(cuid())
  deploymentHistoryId String
  deploymentHistory   DeploymentHistory @relation(fields: [deploymentHistoryId], references: [id], onDelete: Cascade)
  type                String
  message             String?
  occurredAt          DateTime          @default(now())

  @@index([deploymentHistoryId, occurredAt])
}
```

- `type`: an open string vocabulary (`build_started`, `build_succeeded`,
  `test_passed`, `test_failed`, `deploy_started`, `health_check_passed`,
  `health_check_failed`, `rollback_triggered`, `completed`) — not a Prisma
  enum, so a new pipeline stage never requires a migration.

### HealthCheck

A point-in-time status for one monitored component
(spec Key Entity: **Health Check Result**).

```prisma
model HealthCheck {
  id         String           @id @default(cuid())
  component  HealthComponent
  status     HealthStatus
  latencyMs  Int?
  detail     Json?
  checkedAt  DateTime         @default(now())

  @@index([component, checkedAt])
}
```

- High write volume, short retention (see Retention Policies below) —
  `checkedAt`-only queries never need a join.

### SystemMetric

A single recorded metric sample (resource usage / performance).

```prisma
model SystemMetric {
  id         String   @id @default(cuid())
  metricName String
  value      Float
  unit       String
  tags       Json?
  recordedAt DateTime @default(now())

  @@index([metricName, recordedAt])
}
```

- `metricName`: open string vocabulary (`response_time_ms`, `cpu_usage_pct`,
  `memory_usage_mb`, `db_connection_count`, `db_size_bytes`,
  `throughput_rps`) for the same reason as `DeploymentEvent.type`.
- `tags`: optional dimension breakdown (e.g., `{ "route": "/api/projects",
  "environment": "PRODUCTION" }`), never used in a `WHERE` clause directly
  (would require a GIN index if so) — filtering happens on `metricName` +
  time range, `tags` is read-only context in the response payload.

### LogEntry

The centralized, searchable log store (FR-019–FR-024). See research.md §8
for how this coexists with `009`'s `SecurityAuditLog`.

```prisma
model LogEntry {
  id         String      @id @default(cuid())
  category   LogCategory
  level      LogLevel
  message    String
  requestId  String?
  source     String?
  context    Json?
  occurredAt DateTime    @default(now())

  @@index([category, occurredAt])
  @@index([level, occurredAt])
  @@index([requestId])
}
```

- `context`: MUST NOT contain secrets or full request bodies (FR-024) —
  enforced by convention at every call site of `logger.persist()`, the same
  discipline already documented for `logger.error`'s existing `fields`
  parameter.
- `requestId` is the correlation key referenced in research.md §21.

### BackupJob

A configured, scheduled backup policy — distinct from `009`'s per-project
`Backup` (research.md §0).

```prisma
model BackupJob {
  id              String    @id @default(cuid())
  name            String    @unique
  environment     Environment
  scheduleCron    String
  retentionDays   Int
  enabled         Boolean   @default(true)
  lastRunAt       DateTime?
  nextRunAt       DateTime?
  history         BackupHistory[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([environment, enabled])
}
```

- Seed data (documented in quickstart.md): one `BackupJob` row for
  Production, `scheduleCron = "0 * * * *"` (hourly), `retentionDays = 30`
  (spec Assumptions default).

### BackupHistory

One executed (or attempted) backup run (spec Key Entity: **Backup**).

```prisma
model BackupHistory {
  id              String        @id @default(cuid())
  backupJobId     String
  backupJob       BackupJob     @relation(fields: [backupJobId], references: [id], onDelete: Cascade)
  status          BackupStatus  @default(PENDING)
  sizeBytes       BigInt?
  storageLocation String?
  checksum        String?
  errorMessage    String?
  startedAt       DateTime      @default(now())
  completedAt     DateTime?
  expiresAt       DateTime

  @@index([backupJobId, startedAt])
  @@index([expiresAt])
}
```

- `expiresAt` is computed at creation time
  (`startedAt + backupJob.retentionDays`) so the retention sweep (FR-028) is
  a single indexed `WHERE expiresAt < now()` query, never a join-time
  calculation.

### MaintenanceWindow

A period during which the system is in a controlled operational state
(spec Key Entity: **Maintenance Window**).

```prisma
model MaintenanceWindow {
  id              String             @id @default(cuid())
  status          MaintenanceStatus  @default(SCHEDULED)
  reason          String
  notifyMessage   String?
  initiatedBy     String
  startedAt       DateTime           @default(now())
  endedAt         DateTime?

  @@index([status])
}
```

- `middleware.ts` (research.md §20) queries "is there a row with
  `status = ACTIVE`" on every request — a single-row lookup, indexed on
  `status`, cheap enough to run unconditionally.
- Concurrency (spec Edge Cases: "two operators activate maintenance mode
  simultaneously"): activation is an upsert guarded by a unique partial
  condition enforced at the repository level (only one `ACTIVE` row permitted
  at a time; a second activation attempt while one is already `ACTIVE`
  returns the existing window rather than creating a duplicate).

### SystemNotification

An alert or operator-facing notification (spec Key Entity: **Alert**,
generalized to cover release/incident notices surfaced on the operations
dashboard, FR-018).

```prisma
model SystemNotification {
  id           String                @id @default(cuid())
  type         String
  severity     NotificationSeverity
  title        String
  message      String
  acknowledgedBy String?
  createdAt    DateTime              @default(now())
  resolvedAt   DateTime?

  @@index([severity, createdAt])
  @@index([resolvedAt])
}
```

- `type`: open string vocabulary (`health_alert`, `deployment_failed`,
  `backup_failed`, `maintenance_scheduled`) — same rationale as
  `DeploymentEvent.type`/`SystemMetric.metricName`.
- An alert "clearing" (FR-018) sets `resolvedAt`; it is never deleted, so
  `SC-007`'s false-positive measurement remains auditable.

## Relationships Diagram

```text
ReleaseVersion 1───* DeploymentHistory *───1 (self: rolledBackFrom)
DeploymentHistory 1───* DeploymentEvent

BackupJob 1───* BackupHistory

HealthCheck        (standalone, time-series)
SystemMetric       (standalone, time-series)
LogEntry           (standalone, time-series)
MaintenanceWindow  (standalone, low-volume)
SystemNotification (standalone, low-volume)
```

## Retention Policies

| Model | Default retention | Enforcement |
|---|---|---|
| `ReleaseVersion` / `DeploymentHistory` / `DeploymentEvent` | Indefinite | Low volume, audit/compliance value (mirrors `009`'s `SecurityAuditLog` — never purged) |
| `HealthCheck` | 7 days raw | Scheduled sweep (`POST /api/ops/retention/run-due`, reuses `CRON_SECRET` convention); longer trends read from `SystemMetric` rollups, not raw `HealthCheck` rows |
| `SystemMetric` | 30 days raw | Same scheduled sweep |
| `LogEntry` | 90 days | Same scheduled sweep; matches common compliance-adjacent minimums without over-committing to a specific regulatory regime |
| `BackupHistory` | Per-`BackupJob.retentionDays` (default 30 days) | Same scheduled sweep, `WHERE expiresAt < now()` (FR-028) |
| `MaintenanceWindow` | Indefinite | Low volume |
| `SystemNotification` | 180 days | Same scheduled sweep |

All retention sweeps are one new scheduled endpoint,
`POST /api/ops/retention/run-due` (contracts/api-contracts.md), run daily —
one job, one code path, six `DELETE ... WHERE` statements, not six separate
schedules.

## Validation Rules (Zod, `src/shared/contracts/ops.schema.ts`)

- `ReleaseVersion.version`: non-empty, matches `^v\d{4}\.\d{2}\.\d{2}-\d+$`.
- `DeploymentHistory.environment`: one of the four `Environment` enum values.
- `BackupJob.scheduleCron`: valid 5-field cron expression (structural
  validation only — no execution-time guarantee is asserted by the schema).
- `BackupJob.retentionDays`: integer, `1 <= n <= 3650`.
- `MaintenanceWindow.reason`: non-empty, max 500 characters.
- `SystemNotification.severity`/`LogEntry.level`/`LogEntry.category`: enum
  membership only — Zod schemas mirror the Prisma enums 1:1
  (`z.nativeEnum`-equivalent pattern already used elsewhere in the codebase
  for constrained string fields).
