import { WIDGET_REFRESH_INTERVAL_MS } from "../types/dashboardConfig.constants"
import type { DashboardRecord } from "../types/dashboard.types"

interface DashboardAnalyticsSummaryProps {
  dashboard: DashboardRecord
}

/**
 * T281 — a small aggregate view of the *currently-open dashboard's own*
 * widget count/state (total widgets, last-updated time, live-refresh
 * status) — the "Analytics panel" the roadmap outline names, distinct from
 * any individual analytics *widget* (Phase 10, e.g. `StatisticsWidget`),
 * which reports project-wide statistics instead.
 */
export function DashboardAnalyticsSummary({ dashboard }: DashboardAnalyticsSummaryProps) {
  const refreshSeconds = Math.round(WIDGET_REFRESH_INTERVAL_MS / 1000)

  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <dt className="font-medium">Widgets</dt>
        <dd>{dashboard.widgets.length}</dd>
      </div>
      <div className="flex items-center gap-1">
        <dt className="font-medium">Last updated</dt>
        <dd>{new Date(dashboard.updatedAt).toLocaleString()}</dd>
      </div>
      <div className="flex items-center gap-1">
        <dt className="font-medium">Live refresh</dt>
        <dd>every {refreshSeconds}s</dd>
      </div>
    </dl>
  )
}
