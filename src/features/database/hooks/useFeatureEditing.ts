"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { featureService } from "@/features/database/services/featureService"
import { queryKeys } from "@/features/database/services/queryKeys"
import { useCreateFeature, useFeatures } from "@/features/database/hooks/useFeatures"
import { useEditingStore } from "@/features/database/store/editingStore"
import { snapshotFeature } from "@/features/database/utils/featureSnapshot"
import { exportLayerAsGeoJson } from "@/features/database/services/exportLayer"
import type { ImportFeatureCollectionInput } from "@/shared/contracts/geoJsonImport.schema"

/**
 * Replays the inverse of the single most recent edit/delete action
 * (Research Decision 4) — one step only, no redo, nothing persisted across
 * a page reload (spec.md Assumptions, amended). Every mutating hook
 * (create/update/delete) is responsible for writing a fresh `UndoSnapshot`
 * to `editingStore` in its own `onSuccess`; this hook only ever reads and
 * replays it.
 */
export function useUndoLastEdit() {
  const undoSnapshot = useEditingStore((s) => s.undoSnapshot)
  const clearUndoSnapshot = useEditingStore((s) => s.clearUndoSnapshot)
  const setLastError = useEditingStore((s) => s.setLastError)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!undoSnapshot) return null

      switch (undoSnapshot.kind) {
        case "geometry":
          await featureService.update(undoSnapshot.featureId, {
            geometry: undoSnapshot.previousValue,
          })
          return undoSnapshot
        case "attributes":
          await featureService.update(undoSnapshot.featureId, {
            attributes: undoSnapshot.previousValue,
          })
          return undoSnapshot
        case "style": {
          if (!undoSnapshot.previousValue) {
            // The existing update contract can set/replace a style but
            // cannot explicitly clear it back to "no style" — restoring
            // that exact prior state isn't representable via the current
            // API. Surfaced clearly rather than silently doing nothing.
            throw new Error(
              "Can't fully undo this style change (the feature had no style before) — edit it manually if needed.",
            )
          }
          await featureService.update(undoSnapshot.featureId, {
            style: undoSnapshot.previousValue,
          })
          return undoSnapshot
        }
        case "delete":
          await featureService.create(undoSnapshot.layerId, {
            geometry: undoSnapshot.previousValue.geometry,
            attributes: undoSnapshot.previousValue.attributes,
            style: undoSnapshot.previousValue.style ?? undefined,
          })
          return undoSnapshot
        default:
          return undoSnapshot
      }
    },
    onSuccess: (snapshot) => {
      if (snapshot?.kind === "delete") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.featuresList(snapshot.layerId) })
      } else if (snapshot) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.feature(snapshot.featureId) })
      }
      clearUndoSnapshot()
    },
    onError: (error) => {
      setLastError(error instanceof Error ? error.message : "Failed to undo the last edit.")
    },
  })
}

/** Snapshots a layer's feature into `editingStore.clipboard`, replacing any prior copy (FR-027c). */
export function useCopyFeature(layerId: string) {
  const { data } = useFeatures(layerId)
  const copyFeature = useEditingStore((s) => s.copyFeature)

  return function copySelectedFeature(featureId: string) {
    const feature = data?.features.find((f) => f.id === featureId)
    if (!feature) return
    copyFeature(snapshotFeature(feature))
  }
}

/** Creates a new, independent feature from the current clipboard snapshot (FR-027d). */
export function usePasteFeature(layerId: string) {
  const clipboard = useEditingStore((s) => s.clipboard)
  const createFeature = useCreateFeature(layerId)

  return {
    canPaste: clipboard !== null,
    paste: () => {
      if (!clipboard) return
      createFeature.mutate({
        geometry: clipboard.geometry,
        attributes: clipboard.attributes,
        style: clipboard.style ?? undefined,
      })
    },
  }
}

/** Copy-and-paste in a single action, without touching the clipboard (FR-027e). */
export function useDuplicateFeature(layerId: string) {
  const { data } = useFeatures(layerId)
  const createFeature = useCreateFeature(layerId)

  return function duplicateFeature(featureId: string) {
    const feature = data?.features.find((f) => f.id === featureId)
    if (!feature) return
    const snapshot = snapshotFeature(feature)
    createFeature.mutate({
      geometry: snapshot.geometry,
      attributes: snapshot.attributes,
      style: snapshot.style ?? undefined,
    })
  }
}

/**
 * Deletes every currently multi-selected feature (US5). A client-side batch
 * over the existing single-feature delete endpoint — deletion has no
 * all-or-nothing requirement in the spec, unlike bulk import (Research
 * Decision 11 scope).
 */
export function useBulkDeleteFeatures(layerId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (featureIds: string[]) => {
      await Promise.all(featureIds.map((featureId) => featureService.remove(featureId)))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.featuresList(layerId) })
    },
  })
}

/**
 * Bulk-imports a GeoJSON `FeatureCollection` (or a Shapefile already
 * converted to one client-side, Research Decision 19) into a layer, via the
 * same append-only, all-or-nothing endpoint both formats share.
 */
export function useImportFeatures(layerId: string) {
  const queryClient = useQueryClient()
  const setImportResult = useEditingStore((s) => s.setImportResult)

  return useMutation({
    mutationFn: (input: ImportFeatureCollectionInput) =>
      featureService.importFeatureCollection(layerId, input),
    onSuccess: (result) => {
      setImportResult({ status: "success", importedCount: result.importedCount })
      void queryClient.invalidateQueries({ queryKey: queryKeys.featuresList(layerId) })
    },
    onError: (error) => {
      setImportResult({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Failed to import features.",
      })
    },
  })
}

/**
 * Exports a layer's complete feature set as a downloaded `.geojson` file.
 * Aggregation across cursor pages happens in `exportLayerAsGeoJson`; this
 * hook only owns the download side-effect and loading/error state.
 */
export function useExportLayer(layerId: string, layerName: string) {
  const setLastError = useEditingStore((s) => s.setLastError)

  return useMutation({
    mutationFn: () => exportLayerAsGeoJson(layerId),
    onSuccess: (collection) => {
      const blob = new Blob([JSON.stringify(collection, null, 2)], {
        type: "application/geo+json",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${layerName}.geojson`
      anchor.click()
      URL.revokeObjectURL(url)
    },
    onError: (error) => {
      setLastError(error instanceof Error ? error.message : "Failed to export the layer.")
    },
  })
}
