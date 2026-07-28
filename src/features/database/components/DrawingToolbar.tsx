"use client"

import "@geoman-io/leaflet-geoman-free"
import { useEffect } from "react"
import { useMap } from "react-leaflet"
import type * as L from "leaflet"
import { Ban, Circle, MapPin, MousePointer2, Spline, Square, Hexagon, Trash2, Undo2 } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group"
import { Button } from "@/shared/components/ui/button"
import { useCreateFeature, useDeleteFeature, useFeatures } from "@/features/database/hooks/useFeatures"
import { useUndoLastEdit } from "@/features/database/hooks/useFeatureEditing"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import { circleToPolygon, rectangleToPolygon } from "@/features/database/utils/geometryConversion"
import type { ActiveTool } from "@/features/database/types/editing.types"
import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"

type PmCreateEvent = Parameters<L.PM.CreateEventHandler>[0]

const DRAW_TOOLS: { tool: Exclude<ActiveTool, null | "select" | "edit-geometry" | "measure-distance" | "measure-area">; shape: L.PM.SUPPORTED_SHAPES; label: string; icon: typeof MapPin }[] = [
  { tool: "draw-point", shape: "Marker", label: "Draw point", icon: MapPin },
  { tool: "draw-line", shape: "Line", label: "Draw line", icon: Spline },
  { tool: "draw-polygon", shape: "Polygon", label: "Draw polygon", icon: Hexagon },
  { tool: "draw-rectangle", shape: "Rectangle", label: "Draw rectangle", icon: Square },
  { tool: "draw-circle", shape: "Circle", label: "Draw circle", icon: Circle },
]

/** Extracts a saveable `GeoJSONGeometry` from a just-drawn Geoman layer, normalizing Rectangle/Circle to `Polygon` (Research Decision 2). */
function extractGeometry(shape: L.PM.SUPPORTED_SHAPES, layer: L.Layer): GeoJSONGeometry {
  if (shape === "Rectangle") {
    const bounds = (layer as L.Rectangle).getBounds()
    return rectangleToPolygon({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    })
  }
  if (shape === "Circle") {
    const circleLayer = layer as L.Circle
    const center = circleLayer.getLatLng()
    return circleToPolygon([center.lng, center.lat], circleLayer.getRadius())
  }
  return (layer as L.Marker | L.Polyline | L.Polygon).toGeoJSON().geometry as GeoJSONGeometry
}

/**
 * Drawing Toolbar (US4) — activates Leaflet-Geoman draw modes for Point/
 * LineString/Polygon/Rectangle/Circle (Research Decision 1); Rectangle and
 * Circle are drawing-tool affordances only, saved as `Polygon` (Research
 * Decision 2). Also hosts Delete and Cancel actions (FR-026, FR-027b).
 * Must be rendered inside a `<MapContainer>` (uses `useMap`).
 */
