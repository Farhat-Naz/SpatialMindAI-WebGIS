import type { Activity } from "../types/collaboration.types"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrapper for the read-only Activity API (FR-047). */
export const activityService = {
  listActivity(
    projectId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<{ activities: Activity[]; nextCursor: string | null }> {
    const query = new URLSearchParams()
    if (params?.cursor) query.set("cursor", params.cursor)
    if (params?.limit) query.set("limit", String(params.limit))
    const suffix = query.toString() ? `?${query.toString()}` : ""
    return apiFetch(`/api/projects/${projectId}/activity${suffix}`)
  },
}
