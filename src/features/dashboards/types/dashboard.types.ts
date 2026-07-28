export type { CreateDashboardRequestInput, UpdateDashboardRequestInput } from "@/shared/contracts/dashboard.schema"
export type { CreateWidgetRequestInput, UpdateWidgetRequestInput, SaveLayoutRequestInput } from "@/shared/contracts/widget.schema"
export type { CreateFilterRequestInput } from "@/shared/contracts/dashboardFilter.schema"
export type {
  CreateReportRequestInput,
  CreateScheduledReportRequestInput,
  UpdateScheduledReportRequestInput,
} from "@/shared/contracts/report.schema"

/** `"owner" | "edit" | "view"` — a user with no access at all never receives a `Dashboard` row (research.md Decision 7). */
export type DashboardEffectivePermission = "owner" | "edit" | "view"

/** Client-facing shape of a `Dashboard` row, as returned by every dashboard Route Handler — dates are ISO strings over HTTP. */
export interface DashboardRecord {
  id: string
  projectId: string
  ownerId: string
  name: string
  templateId: string | null
  visibility: "private" | "public"
  /** Computed for the requesting user — never cached past one request (research.md Decision 7). */
  effectivePermission: DashboardEffectivePermission
  isFavorite: boolean
  sharedWithMe: boolean
  /**
   * Embedded on `getDashboardById` only (single-dashboard detail) — empty
   * on `listDashboardsForProject` rows, matching `AnalysisRun`'s "one
   * query, embedded relations" precedent for a *detail* fetch; a list
   * fetch never eagerly loads every dashboard's full widget set.
   */
  widgets: (DashboardWidgetRecord & { layouts: WidgetLayoutRecord[] })[]
  createdAt: string
  updatedAt: string
}

/** Client-facing shape of a `DashboardWidget` row (data-model.md, US2). */
export interface DashboardWidgetRecord {
  id: string
  dashboardId: string
  type: string
  title: string | null
  dataSourceType: string | null
  dataSourceId: string | null
  config: unknown
  groupId: string | null
  isCollapsed: boolean
  createdAt: string
  updatedAt: string
}

/** Client-facing shape of a `WidgetLayout` row (data-model.md, US3). */
export interface WidgetLayoutRecord {
  id: string
  widgetId: string
  breakpoint: "desktop" | "tablet" | "mobile"
  x: number
  y: number
  w: number
  h: number
}

/** Client-facing shape of a `DashboardTemplate` row (data-model.md, US8). */
export interface DashboardTemplateRecord {
  id: string
  key: string
  name: string
  description: string | null
  widgetsBlueprint: unknown
  createdAt: string
  updatedAt: string
}

/** Client-facing shape of a `DashboardShare` row (data-model.md, US7). */
export interface DashboardShareRecord {
  id: string
  dashboardId: string
  userId: string
  permission: "view" | "edit"
  grantedByUserId: string
  createdAt: string
}

/** Client-facing shape of a `DashboardFilter` row (data-model.md, US6). */
export interface DashboardFilterRecord {
  id: string
  dashboardId: string
  widgetId: string | null
  filterType: "date" | "layer" | "project" | "attribute" | "spatial"
  config: unknown
  createdAt: string
  updatedAt: string
}

/** Client-facing shape of a `Report` row (data-model.md, US5) — `fileContent` is never included; see `GET /api/reports/:reportId/download`. */
export interface ReportRecord {
  id: string
  dashboardId: string
  userId: string
  scheduledReportId: string | null
  format: "pdf" | "excel" | "csv" | "html"
  status: "succeeded" | "failed"
  sizeBytes: number | null
  errorMessage: string | null
  createdAt: string
}

/** Client-facing shape of a `ScheduledReport` row (data-model.md, US5). */
export interface ScheduledReportRecord {
  id: string
  dashboardId: string
  userId: string
  format: "excel" | "csv" | "html"
  recurrence: "daily" | "weekly" | "monthly"
  nextRunAt: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** `GET /api/projects/:projectId/analytics/:snapshotType` response shape (data-model.md's `AnalyticsSnapshot`, exposed read-only). */
export interface AnalyticsSnapshotResponse {
  data: unknown
  computedAt: string
  isCached: boolean
}

/** `GET /api/projects/:projectId/dashboards/admin` row shape (US10/T284). */
export interface AdminDashboardRow {
  id: string
  name: string
  ownerId: string
  visibility: "private" | "public"
  shareCount: number
  widgets: { id: string; title: string | null; type: string }[]
  createdAt: string
  updatedAt: string
}

/** US10/T285 usage analytics — see `dashboardAdminRepository.getUsageAnalytics`'s docstring for why `activityCountByDashboard` is a documented proxy for "view counts," not a literal page-view metric. */
export interface UsageAnalytics {
  activityCountByDashboard: { dashboardId: string; count: number }[]
  mostUsedWidgetTypes: { type: string; count: number }[]
}

/** One `Activity` row as returned by the admin audit log (US10/T286) — a minimal client-facing shape, mirroring `ActivityWidget`'s own local type rather than importing server Prisma types. */
export interface AuditLogEntry {
  id: string
  userId: string
  action: string
  targetType: string
  targetId: string | null
  createdAt: string
}