export function DrawingToolbar() {
  const map = useMap()
  const tool = useEditingStore((s) => s.tool)
  const setTool = useEditingStore((s) => s.setTool)
  const cancelDraft = useEditingStore((s) => s.cancelDraft)
  const isLayerLocked = useEditingStore((s) => s.isLayerLocked)
  const setLastError = useEditingStore((s) => s.setLastError)
  const setUndoSnapshot = useEditingStore((s) => s.setUndoSnapshot)
  const undoSnapshot = useEditingStore((s) => s.undoSnapshot)
  const selectedLayerId = useDatabaseStore((s) => s.selectedLayerId)
  const selectedFeatureId = useDatabaseStore((s) => s.selectedFeatureId)
  const clearFeatureSelection = useDatabaseStore((s) => s.clearFeatureSelection)

  const createFeature = useCreateFeature(selectedLayerId ?? "")
  const deleteFeature = useDeleteFeature(selectedFeatureId ?? "", selectedLayerId ?? "")
  const undoLastEdit = useUndoLastEdit()
  const { data: layerFeatures } = useFeatures(selectedLayerId ?? "")
  const layerIsLocked = selectedLayerId ? isLayerLocked(selectedLayerId) : false

  // Sync editingStore.tool -> Geoman's active draw mode.
  useEffect(() => {
    const activeShape = DRAW_TOOLS.find((entry) => entry.tool === tool)?.shape
    map.pm.disableDraw()
    if (activeShape && !layerIsLocked) {
      map.pm.enableDraw(activeShape)
    }
    return () => {
      map.pm.disableDraw()
    }
  }, [map, tool, layerIsLocked])

  // Handle a completed drawing: convert (if needed), save, discard Geoman's temp layer.
  useEffect(() => {
    function handleCreate(event: PmCreateEvent) {
      const { layer, shape } = event

      // `map` is the app-wide singleton (research.md Decision 4) — another
      // feature's own Geoman draw session (e.g. specs/008-dashboard-
      // analytics's spatial-filter draw control) fires this same `pm:create`
      // event. Only handle it here if this toolbar's own tool was the one
      // active, so a stray create from elsewhere never gets persisted as a
      // Feature on whatever layer happened to be selected.
      if (!DRAW_TOOLS.some((entry) => entry.tool === tool)) {
        return
      }

      map.removeLayer(layer)

      if (!selectedLayerId) {
        setLastError("Select a layer before drawing.")
        return
      }
      if (layerIsLocked) {
        setLastError("This layer is locked — unlock it to draw new features.")
        return
      }

      const geometry = extractGeometry(shape, layer)
      createFeature.mutate(
        { geometry },
        {
          onError: (error) => {
            setLastError(error instanceof Error ? error.message : "Failed to save the drawn feature.")
          },
          onSuccess: () => {
            setTool(null)
          },
        },
      )
    }

    map.on("pm:create", handleCreate)
    return () => {
      map.off("pm:create", handleCreate)
    }
  }, [map, tool, selectedLayerId, layerIsLocked, createFeature, setTool, setLastError])

  function handleDelete() {
    if (!selectedFeatureId || !selectedLayerId) return
    if (layerIsLocked) {
      setLastError("This layer is locked — unlock it to delete features.")
      return
    }

    const featureBeforeDelete = layerFeatures?.features.find((f) => f.id === selectedFeatureId)

    deleteFeature.mutate(undefined, {
      onError: (error) => {
        setLastError(error instanceof Error ? error.message : "Failed to delete the feature.")
      },
      onSuccess: () => {
        if (featureBeforeDelete) {
          setUndoSnapshot({
            kind: "delete",
            featureId: featureBeforeDelete.id,
            layerId: selectedLayerId,
            previousValue: {
              geometry: featureBeforeDelete.geometry,
              attributes: featureBeforeDelete.attributes,
              style: featureBeforeDelete.style,
            },
          })
        }
        clearFeatureSelection()
      },
    })
  }

  function handleCancel() {
    cancelDraft()
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ToggleGroup
          type="single"
          value={tool ?? ""}
          onValueChange={(value) => setTool((value || null) as ActiveTool)}
          aria-label="Drawing tools"
          disabled={!selectedLayerId || layerIsLocked}
        >
          <ToggleGroupItem value="select" aria-label="Select">
            <MousePointer2 className="h-4 w-4" aria-hidden="true" />
          </ToggleGroupItem>
          {DRAW_TOOLS.map(({ tool: toolValue, label, icon: Icon }) => (
            <ToggleGroupItem key={toolValue} value={toolValue} aria-label={label}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          variant="outline"
          size="icon"
          aria-label="Cancel current drawing"
          onClick={handleCancel}
          disabled={!tool}
        >
          <Ban className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Delete selected feature"
          onClick={handleDelete}
          disabled={!selectedFeatureId || layerIsLocked}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Undo last edit"
          onClick={() => undoLastEdit.mutate()}
          disabled={!undoSnapshot}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
