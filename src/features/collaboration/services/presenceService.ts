import type { Presence, PresenceHeartbeatInput } from "@/shared/contracts/presence.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the presence API (US9). */
export const presenceService = {
  heartbeat(projectId: string, input: PresenceHeartbeatInput): Promise<{ presence: Presence }> {
    return apiFetch(`/api/projects/${projectId}/presence/heartbeat`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
  getSnapshot(projectId: string): Promise<{ presence: Presence[] }> {
    return apiFetch(`/api/projects/${projectId}/presence`)
  },
}
