"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { widgetService } from "../services/widgetService"
import { queryKeys } from "../services/queryKeys"
import { WIDGET_REFRESH_INTERVAL_MS } from "../types/dashboardConfig.constants"
import type { CreateWidgetRequestInput, SaveLayoutRequestInput, UpdateWidgetRequestInput } from "../types/dashboard.types"

/**
 * Widget CRUD/layout/data hooks (contracts/client-api.md `useWidgets.ts`).
 * Every mutation invalidates only `dashboard(dashboardId)` — widgets are
 * returned embedded in dashboard detail (T105/T106: no cross-entity or
 * cross-feature invalidation from this file).
 */

/** Adds a widget; invalidates the dashboard's own detail. */
export function useAddWidget(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateWidgetRequestInput) => widgetService.addWidget(dashboardId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(dashboardId) })
    },
  })
}

/** Updates a widget's fields; invalidates the dashboard's own detail. */
export function useUpdateWidget(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ widgetId, input }: { widgetId: string; input: UpdateWidgetRequestInput }) =>
      widgetService.updateWidget(widgetId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(dashboardId) })
    },
  })
}

/** Removes a widget; invalidates the dashboard's own detail. */
export function useDeleteWidget(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (widgetId: string) => widgetService.deleteWidget(widgetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(dashboardId) })
    },
  })
}

/**
 * Resolves one widget's current data (T107 — `dataSourceUnavailable` is a
 * first-class field on `data`, an ordinary conditional for `WidgetRenderer`
 * to render, never a thrown error). Polls at `WIDGET_REFRESH_INTERVAL_MS`
 * (research.md Decision 6) while `enabled` — the lazy-mount viewport gate
 * (research.md Decision 16) lives in the caller (`WidgetRenderer`'s
 * intersection-observer state, Phase 9), passed through as `enabled`.
 * `retry: 3` (T087) — a small bounded count so one transient network blip
 * doesn't permanently stop a widget's live updates.
 */
export function useWidgetData(dashboardId: string, widgetId: string, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && Boolean(dashboardId) && Boolean(widgetId)

  return useQuery({
    queryKey: queryKeys.widgetData(dashboardId, widgetId),
    queryFn: () => widgetService.getWidgetData(dashboardId, widgetId),
    enabled,
    retry: 3,
    refetchInterval: enabled ? WIDGET_REFRESH_INTERVAL_MS : false,
  })
}

/** Saves one breakpoint tier's layout — debounced at the call site (drag-end/resize-end, not per-frame); invalidates the dashboard's own detail. */
export function useSaveLayout(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SaveLayoutRequestInput) => widgetService.saveLayout(dashboardId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(dashboardId) })
    },
  })
}
