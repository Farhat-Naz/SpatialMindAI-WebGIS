"use client"

import { MapContainer } from "@/features/map"
import { Button } from "@/shared/components/ui/button"
import { useDashboardFilterStore } from "../../store/dashboardFilterStore"

/**
 * Thin wrapper around the `map` feature's `MapContainer` (research.md
 * Decision 4) — never a second Leaflet integration. `MapContainer` is a
 * single global instance with no per-instance layer-scoping prop, so this
 * widget mounts the same map every project view already shows rather than
 * an isolated, per-widget-bound map; a true per-widget-scoped mini-map
 * would require changes to `MapCore` itself, which Decision 4 explicitly
 * rules out ("never reimplementing... a second time").
 *
 * T254 (US6) — a "Draw filter area" affordance that puts the shared map
 * into Geoman polygon-draw mode via `dashboardFilterStore.spatialDrawActive`;
 * `DashboardSpatialFilterControl` (mounted inside `MapCore`, the one place
 * with `useMap()` access) does the actual drawing and stores the result as
 * a global spatial filter (Acceptance Scenario 4).
 */
export function MapWidget() {
  const spatialDrawActive = useDashboardFilterStore((state) => state.spatialDrawActive)
  const activateSpatialDraw = useDashboardFilterStore((state) => state.activateSpatialDraw)
  const deactivateSpatialDraw = useDashboardFilterStore((state) => state.deactivateSpatialDraw)

  return (
    <div className="relative h-full w-full">
      <MapContainer className="h-full w-full" />
      <div className="pointer-events-none absolute right-2 top-2 z-1000">
        <Button
          type="button"
          size="sm"
          variant={spatialDrawActive ? "default" : "outline"}
          className="pointer-events-auto"
          onClick={() => (spatialDrawActive ? deactivateSpatialDraw() : activateSpatialDraw())}
        >
          {spatialDrawActive ? "Cancel filter area" : "Draw filter area"}
        </Button>
      </div>
    </div>
  )
}
