"use client"

import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import { bbox as turfBbox, featureCollection as turfFeatureCollection } from "@turf/turf"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import { useEditingStore } from "@/features/database/store/editingStore"
import { useLayers } from "@/features/database/hooks/useLayers"
import { useFeatures } from "@/features/database/hooks/useFeatures"
import { FeatureLayer } from "@/features/database/components/FeatureLayer"
import { HeatmapLayer } from "@/features/analysis/components/HeatmapLayer"
import { FeatureContextMenu } from "@/features/database/components/FeatureContextMenu"
import { SelectionBox } from "@/features/database/components/SelectionBox"
import { LayerContextMenu } from "@/features/database/components/LayerContextMenu"
import { DrawingToolbar } from "@/features/database/components/DrawingToolbar"
import { MeasurementToolbar } from "@/features/database/components/MeasurementToolbar"
import { EditingErrorBanner } from "@/features/database/components/EditingErrorBanner"
import { NorthArrow } from "@/features/database/components/NorthArrow"
import { FitToDataButton } from "@/features/database/components/FitToDataButton"
import type { ImportResult } from "@/features/database/types/editing.types"

/**
 * Zooms to the active layer's full extent once per successful import
 * (T106) — reuses the same bbox/`fitBounds` approach as `LayerContextMenu`'s
 * "Zoom to layer". `ImportExportControls` itself can't do this directly
 * (it renders in the sidebar, outside `<MapContainer>`, so it has no
 * `useMap()`); it only sets `editingStore.importResult`, which this
 * component (mounted inside the map) reacts to. A ref tracks the last
 * `importResult` object handled so a later unrelated re-render (e.g. the
 * feature list refetching for other reasons) can't re-trigger the zoom.
 */
export function ImportZoomHandler() {
  const map = useMap()
  const selectedLayerId = useDatabaseStore((s) => s.selectedLayerId)
  const importResult = useEditingStore((s) => s.importResult)
  const { data } = useFeatures(selectedLayerId ?? "")
  const handledResultRef = useRef<ImportResult | null>(null)

  useEffect(() => {
    if (!importResult || importResult.status !== "success") return
    if (handledResultRef.current === importResult) return
    handledResultRef.current = importResult
    if (!data?.features.length) return

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
  }, [importResult, data, map])

  return null
}

/**
 * Bundles every map-editing UI element (US1/US4/US5/US6 map chrome) behind
 * a single import for `MapCore` (T088/T089) — drawing/measurement
 * toolbars, per-layer feature rendering + context menu, box-select, and
 * the North Arrow. Rendered as `<MapContainer>` children so
 * `useMap()`/`useMapEvents()` work; overlay positioning is handled here
 * via absolute wrapper divs so it doesn't disrupt the map's own chrome
 * (ZoomControl, ScaleControl) or the existing dashboard layout.
 */
export function MapEditingLayer() {
  const selectedProjectId = useDatabaseStore((s) => s.selectedProjectId)
  const selectedLayerId = useDatabaseStore((s) => s.selectedLayerId)
  const { data: layers } = useLayers(selectedProjectId ?? "")

  return (
    <>
      {/* US7/FR-018 — renders only when a Heatmap is toggled on, and draws
          beneath the feature layers so it reads as a backdrop. */}
      <HeatmapLayer />
      {layers?.map((layer) => <FeatureLayer key={layer.id} layerId={layer.id} />)}
      {layers?.map((layer) => <FeatureContextMenu key={layer.id} layerId={layer.id} />)}
      {selectedLayerId && <SelectionBox layerId={selectedLayerId} />}
      <LayerContextMenu />
      <ImportZoomHandler />

      <div className="pointer-events-none absolute left-4 top-4 z-1000 flex flex-col gap-2">
        <DrawingToolbar />
        <MeasurementToolbar />
        <div className="pointer-events-auto">
          <FitToDataButton />
        </div>
        <EditingErrorBanner />
      </div>

      <div className="pointer-events-none absolute bottom-6 right-4 z-1000">
        <NorthArrow />
      </div>
    </>
  )
}
