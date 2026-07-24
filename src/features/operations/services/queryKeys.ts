import type { LogQueryFilter, NotificationFilter } from "../types/operations.types"

/**
 * Centralized, typed React Query key factory for the operations feature —
 * no other module should construct an `['ops', ...]` key by hand
 * (Constitution Principle IV, contracts/client-api.md).
 */
export const opsKeys = {
  status: () => ["ops", "status"] as const,
  diagnostics: () => ["ops", "diagnostics"] as const,
  deployments: (environment?: string) => ["ops", "deployments", environment] as const,
  deploymentEvents: (id: string) => ["ops", "deployments", id, "events"] as const,
  releases: () => ["ops", "releases"] as const,
  backupJobs: (environment?: string) => ["ops", "backups", environment] as const,
  backupHistory: (jobId: string) => ["ops", "backups", jobId, "history"] as const,
  maintenance: () => ["ops", "maintenance"] as const,
  notifications: (filter?: NotificationFilter) => ["ops", "notifications", filter] as const,
  logs: (filter?: LogQueryFilter) => ["ops", "logs", filter] as const,
  metrics: (name: string, from?: string, to?: string) => ["ops", "metrics", name, from, to] as const,
}
