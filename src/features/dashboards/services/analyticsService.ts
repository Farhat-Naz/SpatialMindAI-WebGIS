import type { AnalyticsSnapshotResponse } from "../types/dashboard.types"
import { apiFetch } from "./apiFetch"

/** Client access to the analytics snapshot endpoint (contracts/client-api.md `analyticsService.ts`). */
export const analyticsService = {
  getAnalyticsSnapshot(projectId: string, snapshotType: string, scopeId?: string): Promise<AnalyticsSnapshotResponse> {
    const query = scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : ""
    return apiFetch(`/api/projects/${projectId}/analytics/${snapshotType}${query}`)
  },
}
