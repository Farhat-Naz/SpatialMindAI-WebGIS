"use client"

import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { bbox as turfBbox } from "@turf/turf"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/components/ui/context-menu"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import { useFeatures } from "@/features/database/hooks/useFeatures"
import { featureService } from "@/features/database/services/featureService"
import { queryKeys } from "@/features/database/services/queryKeys"
import { useCopyFeature, useDuplicateFeature } from "@/features/database/hooks/useFeatureEditing"

interface FeatureContextMenuProps {
  layerId: string
}

/**
 * Feature Context Menu (US5, Research Decision 14) — Leaflet renders
 * feature geometry imperatively, so there is no React element for a Radix
 * `ContextMenuTrigger` to wrap directly. Instead, `FeatureLayer`'s
 * `contextmenu` handler writes the click position into
 * `editingStore.contextMenuTarget`; this component re-dispatches a native
 * `contextmenu` event onto its own invisible trigger at that exact
 * position, which Radix then positions and opens normally. Must be
 * rendered inside a `<MapContainer>`.
 */
export function FeatureContextMenu({ layerId }: FeatureContextMenuProps) {
  const map = useMap()
  const triggerRef = useRef<HTMLDivElement>(null)
  const target = useEditingStore((s) => s.contextMenuTarget)
  const clearContextMenuTarget = useEditingStore((s) => s.clearContextMenuTarget)
  const isLayerLocked = useEditingStore((s) => s.isLayerLocked)
  const setTool = useEditingStore((s) => s.setTool)
  const setLastError = useEditingStore((s) => s.setLastError)
  const clearFeatureSelection = useDatabaseStore((s) => s.clearFeatureSelection)

  const { data } = useFeatures(layerId)
  const copySelectedFeature = useCopyFeature(layerId)
  const duplicateFeature = useDuplicateFeature(layerId)

  const featureId = target?.kind === "feature" ? target.id : null
  const feature = data?.features.find((f) => f.id === featureId)
  const layerIsLocked = isLayerLocked(layerId)

  const queryClient = useQueryClient()
  // Takes the feature id as a mutate-time argument, not a hook-construction
  // closure — selecting a menu item closes the menu (clearing
  // `contextMenuTarget` and thus `featureId`) in the same tick, and
  // TanStack Query resolves `mutationFn` from the LATEST render's options
  // when the mutation actually runs, not the one active when `.mutate()`
  // was called. A closure-captured `featureId` would go stale before the
  // request fires; an explicit argument can't.
  const deleteFeatureById = useMutation({
    mutationFn: (id: string) => featureService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.featuresList(layerId) })
    },
  })

  useEffect(() => {
    if (target?.kind !== "feature") return
    if (!data?.features.some((f) => f.id === target.id)) return
    const node = triggerRef.current
    if (!node) return
    node.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: target.clientX,
        clientY: target.clientY,
      }),
    )
    // `data` is intentionally a dependency: if the target arrives before this
    // layer's features have loaded, the effect must re-run once they do,
    // rather than silently never dispatching (see contextMenus.test.tsx).
  }, [target, data])

  if (target?.kind !== "feature") return null

  function handleCopy() {
    if (!featureId) return
    copySelectedFeature(featureId)
  }

  function handleDuplicate() {
    if (!featureId || layerIsLocked) return
    duplicateFeature(featureId)
  }

  function handleEdit() {
    if (layerIsLocked) return
    setTool("edit-geometry")
  }

  function handleZoomTo() {
    if (!feature) return
    const [west, south, east, north] = turfBbox(feature.geometry)
    map.fitBounds([
      [south, west],
      [north, east],
    ])
  }

  function handleDelete() {
    if (!featureId || layerIsLocked) return
    deleteFeatureById.mutate(featureId, {
      onError: (error: unknown) => {
        setLastError(error instanceof Error ? error.message : "Failed to delete the feature.")
      },
      onSuccess: () => clearFeatureSelection(),
    })
  }

  return (
    <ContextMenu onOpenChange={(open) => !open && clearContextMenuTarget()}>
      <ContextMenuTrigger asChild>
        <div ref={triggerRef} className="pointer-events-none fixed left-0 top-0 h-0 w-0" />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleZoomTo}>Zoom to feature</ContextMenuItem>
        <ContextMenuItem onSelect={handleEdit} disabled={layerIsLocked}>
          Edit geometry
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopy}>Copy</ContextMenuItem>
        <ContextMenuItem onSelect={handleDuplicate} disabled={layerIsLocked}>
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleDelete} disabled={layerIsLocked}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
