import type { GrantShareRequestInput } from "@/shared/contracts/dashboard.schema"
import type { DashboardShareRecord } from "../types/dashboard.types"
import { apiFetch } from "./apiFetch"

/** Client access to the dashboard sharing endpoints (contracts/client-api.md). */
export const dashboardShareService = {
  listShares(dashboardId: string): Promise<{ shares: DashboardShareRecord[] }> {
    return apiFetch(`/api/dashboards/${dashboardId}/shares`)
  },

  grantShare(dashboardId: string, input: GrantShareRequestInput): Promise<{ share: DashboardShareRecord }> {
    return apiFetch(`/api/dashboards/${dashboardId}/shares`, { method: "POST", body: JSON.stringify(input) })
  },

  revokeShare(dashboardId: string, userId: string): Promise<void> {
    return apiFetch(`/api/dashboards/${dashboardId}/shares/${userId}`, { method: "DELETE" })
  },
}
