/**
 * Public barrel for the dashboards feature (specs/008-dashboard-analytics).
 *
 * Exports types, hooks, and (from Phase 8 onward) components other features
 * may consume. Store and service files are deliberately **not** re-exported
 * here (T122) — they are this module's own internal editing/session state
 * and HTTP-wrapper implementation, consumed only by this module's own hooks
 * and components via relative imports, never directly by another feature.
 */

export type * from "./types/dashboard.types"
export type * from "./types/widget.types"

export {
  useAddWidget,
  useAnalyticsSnapshot,
  useCreateDashboard,
  useCreateFilter,
  useCreateScheduledReport,
  useDashboard,
  useDashboardFilters,
  useDashboards,
  useDashboardShares,
  useDashboardTemplates,
  useDeleteDashboard,
  useDeleteFilter,
  useDeleteScheduledReport,
  useDeleteWidget,
  useDownloadReport,
  useDuplicateDashboard,
  useGenerateReport,
  useGrantShare,
  useRenameDashboard,
  useReports,
  useRevokeShare,
  useSaveLayout,
  useScheduledReports,
  useSetDashboardVisibility,
  useSetFavorite,
  useUpdateScheduledReport,
  useUpdateWidget,
  useWidgetData,
} from "./hooks"

// Components
export { DashboardListPage } from "./components/DashboardListPage"
export { CreateDashboardDialog } from "./components/CreateDashboardDialog"
export { DashboardSettingsPanel } from "./components/DashboardSettingsPanel"
export { DashboardShareDialog } from "./components/DashboardShareDialog"
export { DashboardView } from "./components/DashboardView"
export { ReportGenerationDialog } from "./components/ReportGenerationDialog"
export { ReportHistoryPanel } from "./components/ReportHistoryPanel"
export { ScheduledReportsPanel } from "./components/ScheduledReportsPanel"
