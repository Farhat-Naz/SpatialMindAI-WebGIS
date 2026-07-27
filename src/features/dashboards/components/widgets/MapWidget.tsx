import { MapContainer } from "@/features/map"

/**
 * Thin wrapper around the `map` feature's `MapContainer` (research.md
 * Decision 4) — never a second Leaflet integration. `MapContainer` is a
 * single global instance with no per-instance layer-scoping prop, so this
 * widget mounts the same map every project view already shows rather than
 * an isolated, per-widget-bound map; a true per-widget-scoped mini-map
 * would require changes to `MapCore` itself, which Decision 4 explicitly
 * rules out ("never reimplementing... a second time").
 */
export function MapWidget() {
  return <MapContainer className="h-full w-full" />
}
