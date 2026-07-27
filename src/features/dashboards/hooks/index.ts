/** Hook barrel for the dashboards feature — hooks only, no components (same rationale as import-export's barrel: keep data-only consumers free of heavy component-side dependencies). */

export {
  useCreateDashboard,
  useDashboard,
  useDashboards,
  useDashboardTemplates,
  useDeleteDashboard,
  useDuplicateDashboard,
  useRenameDashboard,
  useSetDashboardVisibility,
  useSetFavorite,
} from "./useDashboards"
export { useAddWidget, useDeleteWidget, useSaveLayout, useUpdateWidget, useWidgetData } from "./useWidgets"
export { useAnalyticsSnapshot } from "./useAnalytics"
export { useDownloadReport, useGenerateReport, useReports } from "./useReports"
export {
  useCreateScheduledReport,
  useDeleteScheduledReport,
  useScheduledReports,
  useUpdateScheduledReport,
} from "./useScheduledReports"
export { useDashboardShares, useGrantShare, useRevokeShare } from "./useDashboardShares"
export { useCreateFilter, useDashboardFilters, useDeleteFilter } from "./useDashboardFilters"
