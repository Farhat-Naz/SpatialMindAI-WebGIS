import type { CreateFilterRequestInput } from "@/shared/contracts/dashboardFilter.schema"
import type { DashboardFilterRecord } from "../types/dashboard.types"
import { apiFetch } from "./apiFetch"

/** Client access to the dashboard filter endpoints (contracts/client-api.md). */
export const dashboardFilterService = {
  listFilters(dashboardId: string): Promise<{ filters: DashboardFilterRecord[] }> {
    return apiFetch(`/api/dashboards/${dashboardId}/filters`)
  },

  createFilter(dashboardId: string, input: CreateFilterRequestInput): Promise<{ filter: DashboardFilterRecord }> {
    return apiFetch(`/api/dashboards/${dashboardId}/filters`, { method: "POST", body: JSON.stringify(input) })
  },

  deleteFilter(filterId: string): Promise<void> {
    return apiFetch(`/api/filters/${filterId}`, { method: "DELETE" })
  },
}
