"use client"

import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { presenceService } from "../services/presenceService"
import { queryKeys } from "../services/queryKeys"
import type { PresenceHeartbeatInput } from "@/shared/contracts/presence.schema"
import { useCollaborationStore } from "../store/collaborationStore"

const HEARTBEAT_INTERVAL_MS = 10_000

/**
 * Fetches the initial presence snapshot and sends a heartbeat every ~10s
 * while mounted (US9). The live-updating list itself is consumed from
 * `collaborationStore` (populated by realtime `presence` events, Phase 7)
 * — this hook's own query is the one-time initial snapshot, matching
 * `GET /api/projects/:projectId/presence`'s documented "used once on page
 * load before the SSE connection takes over" role.
 */
export function usePresence(projectId: string, heartbeatPayload?: PresenceHeartbeatInput) {
  const snapshotQuery = useQuery({
    queryKey: queryKeys.presence(projectId),
    queryFn: async () => (await presenceService.getSnapshot(projectId)).presence,
  })

  const setPresence = useCollaborationStore((state) => state.setPresence)
  const payloadRef = useRef(heartbeatPayload)
  payloadRef.current = heartbeatPayload

  useEffect(() => {
    if (snapshotQuery.data) {
      for (const presence of snapshotQuery.data) {
        setPresence(presence.userId, presence)
      }
    }
  }, [snapshotQuery.data, setPresence])

  useEffect(() => {
    const send = () => {
      void presenceService.heartbeat(projectId, payloadRef.current ?? {})
    }
    send()
    const interval = setInterval(send, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [projectId])

  return snapshotQuery
}
