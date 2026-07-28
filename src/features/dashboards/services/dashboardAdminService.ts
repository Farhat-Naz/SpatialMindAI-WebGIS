import type { AdminDashboardRow, AuditLogEntry, UsageAnalytics } from "../types/dashboard.types"
import { apiFetch } from "./apiFetch"

/** Client access to the Administration endpoints (US10) — Project-Owner-only, enforced server-side (T288). */
export const dashboardAdminService = {
  getAdminOverview(projectId: string): Promise<{ dashboards: AdminDashboardRow[]; usage: UsageAnalytics }> {
    return apiFetch(`/api/projects/${projectId}/dashboards/admin`)
  },

  listAuditLog(
    projectId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<{ activities: AuditLogEntry[]; nextCursor: string | null }> {
    const search = new URLSearchParams()
    if (params?.cursor) search.set("cursor", params.cursor)
    if (params?.limit !== undefined) search.set("limit", String(params.limit))
    const query = search.toString()
    return apiFetch(`/api/projects/${projectId}/dashboards/admin/audit${query ? `?${query}` : ""}`)
  },
}
