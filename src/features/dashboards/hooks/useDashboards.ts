"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { dashboardService } from "../services/dashboardService"
import { queryKeys } from "../services/queryKeys"
import type { CreateDashboardRequestInput } from "../types/dashboard.types"

/**
 * Query/mutation hooks over `dashboardService.ts` (contracts/client-api.md
 * `useDashboards.ts`). `useSetFavorite` here satisfies the roadmap outline's
 * "useFavorites" (T102) and `useDashboardTemplates` satisfies "useTemplates"
 * (T100) — neither warrants its own file for one hook.
 */

const TEMPLATES_STALE_TIME_MS = 10 * 60 * 1000

/** Cursor-paginated dashboard list for a project (US1). */
export function useDashboards(projectId: string, params?: { cursor?: string; limit?: number; favoritesOnly?: boolean }) {
  return useQuery({
    queryKey: queryKeys.dashboards(projectId, params),
    queryFn: () => dashboardService.listDashboards(projectId, params),
    enabled: Boolean(projectId),
  })
}

/** Single dashboard detail. */
export function useDashboard(dashboardId: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(dashboardId),
    queryFn: () => dashboardService.getDashboard(dashboardId),
    enabled: Boolean(dashboardId),
  })
}

/** Creates a dashboard; `retry: false` (T086) — a retried creation would duplicate the dashboard. */
export function useCreateDashboard(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateDashboardRequestInput) => dashboardService.createDashboard(projectId, input),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardsList(projectId) })
    },
  })
}

/** Renames a dashboard; invalidates both the project's list and this dashboard's own detail. */
export function useRenameDashboard(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ dashboardId, name }: { dashboardId: string; name: string }) =>
      dashboardService.renameDashboard(dashboardId, name),
    onSuccess: (_data, { dashboardId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardsList(projectId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(dashboardId) })
    },
  })
}

/** Changes a dashboard's `visibility`; same invalidation as rename. */
export function useSetDashboardVisibility(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ dashboardId, visibility }: { dashboardId: string; visibility: "private" | "public" }) =>
      dashboardService.setVisibility(dashboardId, visibility),
    onSuccess: (_data, { dashboardId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardsList(projectId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(dashboardId) })
    },
  })
}

/** Deletes a dashboard; invalidates the project's list. */
export function useDeleteDashboard(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dashboardId: string) => dashboardService.deleteDashboard(dashboardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardsList(projectId) })
    },
  })
}

/** Duplicates a dashboard (FR-002); invalidates the project's list. */
export function useDuplicateDashboard(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dashboardId: string) => dashboardService.duplicateDashboard(dashboardId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardsList(projectId) })
    },
  })
}

/** Favorites/unfavorites a dashboard (FR-003) — invalidates the project's list, since `isFavorite` is embedded per-row. */
export function useSetFavorite(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ dashboardId, isFavorite }: { dashboardId: string; isFavorite: boolean }) =>
      dashboardService.setFavorite(dashboardId, isFavorite),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardsList(projectId) })
    },
  })
}

/** The five built-in templates (US8) — long `staleTime`, platform-wide, rarely-changing data. */
export function useDashboardTemplates() {
  return useQuery({
    queryKey: queryKeys.dashboardTemplates(),
    queryFn: () => dashboardService.listTemplates(),
    staleTime: TEMPLATES_STALE_TIME_MS,
  })
}
