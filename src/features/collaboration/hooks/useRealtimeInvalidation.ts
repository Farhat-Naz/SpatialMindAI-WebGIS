"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys as databaseQueryKeys } from "@/features/database/services/queryKeys"
import { closeRealtimeClient, getRealtimeClient } from "../services/realtimeClient"
import { queryKeys } from "../services/queryKeys"
import { useCollaborationStore } from "../store/collaborationStore"

interface CommentEventPayload {
  featureId: string
}

interface FeatureEventPayload {
  layerId: string
}

interface NotificationEventPayload {
  unreadCount?: number
}

interface PresenceEventPayload {
  userId: string
  cursorLng: number | null
  cursorLat: number | null
  viewportBounds: [number, number, number, number] | null
  currentFeatureId: string | null
  lastSeenAt: string
}

interface LockEventPayload {
  featureId: string
  lockedByUserId: string | null
  expiresAt: string | null
}

/**
 * Mounted once per open project — subscribes to the shared
 * `RealtimeClient`'s `comment`/`notification`/`member`/`presence`/`lock`
 * events and calls the exact same `queryClient.invalidateQueries` a
 * corresponding mutation's `onSuccess` already would (plan.md React Query
 * Flow: realtime and self-mutation converge on one invalidation path, not
 * two parallel ones), plus updates `collaborationStore`'s live presence/
 * lock/unread-count mirrors.
 *
 * `projectId` may be `null` (no project currently open, e.g.
 * `databaseStore.selectedProjectId`) — this hook is designed to be mounted
 * unconditionally once at the app shell (matching 004's `useKeyboardShortcuts`
 * mount, T114) and simply does not open a connection until a project is
 * selected.
 */
export function useRealtimeInvalidation(projectId: string | null): void {
  const queryClient = useQueryClient()
  const setPresence = useCollaborationStore((state) => state.setPresence)
  const setLock = useCollaborationStore((state) => state.setLock)
  const clearLock = useCollaborationStore((state) => state.clearLock)
  const setUnreadCount = useCollaborationStore((state) => state.setUnreadCount)
  const setConnectionStatus = useCollaborationStore((state) => state.setConnectionStatus)

  useEffect(() => {
    if (!projectId) {
      return
    }
    const client = getRealtimeClient(projectId)

    const unsubscribeStatus = client.onStatusChange(setConnectionStatus)

    const unsubscribeComment = client.onEvent("comment", (payload) => {
      const { featureId } = payload as CommentEventPayload
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(featureId) })
    })

    const unsubscribeFeature = client.onEvent("feature", (payload) => {
      const { layerId } = payload as FeatureEventPayload
      void queryClient.invalidateQueries({ queryKey: databaseQueryKeys.featuresList(layerId) })
    })

    const unsubscribeLayer = client.onEvent("layer", () => {
      void queryClient.invalidateQueries({ queryKey: databaseQueryKeys.layers(projectId) })
    })

    const unsubscribeNotification = client.onEvent("notification", (payload) => {
      const { unreadCount } = payload as NotificationEventPayload
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
      if (typeof unreadCount === "number") {
        setUnreadCount(unreadCount)
      }
    })

    const unsubscribeMember = client.onEvent("member", () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(projectId) })
    })

    const unsubscribePresence = client.onEvent("presence", (payload) => {
      const presence = payload as PresenceEventPayload
      setPresence(presence.userId, presence)
    })

    const unsubscribeLock = client.onEvent("lock", (payload) => {
      const lock = payload as LockEventPayload
      if (lock.lockedByUserId && lock.expiresAt) {
        setLock(lock.featureId, { lockedByUserId: lock.lockedByUserId, expiresAt: lock.expiresAt })
      } else {
        clearLock(lock.featureId)
      }
    })

    return () => {
      unsubscribeStatus()
      unsubscribeComment()
      unsubscribeFeature()
      unsubscribeLayer()
      unsubscribeNotification()
      unsubscribeMember()
      unsubscribePresence()
      unsubscribeLock()
      // This hook is the sole mount point for a project's SSE connection
      // (T114 — exactly one open EventSource per active project per tab),
      // so its own cleanup is what closes the underlying connection, not
      // just this hook's local callbacks.
      closeRealtimeClient(projectId)
    }
  }, [projectId, queryClient, setPresence, setLock, clearLock, setUnreadCount, setConnectionStatus])
}
