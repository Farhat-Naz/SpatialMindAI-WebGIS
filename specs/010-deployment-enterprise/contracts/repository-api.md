# Repository Contracts: Enterprise Deployment & Production Operations

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Data Model**: [data-model.md](../data-model.md)

Following the established pattern (`src/server/repositories/projectRepository.ts`
et al.): one repository file per concern, Prisma-only DB access, thrown
`NotFoundError`/`ValidationError`/`DuplicateNameError` from
`@/shared/errors/apiError` on failure — never a raw Prisma error surfaced to
a Route Handler.

## `src/server/repositories/deploymentRepository.ts`

```ts
createRelease(input: { version: string; commitSha: string; description?: string; createdBy?: string }): Promise<ReleaseVersion>
listReleases(limit?: number): Promise<ReleaseVersion[]>
createDeployment(input: { releaseVersionId: string; environment: Environment; initiatedBy?: string }): Promise<DeploymentHistory>
updateDeploymentStatus(deploymentId: string, status: DeploymentStatus, completedAt?: Date): Promise<DeploymentHistory>
appendDeploymentEvent(deploymentId: string, type: string, message?: string): Promise<DeploymentEvent>
listDeployments(filter: { environment?: Environment; limit?: number }): Promise<DeploymentHistory[]>
listDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]>
rollbackDeployment(deploymentId: string, initiatedBy: string): Promise<DeploymentHistory>
```

- `rollbackDeployment`: looks up the target deployment, throws
  `NotFoundError` if absent or not `SUCCEEDED`, throws a new
  `NoPreviousDeploymentError` (extends existing error pattern) if there is
  no earlier successful deployment for that environment (spec Edge Cases —
  "rollback requested but no known-good version exists"), otherwise creates
  a new `DeploymentHistory` row with `rolledBackFromId` set and status
  `SUCCEEDED`, and appends a `rollback_triggered` `DeploymentEvent`.

## `src/server/repositories/healthRepository.ts`

```ts
recordHealthCheck(component: HealthComponent, status: HealthStatus, latencyMs?: number, detail?: unknown): Promise<HealthCheck>
getLatestHealth(): Promise<Record<HealthComponent, HealthCheck | null>>
```

- `getLatestHealth`: one query per component (indexed on
  `[component, checkedAt]`, `orderBy: { checkedAt: "desc" }, take: 1`) — not
  a full-table scan.

## `src/server/repositories/metricRepository.ts`

```ts
recordMetric(metricName: string, value: number, unit: string, tags?: Record<string, unknown>): Promise<SystemMetric>
queryMetrics(metricName: string, from: Date, to: Date): Promise<SystemMetric[]>
```

## `src/server/repositories/logRepository.ts`

```ts
recordLogEntry(input: { category: LogCategory; level: LogLevel; message: string; requestId?: string; source?: string; context?: unknown }): Promise<LogEntry>
queryLogs(filter: { category?: LogCategory; level?: LogLevel; from?: Date; to?: Date; cursor?: string; limit?: number }): Promise<{ entries: LogEntry[]; nextCursor: string | null }>
```

- `recordLogEntry`: called by `logger.persist()` (research.md §8) — this is
  the **only** repository function permitted to write `LogEntry`, keeping
  the "no secrets in logs" rule (FR-024) enforceable in one place via a
  lightweight allow-listed-key check on `context` before insert.

## `src/server/repositories/backupRepository.ts` (010's — distinct from `009`'s per-project `backupRepository.ts`, see research.md §0; **file name collision to be resolved during `/speckit-tasks`** by namespacing, e.g. `opsBackupRepository.ts`)

```ts
listBackupJobs(environment?: Environment): Promise<BackupJob[]>
getDueBackupJobs(now: Date): Promise<BackupJob[]>
recordBackupRun(backupJobId: string, status: BackupStatus, result?: { sizeBytes?: bigint; storageLocation?: string; checksum?: string; errorMessage?: string }): Promise<BackupHistory>
listBackupHistory(backupJobId: string, limit?: number): Promise<BackupHistory[]>
sweepExpiredBackups(now: Date): Promise<number>
```

## `src/server/repositories/maintenanceRepository.ts`

```ts
getActiveMaintenanceWindow(): Promise<MaintenanceWindow | null>
activateMaintenance(input: { reason: string; notifyMessage?: string; initiatedBy: string }): Promise<MaintenanceWindow>
deactivateMaintenance(id: string): Promise<MaintenanceWindow>
```

- `activateMaintenance`: transactional check-then-insert guarding against
  the two-operators-race edge case (data-model.md concurrency note) —
  re-reads for an existing `ACTIVE` row inside the same transaction before
  inserting.

## `src/server/repositories/notificationRepository.ts`

```ts
createNotification(input: { type: string; severity: NotificationSeverity; title: string; message: string }): Promise<SystemNotification>
listNotifications(filter: { severity?: NotificationSeverity; resolved?: boolean }): Promise<SystemNotification[]>
acknowledgeNotification(id: string, userId: string): Promise<SystemNotification>
resolveNotification(id: string): Promise<SystemNotification>
```

## `src/server/repositories/retentionRepository.ts`

```ts
sweepExpired(now: Date): Promise<{
  healthCheck: number
  systemMetric: number
  logEntry: number
  backupHistory: number
  systemNotification: number
}>
```

- One function, six `deleteMany({ where: { ... < now } })` calls per the
  Retention Policies table (data-model.md) — no per-table scheduled job.
