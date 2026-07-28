"use client"

import { useQuery } from "@tanstack/react-query"
import { dashboardAdminService } from "../services/dashboardAdminService"
import { queryKeys } from "../services/queryKeys"

/** Every dashboard in the project plus usage analytics (US10/T284/T285) — Project-Owner-only; a non-Owner's request fails server-side (T288), so this simply surfaces `isError`. */
export function useDashboardAdminOverview(projectId: string) {
  return useQuery({
    queryKey: queryKeys.dashboardAdmin(projectId),
    queryFn: () => dashboardAdminService.getAdminOverview(projectId),
    enabled: Boolean(projectId),
    retry: false,
  })
}

/** The dashboard-scoped audit log (US10/T286), cursor-paginated. */
export function useDashboardAuditLog(projectId: string, params?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.dashboardAdminAudit(projectId, params),
    queryFn: () => dashboardAdminService.listAuditLog(projectId, params),
    enabled: Boolean(projectId),
    retry: false,
  })
}
