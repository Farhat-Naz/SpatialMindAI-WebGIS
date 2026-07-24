/** Retention window in days before a `HealthCheck` row is swept (data-model.md). */
export const HEALTH_CHECK_RETENTION_DAYS = 7

/** Retention window in days before a `SystemMetric` row is swept (data-model.md). */
export const SYSTEM_METRIC_RETENTION_DAYS = 30

/** Retention window in days before a `LogEntry` row is swept (data-model.md). */
export const LOG_ENTRY_RETENTION_DAYS = 90

/** Retention window in days before a `SystemNotification` row is swept (data-model.md). */
export const SYSTEM_NOTIFICATION_RETENTION_DAYS = 180

/** Default `BackupJob.retentionDays` for a newly-seeded job (spec.md Assumptions). */
export const DEFAULT_BACKUP_RETENTION_DAYS = 30

/** Rate-limit bucket for the deployment-webhook write endpoints (deploy/rollback). */
export const RATE_LIMIT_BUCKET_DEPLOY_WEBHOOK = "ops:deploy-webhook"

/** Rate-limit bucket for the maintenance-mode activate/deactivate endpoints. */
export const RATE_LIMIT_BUCKET_MAINTENANCE_TOGGLE = "ops:maintenance-toggle"

/** SC-007: operators must be alerted within this many minutes of a genuine degradation. */
export const ALERT_BUDGET_MINUTES = 5

/** SC-006: a defective release must be rollback-able within this many minutes. */
export const ROLLBACK_BUDGET_MINUTES = 10

/**
 * Minimum consecutive unhealthy/breached samples required before a
 * `SystemNotification` is created (research.md §7/§21) — avoids a single
 * transient blip crossing SC-007's <5% false-positive budget.
 */
export const ALERT_MIN_CONSECUTIVE_BREACHES = 2
