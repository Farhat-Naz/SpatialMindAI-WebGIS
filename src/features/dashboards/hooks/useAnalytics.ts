"use client"

import { useQuery } from "@tanstack/react-query"
import { analyticsService } from "../services/analyticsService"
import { queryKeys } from "../services/queryKeys"
import { WIDGET_REFRESH_INTERVAL_MS } from "../types/dashboardConfig.constants"

/** A (possibly cached) analytics aggregate (US4); polls per research.md Decision 6, same bound as `useWidgetData`. */
export function useAnalyticsSnapshot(
  projectId: string,
  snapshotType: string,
  scopeId?: string,
  options?: { enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && Boolean(projectId) && Boolean(snapshotType)

  return useQuery({
    queryKey: queryKeys.analyticsSnapshot(projectId, snapshotType, scopeId),
    queryFn: () => analyticsService.getAnalyticsSnapshot(projectId, snapshotType, scopeId),
    enabled,
    retry: 3,
    refetchInterval: enabled ? WIDGET_REFRESH_INTERVAL_MS : false,
  })
}
