"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { dashboardShareService } from "../services/dashboardShareService"
import { queryKeys } from "../services/queryKeys"
import type { GrantShareRequestInput } from "@/shared/contracts/dashboard.schema"

/** A dashboard's share grants (US7/FR-023) — owner/project-Owner only, server-enforced. */
export function useDashboardShares(dashboardId: string) {
  return useQuery({
    queryKey: queryKeys.dashboardShares(dashboardId),
    queryFn: () => dashboardShareService.listShares(dashboardId),
    enabled: Boolean(dashboardId),
  })
}

/** Grants (or updates) a share; invalidates the dashboard's own share list. */
export function useGrantShare(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: GrantShareRequestInput) => dashboardShareService.grantShare(dashboardId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardShares(dashboardId) })
    },
  })
}

/** Revokes a share (FR-027); invalidates the dashboard's own share list. */
export function useRevokeShare(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => dashboardShareService.revokeShare(dashboardId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardShares(dashboardId) })
    },
  })
}
