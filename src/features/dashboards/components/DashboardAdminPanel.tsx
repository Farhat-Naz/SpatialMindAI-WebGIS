"use client"

import { useDashboardAdminOverview, useDashboardAuditLog } from "../hooks/useDashboardAdmin"
import { useWidgetPerformanceStore } from "../store/widgetPerformanceStore"

interface DashboardAdminPanelProps {
  projectId: string
}

/** T287/FR-037 — a widget is flagged "slow" past this duration; a soft, informational threshold, not a hard limit. */
const SLOW_WIDGET_THRESHOLD_MS = 1000

/**
 * Dashboard Administration (US10) — Project-Owner-only (FR-038). Every
 * section is sourced from `useDashboardAdminOverview`/`useDashboardAuditLog`,
 * both of which assert the Owner role server-side (T288); `isError` here
 * (403/404 either way, non-disclosure) is what actually gates this panel —
 * there is no separate client-only permission flag that could drift from it.
 */
export function DashboardAdminPanel({ projectId }: DashboardAdminPanelProps) {
  const overview = useDashboardAdminOverview(projectId)
  const auditLog = useDashboardAuditLog(projectId)
  const durationsByWidgetId = useWidgetPerformanceStore((state) => state.durationsByWidgetId)

  if (overview.isLoading) {
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        Loading administration…
      </p>
    )
  }

  if (overview.isError || !overview.data) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          Dashboard Administration is only available to the project&apos;s Owner.
        </p>
      </div>
    )
  }

  const { dashboards, usage } = overview.data

  const widgetLabelById = new Map<string, { title: string; dashboardName: string }>()
  for (const dashboard of dashboards) {
    for (const widget of dashboard.widgets) {
      widgetLabelById.set(widget.id, { title: widget.title ?? widget.type, dashboardName: dashboard.name })
    }
  }
  const activityCountByDashboardId = new Map(usage.activityCountByDashboard.map((row) => [row.dashboardId, row.count]))

  const performanceRows = Object.entries(durationsByWidgetId)
    .map(([widgetId, entry]) => ({ widgetId, ...entry, label: widgetLabelById.get(widgetId) }))
    .sort((a, b) => b.durationMs - a.durationMs)

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-lg font-semibold">Dashboard Administration</h1>

      <section aria-labelledby="admin-dashboards-heading" className="flex flex-col gap-2">
        <h2 id="admin-dashboards-heading" className="text-sm font-semibold">
          Dashboards
        </h2>
        {dashboards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dashboards in this project yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-1 font-medium">Name</th>
                <th className="p-1 font-medium">Owner</th>
                <th className="p-1 font-medium">Last modified</th>
                <th className="p-1 font-medium">Sharing</th>
              </tr>
            </thead>
            <tbody>
              {dashboards.map((dashboard) => (
                <tr key={dashboard.id} className="border-b last:border-0">
                  <td className="p-1">{dashboard.name}</td>
                  <td className="p-1">{dashboard.ownerId}</td>
                  <td className="p-1">{new Date(dashboard.updatedAt).toLocaleString()}</td>
                  <td className="p-1">
                    {dashboard.visibility}
                    {dashboard.shareCount > 0 ? ` · shared with ${dashboard.shareCount}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="admin-usage-heading" className="flex flex-col gap-2">
        <h2 id="admin-usage-heading" className="text-sm font-semibold">
          Usage analytics
        </h2>
        <p className="text-xs text-muted-foreground">
          &quot;Activity count&quot; approximates usage from logged dashboard actions (create/edit/delete/share) — this
          platform does not track individual page views.
        </p>
        <ul className="text-sm">
          {dashboards.map((dashboard) => (
            <li key={dashboard.id}>
              {dashboard.name}: {activityCountByDashboardId.get(dashboard.id) ?? 0} activity events
            </li>
          ))}
        </ul>
        <h3 className="text-xs font-semibold">Most-used widget types</h3>
        {usage.mostUsedWidgetTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No widgets yet.</p>
        ) : (
          <ul className="text-sm">
            {usage.mostUsedWidgetTypes.map((row) => (
              <li key={row.type}>
                {row.type}: {row.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-audit-heading" className="flex flex-col gap-2">
        <h2 id="admin-audit-heading" className="text-sm font-semibold">
          Audit log
        </h2>
        {auditLog.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading audit log…
          </p>
        ) : !auditLog.data || auditLog.data.activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dashboard-related activity yet.</p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {auditLog.data.activities.map((activity) => (
              <li key={activity.id} className="flex items-center justify-between gap-2 py-1">
                <span>
                  {activity.userId} — {activity.action} ({activity.targetType})
                </span>
                <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="admin-performance-heading" className="flex flex-col gap-2">
        <h2 id="admin-performance-heading" className="text-sm font-semibold">
          Performance
        </h2>
        {performanceRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No widgets have loaded in this session yet — open a dashboard to populate this.
          </p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {performanceRows.map((row) => {
              const isSlow = row.durationMs > SLOW_WIDGET_THRESHOLD_MS
              return (
                <li key={row.widgetId} className="flex items-center justify-between gap-2 py-1">
                  <span>{row.label ? `${row.label.title} (${row.label.dashboardName})` : row.widgetId}</span>
                  <span className={isSlow ? "font-medium text-destructive" : "text-muted-foreground"}>
                    {Math.round(row.durationMs)}ms{isSlow ? " (slow)" : ""}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
