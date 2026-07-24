"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { featureService, queryKeys as databaseQueryKeys } from "@/features/database"
import type { CreateFeatureInput, UpdateFeatureInput } from "@/shared/contracts/feature.schema"
import * as offlineQueue from "../services/offlineQueue"
import type { OfflineQueueEntry } from "../services/offlineQueue"

/**
 * Decorates `database`'s existing feature mutations with the IndexedDB
 * queue-and-replay layer (research.md Decision 6) — does not duplicate
 * their validation/authorization logic, since replay calls the exact same
 * `featureService` functions those hooks call. On reconnect, queued edits
 * are replayed **in order**, one at a time; each replay either succeeds
 * normally or surfaces a `409` conflict (caught and marked, not retried
 * silently — Decision 5, never silent conflict resolution).
 */
export function useOfflineQueue() {
  const queryClient = useQueryClient()
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  /** Queues a create; skipped over the network entirely while offline. */
  const queueCreate = useCallback(async (layerId: string, input: CreateFeatureInput) => {
    await offlineQueue.enqueue({ id: crypto.randomUUID(), mutationType: "create", layerId, payload: input })
  }, [])

  /** Queues an update; skipped over the network entirely while offline. */
  const queueUpdate = useCallback(
    async (featureId: string, layerId: string, input: UpdateFeatureInput, expectedUpdatedAt?: string) => {
      await offlineQueue.enqueue({
        id: crypto.randomUUID(),
        mutationType: "update",
        featureId,
        layerId,
        payload: input,
        featureExpectedUpdatedAt: expectedUpdatedAt,
      })
    },
    [],
  )

  /** Queues a delete; skipped over the network entirely while offline. */
  const queueDelete = useCallback(async (featureId: string, layerId: string) => {
    await offlineQueue.enqueue({ id: crypto.randomUUID(), mutationType: "delete", featureId, layerId, payload: null })
  }, [])

  /** Replays every pending queued mutation, in order, one at a time. */
  const replayPending = useCallback(async () => {
    const pending = await offlineQueue.listPending()
    const touchedLayerIds = new Set<string>()

    for (const entry of pending) {
      try {
        await replayEntry(entry)
        await offlineQueue.markSubmitted(entry.id)
        if (entry.layerId) touchedLayerIds.add(entry.layerId)
      } catch (error) {
        if (error instanceof Error && error.message.includes("changed by someone else")) {
          await offlineQueue.markConflicted(entry.id)
        } else {
          // Leave as pending — a transient failure should be retried on the next reconnect.
          break
        }
      }
    }

    for (const layerId of touchedLayerIds) {
      void queryClient.invalidateQueries({ queryKey: databaseQueryKeys.featuresList(layerId) })
    }
  }, [queryClient])

  useEffect(() => {
    if (isOnline) {
      void replayPending()
    }
  }, [isOnline, replayPending])

  return { isOnline, queueCreate, queueUpdate, queueDelete, replayPending }
}

async function replayEntry(entry: OfflineQueueEntry): Promise<void> {
  if (entry.mutationType === "create" && entry.layerId) {
    await featureService.create(entry.layerId, entry.payload as CreateFeatureInput)
  } else if (entry.mutationType === "update" && entry.featureId) {
    await featureService.update(entry.featureId, {
      ...(entry.payload as UpdateFeatureInput),
      expectedUpdatedAt: entry.featureExpectedUpdatedAt,
    } as UpdateFeatureInput)
  } else if (entry.mutationType === "delete" && entry.featureId) {
    await featureService.remove(entry.featureId)
  }
}
