"use client"

import { useMutation } from "@tanstack/react-query"
import { useEditingStore } from "@/features/database"
import { lockService } from "../services/lockService"

/**
 * Wraps lock acquire/release for a feature (US3). Intended to be called at
 * 004-map-editing-ui's existing edit-mode entry/exit points (`FeatureLayer`'s
 * edit-mode toggle on acquire, `DrawingToolbar`'s cancel/save on release) —
 * not a new lifecycle. A `409` conflict surfaces via `editingStore`'s
 * existing `setLastError` convention, reused rather than duplicated.
 */
export function useFeatureLock() {
  const setLastError = useEditingStore((state) => state.setLastError)

  const acquire = useMutation({
    mutationFn: (featureId: string) => lockService.acquireLock(featureId),
    onError: (error: Error) => {
      setLastError(error.message)
    },
  })

  const release = useMutation({
    mutationFn: (featureId: string) => lockService.releaseLock(featureId),
  })

  return { acquire, release }
}
