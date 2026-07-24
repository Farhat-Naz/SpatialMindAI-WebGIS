"use client"

import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { bbox as turfBbox, featureCollection as turfFeatureCollection } from "@turf/turf"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/components/ui/context-menu"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import { useFeatures } from "@/features/database/hooks/useFeatures"
import { layerService } from "@/features/database/services/layerService"
import { queryKeys } from "@/features/database/services/queryKeys"

/**
 * Layer Context Menu (US5, Research Decision 14) — mirrors the equivalent
 * Layer Tree row controls: rename (T046), delete (T047), lock/unlock
 * (T049), plus a "zoom to layer" action. Rename/delete use a native
 * `prompt`/`confirm` here rather than duplicating `LayerTreeItem`'s inline
 * input/`AlertDialog` state. They call `layerService` directly (not the
 * parameterized `useRenameLayer`/`useDeleteLayer` hooks) taking the layer
 * id as a mutate-time argument: selecting a menu item closes the menu
 * (clearing `contextMenuTarget`, and thus this component's `layerId`) in
 * the same tick, and TanStack Query resolves `mutationFn` from the
 * LATEST render's options when the mutation actually runs — a
 * closure-captured `layerId` would go stale before the request fires
 * (confirmed via a failing test before this fix); an explicit argument
 * can't. Uses the same `editingStore.contextMenuTarget` +
 * invisible-trigger-redispatch technique as `FeatureContextMenu`: the
 * right-click happens on a Layer Tree row in the sidebar, but "zoom to
 * layer" needs `useMap()`, so this lives inside the `<MapContainer>` tree.
 */
export function LayerContextMenu() {
  const map = useMap()
  const triggerRef = useRef<HTMLDivElement>(null)
  const target = useEditingStore((s) => s.contextMenuTarget)
  const clearContextMenuTarget = useEditingStore((s) => s.clearContextMenuTarget)
  const isLayerLocked = useEditingStore((s) => s.isLayerLocked)
  const lockLayer = useEditingStore((s) => s.lockLayer)
  const unlockLayer = useEditingStore((s) => s.unlockLayer)
  const setLastError = useEditingStore((s) => s.setLastError)
  const selectLayer = useDatabaseStore((s) => s.selectLayer)
  const selectedProjectId = useDatabaseStore((s) => s.selectedProjectId)

  const layerId = target?.kind === "layer" ? target.id : null
  const { data } = useFeatures(layerId ?? "")
  const layerIsLocked = layerId ? isLayerLocked(layerId) : false

  const queryClient = useQueryClient()
  const invalidateLayers = () => {
    if (selectedProjectId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.layers(selectedProjectId) })
    }
  }
  const renameLayerMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      layerService.rename(id, { name }),
    onSuccess: invalidateLayers,
  })
  const deleteLayerMutation = useMutation({
    mutationFn: (id: string) => layerService.remove(id),
    onSuccess: invalidateLayers,
  })

  useEffect(() => {
    if (target?.kind !== "layer") return
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
  }, [target])

  if (target?.kind !== "layer" || !layerId) return null
  const confirmedLayerId = layerId

  function handleSelect() {
    selectLayer(confirmedLayerId)
  }

  function handleToggleLock() {
    if (layerIsLocked) {
      unlockLayer(confirmedLayerId)
    } else {
      lockLayer(confirmedLayerId)
    }
  }

  function handleZoomTo() {
    if (!data?.features.length) {
      setLastError("This layer has no features to zoom to.")
      return
    }
    const collection = turfFeatureCollection(
      data.features.map((feature) => ({
        type: "Feature" as const,
        properties: {},
        geometry: feature.geometry,
      })),
    )
    const [west, south, east, north] = turfBbox(collection)
    map.fitBounds([
      [south, west],
      [north, east],
    ])
  }

  function handleRename() {
    const name = window.prompt("Rename layer")?.trim()
    if (!name) return
    renameLayerMutation.mutate(
      { id: confirmedLayerId, name },
      {
        onError: (error: unknown) => {
          setLastError(error instanceof Error ? error.message : "Failed to rename the layer.")
        },
      },
    )
  }

  function handleDelete() {
    if (!window.confirm("Delete this layer and all of its features? This cannot be undone.")) {
      return
    }
    deleteLayerMutation.mutate(confirmedLayerId, {
      onError: (error: unknown) => {
        setLastError(error instanceof Error ? error.message : "Failed to delete the layer.")
      },
    })
  }

  return (
    <ContextMenu onOpenChange={(open) => !open && clearContextMenuTarget()}>
      <ContextMenuTrigger asChild>
        <div ref={triggerRef} className="pointer-events-none fixed left-0 top-0 h-0 w-0" />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleSelect}>Select layer</ContextMenuItem>
        <ContextMenuItem onSelect={handleZoomTo}>Zoom to layer</ContextMenuItem>
        <ContextMenuItem onSelect={handleRename}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={handleToggleLock}>
          {layerIsLocked ? "Unlock layer" : "Lock layer"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleDelete}>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
