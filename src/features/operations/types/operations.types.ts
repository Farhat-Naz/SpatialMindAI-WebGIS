import type {
  BackupHistory,
  BackupJob,
  BackupStatus,
  DeploymentEvent,
  DeploymentHistory,
  DeploymentStatus,
  Environment,
  HealthCheck,
  HealthComponent,
  HealthStatus,
  LogCategory,
  LogEntry,
  LogLevel,
  MaintenanceStatus,
  MaintenanceWindow,
  NotificationSeverity,
  ReleaseVersion,
  SystemMetric,
  SystemNotification,
} from "@prisma/client"

export type {
  BackupHistory,
  BackupJob,
  BackupStatus,
  DeploymentEvent,
  DeploymentHistory,
  DeploymentStatus,
  Environment,
  HealthCheck,
  HealthComponent,
  HealthStatus,
  LogCategory,
  LogEntry,
  LogLevel,
  MaintenanceStatus,
  MaintenanceWindow,
  NotificationSeverity,
  ReleaseVersion,
  SystemMetric,
  SystemNotification,
}

/** `GET /api/system/status` response shape (contracts/api-contracts.md). */
export interface SystemStatusResponse {
  status: "healthy" | "degraded" | "unhealthy"
  components: Record<
    "application" | "database" | "api",
    { status: "healthy" | "degraded" | "unhealthy"; latencyMs: number | null }
  >
  checkedAt: string
}

/** `GET /api/ops/diagnostics` response shape. */
export interface DiagnosticsResponse {
  health: SystemStatusResponse
  recentErrors: Array<{ message: string; level: LogLevel; occurredAt: string }>
  resourceStatus: { dbConnectionCount: number | null; dbSizeBytes: number | null }
  activeMaintenanceWindow: MaintenanceWindowSummary | null
  activeDeploymentId?: string | null
}

/** `DeploymentHistory` + its `ReleaseVersion`, as returned by list endpoints. */
export interface DeploymentSummary extends DeploymentHistory {
  release: Pick<ReleaseVersion, "id" | "version" | "commitSha">
}

export type BackupJobSummary = BackupJob
export type BackupHistoryEntry = BackupHistory
export type MaintenanceWindowSummary = MaintenanceWindow
export type NotificationSummary = SystemNotification
export type LogEntrySummary = LogEntry

export interface MetricSample {
  value: number
  unit: string
  recordedAt: string
  tags: Record<string, unknown> | null
}

export interface MetricSamplesResponse {
  metricName: string
  samples: MetricSample[]
}

export interface LogQueryFilter {
  category?: LogCategory
  level?: LogLevel
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

export interface NotificationFilter {
  severity?: NotificationSeverity
  resolved?: boolean
}
