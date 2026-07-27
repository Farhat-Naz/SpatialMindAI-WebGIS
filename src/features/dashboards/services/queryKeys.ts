/**
 * Centralized React Query key factory for the dashboards feature
 * (Constitution Principle V — no hook constructs a query key inline,
 * matching 005/007's established convention).
 */
export const queryKeys = {
  /** Prefix for a project's dashboard list — every mutation that changes it invalidates this, not `dashboards(projectId, params)` (the parameterized-key trap 005/007 already documented). */
  dashboardsList: (projectId: string) => ["projects", projectId, "dashboards"] as const,
  dashboards: (projectId: string, params?: unknown) => ["projects", projectId, "dashboards", params] as const,

  dashboard: (dashboardId: string) => ["dashboards", dashboardId] as const,

  widgetData: (dashboardId: string, widgetId: string) =>
    ["dashboards", dashboardId, "widgets", widgetId, "data"] as const,

  analyticsSnapshot: (projectId: string, snapshotType: string, scopeId?: string) =>
    ["projects", projectId, "analytics", snapshotType, scopeId] as const,

  reportsList: (projectId: string) => ["projects", projectId, "reports"] as const,
  reports: (projectId: string, params?: unknown) => ["projects", projectId, "reports", params] as const,

  scheduledReports: (dashboardId: string) => ["dashboards", dashboardId, "scheduledReports"] as const,

  dashboardShares: (dashboardId: string) => ["dashboards", dashboardId, "shares"] as const,

  dashboardFilters: (dashboardId: string) => ["dashboards", dashboardId, "filters"] as const,

  dashboardTemplates: () => ["dashboardTemplates"] as const,
}
