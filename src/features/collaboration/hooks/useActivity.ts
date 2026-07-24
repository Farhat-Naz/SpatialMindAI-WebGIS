"use client"

import { useQuery } from "@tanstack/react-query"
import { activityService } from "../services/activityService"
import { queryKeys } from "../services/queryKeys"

/** Lists a project's activity history (cursor-paginated, read-only — FR-047). */
export function useActivity(projectId: string, params?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.activity(projectId, params),
    queryFn: () => activityService.listActivity(projectId, params),
  })
}
