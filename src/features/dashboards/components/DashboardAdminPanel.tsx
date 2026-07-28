"use client"

import { Activity, BarChart3, History, LayoutDashboard, ShieldAlert, ShieldCheck, Timer } from "lucide-react"
import { Badge } from "@/shared/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card"
import { cn } from "@/shared/lib/utils"
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
        <ShieldAlert className="size-8 text-muted-foreground/60" aria-hidden />
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
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="size-6 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Dashboard Administration</h1>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <LayoutDashboard className="size-4 text-muted-foreground" aria-hidden />
          <h2 id="admin-dashboards-heading" className="text-sm font-semibold leading-none tracking-tight">
            Dashboards
          </h2>
        </CardHeader>
        <CardContent aria-labelledby="admin-dashboards-heading">
          {dashboards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dashboards in this project yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-1.5 font-medium">Name</th>
                    <th className="p-1.5 font-medium">Owner</th>
                    <th className="p-1.5 font-medium">Last modified</th>
                    <th className="p-1.5 font-medium">Sharing</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboards.map((dashboard) => (
                    <tr key={dashboard.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="p-1.5 font-medium">{dashboard.name}</td>
                      <td className="p-1.5 text-muted-foreground">{dashboard.ownerId}</td>
                      <td className="p-1.5 text-muted-foreground">{new Date(dashboard.updatedAt).toLocaleString()}</td>
                      <td className="p-1.5">
                        <Badge variant={dashboard.visibility === "public" ? "default" : "secondary"}>
                          {dashboard.visibility}
                          {dashboard.shareCount > 0 ? ` · shared with ${dashboard.shareCount}` : ""}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
          <h2 id="admin-usage-heading" className="text-sm font-semibold leading-none tracking-tight">
            Usage analytics
          </h2>
        </CardHeader>
        <CardContent aria-labelledby="admin-usage-heading" className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            &quot;Activity count&quot; approximates usage from logged dashboard actions (create/edit/delete/share) — this
            platform does not track individual page views.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {dashboards.map((dashboard) => (
              <li key={dashboard.id}>
                {dashboard.name}: {activityCountByDashboardId.get(dashboard.id) ?? 0} activity events
              </li>
            ))}
          </ul>
          <h3 className="text-xs font-semibold text-muted-foreground">Most-used widget types</h3>
          {usage.mostUsedWidgetTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No widgets yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {usage.mostUsedWidgetTypes.map((row) => (
                <li key={row.type}>
                  <Badge variant="outline">
                    {row.type}: {row.count}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h2 id="admin-audit-heading" className="text-sm font-semibold leading-none tracking-tight">
            Audit log
          </h2>
        </CardHeader>
        <CardContent aria-labelledby="admin-audit-heading">
          {auditLog.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading audit log…
            </p>
          ) : !auditLog.data || auditLog.data.activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dashboard-related activity yet.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {auditLog.data.activities.map((activity) => (
                <li key={activity.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="flex items-center gap-2">
                    <Activity className="size-3.5 text-muted-foreground" aria-hidden />
                    {activity.userId} — {activity.action} ({activity.targetType})
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Timer className="size-4 text-muted-foreground" aria-hidden />
          <h2 id="admin-performance-heading" className="text-sm font-semibold leading-none tracking-tight">
            Performance
          </h2>
        </CardHeader>
        <CardContent aria-labelledby="admin-performance-heading">
          {performanceRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No widgets have loaded in this session yet — open a dashboard to populate this.
            </p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {performanceRows.map((row) => {
                const isSlow = row.durationMs > SLOW_WIDGET_THRESHOLD_MS
                return (
                  <li key={row.widgetId} className="flex items-center justify-between gap-2 py-1.5">
                    <span>{row.label ? `${row.label.title} (${row.label.dashboardName})` : row.widgetId}</span>
                    <span className={cn(isSlow ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {Math.round(row.durationMs)}ms{isSlow ? " (slow)" : ""}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
