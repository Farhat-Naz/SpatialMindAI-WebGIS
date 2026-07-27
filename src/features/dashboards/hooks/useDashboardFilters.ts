"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { dashboardFilterService } from "../services/dashboardFilterService"
import { queryKeys } from "../services/queryKeys"
import type { CreateFilterRequestInput } from "@/shared/contracts/dashboardFilter.schema"

/** A dashboard's global and widget-scoped filters (US6/FR-020). */
export function useDashboardFilters(dashboardId: string) {
  return useQuery({
    queryKey: queryKeys.dashboardFilters(dashboardId),
    queryFn: () => dashboardFilterService.listFilters(dashboardId),
    enabled: Boolean(dashboardId),
  })
}

/** Creates a global or widget-scoped filter (FR-021); invalidates the dashboard's own filter list. */
export function useCreateFilter(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateFilterRequestInput) => dashboardFilterService.createFilter(dashboardId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFilters(dashboardId) })
    },
  })
}

/** Removes a filter; invalidates the dashboard's own filter list. */
export function useDeleteFilter(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (filterId: string) => dashboardFilterService.deleteFilter(filterId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFilters(dashboardId) })
    },
  })
}
