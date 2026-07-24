"use client"

import { useEffect } from "react"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import { useDeleteFeature } from "@/features/database/hooks/useFeatures"
import {
  useBulkDeleteFeatures,
  useCopyFeature,
  usePasteFeature,
  useUndoLastEdit,
} from "@/features/database/hooks/useFeatureEditing"

function isTextInputFocused(): boolean {
  const element = document.activeElement
  if (!element) return false
  const tag = element.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || (element as HTMLElement).isContentEditable
}

/**
 * Global keyboard shortcuts (US8, Research Decision 17 — a single
 * `keydown` listener, no new library): Delete/Backspace (delete
 * selection), Escape (dismiss context menu, else cancel the active tool),
 * Ctrl/Cmd+Z (undo), Ctrl/Cmd+C (copy), Ctrl/Cmd+V (paste). Every binding
 * dispatches to the exact same action its equivalent UI control already
 * triggers (T028, T059, T060, T062). Disabled whenever a text input or
 * contenteditable element is focused, so typing in the rename/attribute
 * fields behaves normally.
 */
export function useKeyboardShortcuts() {
  const selectedLayerId = useDatabaseStore((s) => s.selectedLayerId)
  const selectedFeatureId = useDatabaseStore((s) => s.selectedFeatureId)
  const selectedFeatureIds = useDatabaseStore((s) => s.selectedFeatureIds)
  const clearFeatureSelection = useDatabaseStore((s) => s.clearFeatureSelection)
  const tool = useEditingStore((s) => s.tool)
  const cancelDraft = useEditingStore((s) => s.cancelDraft)
  const contextMenuTarget = useEditingStore((s) => s.contextMenuTarget)
  const clearContextMenuTarget = useEditingStore((s) => s.clearContextMenuTarget)
  const isLayerLocked = useEditingStore((s) => s.isLayerLocked)
  const setLastError = useEditingStore((s) => s.setLastError)

  const layerId = selectedLayerId ?? ""
  const layerIsLocked = selectedLayerId ? isLayerLocked(selectedLayerId) : false

  const deleteFeature = useDeleteFeature(selectedFeatureId ?? "", layerId)
  const bulkDelete = useBulkDeleteFeatures(layerId)
  const undoLastEdit = useUndoLastEdit()
  const copySelectedFeature = useCopyFeature(layerId)
  const { paste } = usePasteFeature(layerId)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTextInputFocused()) return

      if (event.key === "Delete" || event.key === "Backspace") {
        if (layerIsLocked || selectedFeatureIds.length === 0) return
        event.preventDefault()
        const onError = (error: unknown) => {
          setLastError(error instanceof Error ? error.message : "Failed to delete.")
        }
        if (selectedFeatureIds.length > 1) {
          bulkDelete.mutate(selectedFeatureIds, { onSuccess: clearFeatureSelection, onError })
        } else {
          deleteFeature.mutate(undefined, { onSuccess: clearFeatureSelection, onError })
        }
        return
      }

      if (event.key === "Escape") {
        if (contextMenuTarget) {
          clearContextMenuTarget()
        } else if (tool) {
          cancelDraft()
        }
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        undoLastEdit.mutate()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (!selectedFeatureId) return
        copySelectedFeature(selectedFeatureId)
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        if (layerIsLocked) return
        paste()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  })
}
