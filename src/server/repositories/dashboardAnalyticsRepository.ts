import { ANALYTICS_SNAPSHOT_TTL_MS } from "@/features/dashboards/types/dashboardConfig.constants"

/**
 * Pure staleness check for `AnalyticsSnapshot.computedAt` (research.md
 * Decision 12) — deliberately isolated from any DB access so it is
 * unit-testable on its own. `getSnapshot`'s compute-if-stale-else-serve
 * logic (Phase 3) is the only caller.
 */
export function isSnapshotStale(computedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - computedAt.getTime() > ANALYTICS_SNAPSHOT_TTL_MS
}
