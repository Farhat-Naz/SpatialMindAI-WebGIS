import { z } from "zod"

/** Matches data-model.md's `ReleaseVersion.version` convention (e.g. `v2026.07.24-1`). */
const versionSchema = z
  .string()
  .trim()
  .regex(/^v\d{4}\.\d{2}\.\d{2}-\d+$/, "Version must match vYYYY.MM.DD-N")

const environmentSchema = z.enum(["DEVELOPMENT", "TESTING", "STAGING", "PRODUCTION"])

/** Structural-only cron validation — a 5-field cron expression. */
const cronSchema = z
  .string()
  .trim()
  .regex(/^(\S+\s+){4}\S+$/, "Must be a 5-field cron expression")

/** `POST /api/ops/deployments` request body (CI/CD-only, shared-secret auth). */
export const createDeploymentSchema = z.object({
  version: versionSchema,
  commitSha: z.string().trim().min(1, "commitSha is required"),
  environment: environmentSchema,
})
export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>

/** `PATCH /api/ops/deployments/:deploymentId` request body (CI/CD-only, shared-secret auth). */
export const updateDeploymentStatusSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "SUCCEEDED", "FAILED", "ROLLED_BACK"]),
  eventType: z.string().trim().min(1).optional(),
  eventMessage: z.string().trim().optional(),
})
export type UpdateDeploymentStatusInput = z.infer<typeof updateDeploymentStatusSchema>

/** `POST /api/ops/maintenance` request body. */
export const activateMaintenanceSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500, "Reason must be 500 characters or fewer"),
  notifyMessage: z.string().trim().max(500).optional(),
})
export type ActivateMaintenanceInput = z.infer<typeof activateMaintenanceSchema>

/** `POST /api/ops/backups/:backupJobId/restore` request body. */
export const requestRestoreSchema = z.object({
  backupHistoryId: z.string().trim().min(1, "backupHistoryId is required"),
  confirm: z.literal(true, { message: "Restore requires explicit confirmation" }),
})
export type RequestRestoreInput = z.infer<typeof requestRestoreSchema>

/** `BackupJob` shape validation (seed-managed; read-only via API this phase). */
export const backupJobSchema = z.object({
  name: z.string().trim().min(1),
  environment: environmentSchema,
  scheduleCron: cronSchema,
  retentionDays: z.number().int().min(1).max(3650),
  enabled: z.boolean(),
})
export type BackupJobInput = z.infer<typeof backupJobSchema>

/** `GET /api/ops/logs` query-parameter shape. */
export const logQuerySchema = z.object({
  category: z.enum(["APPLICATION", "DATABASE", "SECURITY", "AUDIT"]).optional(),
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
export type LogQueryInput = z.infer<typeof logQuerySchema>

/** `GET /api/ops/metrics` query-parameter shape. */
export const metricQuerySchema = z.object({
  metricName: z.string().trim().min(1, "metricName is required"),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
})
export type MetricQueryInput = z.infer<typeof metricQuerySchema>

/** `GET /api/ops/notifications` query-parameter shape. */
export const notificationQuerySchema = z.object({
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  resolved: z.coerce.boolean().optional(),
})
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>
