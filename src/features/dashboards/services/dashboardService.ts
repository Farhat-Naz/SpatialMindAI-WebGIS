import type {
  CreateDashboardRequestInput,
  UpdateDashboardRequestInput,
} from "@/shared/contracts/dashboard.schema"
import type { DashboardRecord, DashboardTemplateRecord } from "../types/dashboard.types"
import { apiFetch } from "./apiFetch"

/**
 * Client access to the dashboard CRUD/favorite/template endpoints
 * (contracts/client-api.md `dashboardService.ts`). Thin `apiFetch` wrappers
 * only (Constitution Principle I) — no retry, no sequencing.
 *
 * `listTemplates`/`setFavorite` here satisfy the roadmap outline's
 * "TemplateService"/"FavoriteService" — neither is large enough to warrant
 * its own file (T085).
 */

function toQueryString(params?: { cursor?: string; limit?: number; favoritesOnly?: boolean }): string {
  if (!params) return ""
  const search = new URLSearchParams()
  if (params.cursor) search.set("cursor", params.cursor)
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.favoritesOnly !== undefined) search.set("favoritesOnly", String(params.favoritesOnly))
  const query = search.toString()
  return query ? `?${query}` : ""
}

export const dashboardService = {
  listDashboards(
    projectId: string,
    params?: { cursor?: string; limit?: number; favoritesOnly?: boolean },
  ): Promise<{ dashboards: DashboardRecord[]; nextCursor: string | null }> {
    return apiFetch(`/api/projects/${projectId}/dashboards${toQueryString(params)}`)
  },

  createDashboard(projectId: string, input: CreateDashboardRequestInput): Promise<{ dashboard: DashboardRecord }> {
    return apiFetch(`/api/projects/${projectId}/dashboards`, { method: "POST", body: JSON.stringify(input) })
  },

  getDashboard(dashboardId: string): Promise<{ dashboard: DashboardRecord }> {
    return apiFetch(`/api/dashboards/${dashboardId}`)
  },

  renameDashboard(dashboardId: string, name: string): Promise<{ dashboard: DashboardRecord }> {
    const body: UpdateDashboardRequestInput = { name }
    return apiFetch(`/api/dashboards/${dashboardId}`, { method: "PATCH", body: JSON.stringify(body) })
  },

  setVisibility(dashboardId: string, visibility: "private" | "public"): Promise<{ dashboard: DashboardRecord }> {
    const body: UpdateDashboardRequestInput = { visibility }
    return apiFetch(`/api/dashboards/${dashboardId}`, { method: "PATCH", body: JSON.stringify(body) })
  },

  deleteDashboard(dashboardId: string): Promise<void> {
    return apiFetch(`/api/dashboards/${dashboardId}`, { method: "DELETE" })
  },

  duplicateDashboard(dashboardId: string): Promise<{ dashboard: DashboardRecord }> {
    return apiFetch(`/api/dashboards/${dashboardId}/duplicate`, { method: "POST" })
  },

  setFavorite(dashboardId: string, isFavorite: boolean): Promise<{ isFavorite: boolean }> {
    return apiFetch(`/api/dashboards/${dashboardId}/favorite`, { method: isFavorite ? "POST" : "DELETE" })
  },

  listTemplates(): Promise<{ templates: DashboardTemplateRecord[] }> {
    return apiFetch(`/api/dashboard-templates`)
  },
}
