"use client"

import "@geoman-io/leaflet-geoman-free"
import { useEffect } from "react"
import { useMap } from "react-leaflet"
import type * as L from "leaflet"
import { useDashboardFilterStore } from "../../store/dashboardFilterStore"

type PmCreateEvent = Parameters<L.PM.CreateEventHandler>[0]

/**
 * Activates Leaflet-Geoman's polygon draw mode on the shared map
 * (research.md Decision 4 — `MapWidget` renders the same global `MapCore`
 * instance every project view uses, never a second Leaflet integration) when
 * `MapWidget`'s "Draw filter area" button sets `dashboardFilterStore.
 * spatialDrawActive` (T254). On a completed draw, stores the resulting
 * geometry as a global spatial filter (US6 Acceptance Scenario 4) and turns
 * draw mode back off.
 *
 * Mounted unconditionally inside `MapCore`, the same precedent
 * `DrawingToolbar`/`MeasureToolbar` already establish for feature-owned map
 * interactions — a no-op render (`null`) whenever no dashboard is asking for
 * a spatial filter.
 */
export function DashboardSpatialFilterControl() {
  const map = useMap()
  const spatialDrawActive = useDashboardFilterStore((state) => state.spatialDrawActive)
  const deactivateSpatialDraw = useDashboardFilterStore((state) => state.deactivateSpatialDraw)
  const setGlobalFilter = useDashboardFilterStore((state) => state.setGlobalFilter)

  useEffect(() => {
    if (spatialDrawActive) {
      map.pm.enableDraw("Polygon")
    } else {
      map.pm.disableDraw()
    }
    return () => {
      map.pm.disableDraw()
    }
  }, [map, spatialDrawActive])

  useEffect(() => {
    function handleCreate(event: PmCreateEvent) {
      // `map` is the app-wide singleton (research.md Decision 4) — another
      // feature's own Geoman draw session (e.g. `DrawingToolbar`'s feature
      // editing) fires this same `pm:create` event. Only react to it here
      // if this control's own draw mode was the one active.
      if (!spatialDrawActive) return

      const { layer } = event
      const geometry = (layer as L.Polygon).toGeoJSON().geometry
      map.removeLayer(layer)
      setGlobalFilter("spatial", { geometry })
      deactivateSpatialDraw()
    }

    map.on("pm:create", handleCreate)
    return () => {
      map.off("pm:create", handleCreate)
    }
  }, [map, spatialDrawActive, setGlobalFilter, deactivateSpatialDraw])

  return null
}
