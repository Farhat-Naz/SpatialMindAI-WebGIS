"use client"

import "@geoman-io/leaflet-geoman-free"
import { memo, useEffect, useRef } from "react"
import { GeoJSON } from "react-leaflet"
import type { Feature as GeoJsonFeature } from "geojson"
import type * as L from "leaflet"
import { useFeatures, useUpdateFeature } from "@/features/database/hooks/useFeatures"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import type { Feature } from "@/shared/contracts/feature.schema"
import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"

const DEFAULT_COLOR = "#2563eb"
const DEFAULT_STROKE_WIDTH = 2
const DEFAULT_FILL_OPACITY = 0.3

interface FeatureLayerItemProps {
  feature: Feature
  isSelected: boolean
  isEditMode: boolean
  opacity: number
  onSelect: (featureId: string, event: { originalEvent: MouseEvent }) => void
  onContextMenu: (featureId: string, event: { originalEvent: MouseEvent }) => void
}

/**
 * Renders a single feature's geometry with its stored style (or the
 * documented default). Memoized so panning/zooming doesn't re-render
 * features whose data hasn't changed (Research Decision 9, targets SC-002).
 * When `isEditMode` is true (this feature selected + edit-geometry tool
 * active), enables Geoman's per-layer edit mode — vertex dragging and
 * whole-feature dragging are both handled by the same Geoman edit session
 * (US4: "Edit geometry" and "Move feature" are the same underlying
 * capability for a single existing feature).
 */
const FeatureLayerItem = memo(function FeatureLayerItem({
  feature,
  isSelected,
  isEditMode,
  opacity,
  onSelect,
  onContextMenu,
}: FeatureLayerItemProps) {
  const geoJsonRef = useRef<L.GeoJSON | null>(null)
  const updateFeature = useUpdateFeature(feature.id, feature.layerId)
  const setLastError = useEditingStore((s) => s.setLastError)
  const setUndoSnapshot = useEditingStore((s) => s.setUndoSnapshot)
  // Always holds the latest feature without forcing the Geoman enable/
  // disable effect below to re-run on every data refresh.
  const featureRef = useRef(feature)
  featureRef.current = feature

  const geoJsonFeature: GeoJsonFeature = {
    type: "Feature",
    geometry: feature.geometry,
    properties: {},
  }

  useEffect(() => {
    const group = geoJsonRef.current
    if (!group) return

    const layers = group.getLayers() as (L.Layer & { pm?: L.PM.PMLayer })[]

    function handleEdit(event: Parameters<L.PM.EditEventHandler>[0]) {
      const layer = event.layer as L.Marker | L.Polyline | L.Polygon
      const geometry = layer.toGeoJSON().geometry as GeoJSONGeometry
      const previousGeometry = featureRef.current.geometry
      updateFeature.mutate(
        { geometry },
        {
          onError: (error) => {
            setLastError(error instanceof Error ? error.message : "Failed to save the edited geometry.")
          },
          onSuccess: () => {
            setUndoSnapshot({ kind: "geometry", featureId: feature.id, previousValue: previousGeometry })
          },
        },
      )
    }

    if (isEditMode) {
      layers.forEach((layer) => {
        layer.pm?.enable({ draggable: true })
        layer.on("pm:edit", handleEdit)
        layer.on("pm:dragend", handleEdit)
      })
    }

    return () => {
      layers.forEach((layer) => {
        layer.off("pm:edit", handleEdit)
        layer.off("pm:dragend", handleEdit)
        layer.pm?.disable()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateFeature is a fresh mutation object every render; re-running this effect on every render would repeatedly enable/disable Geoman for no reason.
  }, [isEditMode])

  return (
    <GeoJSON
      ref={geoJsonRef}
      data={geoJsonFeature}
      style={() => ({
        color: feature.style?.color ?? DEFAULT_COLOR,
        weight: feature.style?.strokeWidth ?? DEFAULT_STROKE_WIDTH,
        fillOpacity: feature.style?.fillOpacity ?? DEFAULT_FILL_OPACITY,
        opacity,
        dashArray: isSelected ? "6 4" : undefined,
      })}
      eventHandlers={{
        click: (event) => onSelect(feature.id, event),
        contextmenu: (event) => onContextMenu(feature.id, event),
      }}
    />
  )
},
(prev, next) =>
  prev.feature.id === next.feature.id &&
  prev.feature.updatedAt === next.feature.updatedAt &&
  prev.isSelected === next.isSelected &&
  prev.isEditMode === next.isEditMode &&
  prev.opacity === next.opacity)

interface FeatureLayerProps {
  layerId: string
}

/** Renders a layer's features on the map, reading from the existing `useFeatures` cache. */
export function FeatureLayer({ layerId }: FeatureLayerProps) {
  const { data } = useFeatures(layerId)
  const selectedFeatureIds = useDatabaseStore((s) => s.selectedFeatureIds)
  const selectFeature = useDatabaseStore((s) => s.selectFeature)
  const toggleFeatureSelection = useDatabaseStore((s) => s.toggleFeatureSelection)
  const display = useEditingStore((s) => s.getLayerDisplay(layerId))
  const tool = useEditingStore((s) => s.tool)
  const isLayerLocked = useEditingStore((s) => s.isLayerLocked)
  const setContextMenuTarget = useEditingStore((s) => s.setContextMenuTarget)

  if (!data || !display.visible) {
    return null
  }

  const layerIsLocked = isLayerLocked(layerId)

  function handleSelect(featureId: string, event: { originalEvent: MouseEvent }) {
    if (event.originalEvent.shiftKey) {
      toggleFeatureSelection(featureId)
    } else {
      selectFeature(featureId)
    }
  }

  function handleContextMenu(featureId: string, event: { originalEvent: MouseEvent }) {
    event.originalEvent.preventDefault()
    selectFeature(featureId)
    setContextMenuTarget({
      kind: "feature",
      id: featureId,
      clientX: event.originalEvent.clientX,
      clientY: event.originalEvent.clientY,
    })
  }

  return (
    <>
      {data.features.map((feature) => {
        const isSelected = selectedFeatureIds.includes(feature.id)
        return (
          <FeatureLayerItem
            key={feature.id}
            feature={feature}
            isSelected={isSelected}
            isEditMode={isSelected && tool === "edit-geometry" && !layerIsLocked}
            opacity={display.opacity}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
          />
        )
      })}
    </>
  )
}
