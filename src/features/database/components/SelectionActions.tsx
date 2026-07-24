"use client"

import { ClipboardCopy, ClipboardPaste, Copy, Trash2 } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import {
  useBulkDeleteFeatures,
  useCopyFeature,
  useDuplicateFeature,
  usePasteFeature,
} from "@/features/database/hooks/useFeatureEditing"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"

/**
 * Selection Actions (US4/US5) — Copy, Paste, Duplicate, and "Delete
 * selected", all scoped to the current `databaseStore` selection. Delete
 * with exactly one feature selected reuses the same single-delete path as
 * the Drawing Toolbar's Delete button (T025); with more than one selected,
 * it batches over every selected id (T063).
 */
export function SelectionActions() {
  const selectedLayerId = useDatabaseStore((s) => s.selectedLayerId)
  const selectedFeatureId = useDatabaseStore((s) => s.selectedFeatureId)
  const selectedFeatureIds = useDatabaseStore((s) => s.selectedFeatureIds)
  const clearFeatureSelection = useDatabaseStore((s) => s.clearFeatureSelection)
  const isLayerLocked = useEditingStore((s) => s.isLayerLocked)
  const setLastError = useEditingStore((s) => s.setLastError)

  const layerId = selectedLayerId ?? ""
  const layerIsLocked = selectedLayerId ? isLayerLocked(selectedLayerId) : false

  const copySelectedFeature = useCopyFeature(layerId)
  const { canPaste, paste } = usePasteFeature(layerId)
  const duplicateFeature = useDuplicateFeature(layerId)
  const bulkDelete = useBulkDeleteFeatures(layerId)

  const hasSelection = selectedFeatureIds.length > 0
  const hasSingleSelection = selectedFeatureIds.length === 1 && Boolean(selectedFeatureId)
  const disabled = !selectedLayerId || layerIsLocked

  function handleCopy() {
    if (!selectedFeatureId) return
    copySelectedFeature(selectedFeatureId)
  }

  function handlePaste() {
    if (!canPaste) return
    paste()
  }

  function handleDuplicate() {
    if (!selectedFeatureId) return
    duplicateFeature(selectedFeatureId)
  }

  function handleDeleteSelected() {
    if (selectedFeatureIds.length === 0) return
    bulkDelete.mutate(selectedFeatureIds, {
      onError: (error) => {
        setLastError(error instanceof Error ? error.message : "Failed to delete the selected features.")
      },
      onSuccess: () => {
        clearFeatureSelection()
      },
    })
  }

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Copy selected feature"
        onClick={handleCopy}
        disabled={disabled || !hasSingleSelection}
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Paste feature"
        onClick={handlePaste}
        disabled={disabled || !canPaste}
      >
        <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Duplicate selected feature"
        onClick={handleDuplicate}
        disabled={disabled || !hasSingleSelection}
      >
        <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Delete selected features"
        onClick={handleDeleteSelected}
        disabled={disabled || !hasSelection}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
