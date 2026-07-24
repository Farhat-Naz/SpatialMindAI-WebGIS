"use client"

import { useRef, useState } from "react"
import { Rectangle, useMap, useMapEvents } from "react-leaflet"
import { bboxPolygon, booleanIntersects } from "@turf/turf"
import { useFeatures } from "@/features/database/hooks/useFeatures"
import { useDatabaseStore } from "@/features/database/store/databaseStore"

interface SelectionBoxProps {
  layerId: string
}

interface LatLngPoint {
  lat: number
  lng: number
}

/**
 * Box/drag-select (US5) — Shift+drag draws a rectangle; every feature whose
 * geometry intersects it is added to the multi-selection in one action
 * (mirrors Shift-click's modifier convention, Research Decision — no new
 * drawing library, reuses Turf.js already in the project). Must be rendered
 * inside a `<MapContainer>`.
 */
export function SelectionBox({ layerId }: SelectionBoxProps) {
  const map = useMap()
  const { data } = useFeatures(layerId)
  const selectFeatureRange = useDatabaseStore((s) => s.selectFeatureRange)
  // Refs (not state) hold the drag coordinates so `mouseup` always reads the
  // latest position even if it fires before React has re-rendered and
  // re-bound the handlers with a fresh closure (e.g. a very fast drag).
  // `renderTick` state exists purely to trigger the rectangle preview's
  // re-render; it carries no data itself.
  const startRef = useRef<LatLngPoint | null>(null)
  const currentRef = useRef<LatLngPoint | null>(null)
  const [, setRenderTick] = useState(0)

  useMapEvents({
    mousedown(event) {
      if (!event.originalEvent.shiftKey) return
      map.dragging.disable()
      const point = { lat: event.latlng.lat, lng: event.latlng.lng }
      startRef.current = point
      currentRef.current = point
      setRenderTick((tick) => tick + 1)
    },
    mousemove(event) {
      if (!startRef.current) return
      currentRef.current = { lat: event.latlng.lat, lng: event.latlng.lng }
      setRenderTick((tick) => tick + 1)
    },
    mouseup() {
      const start = startRef.current
      const end = currentRef.current
      startRef.current = null
      currentRef.current = null
      map.dragging.enable()
      setRenderTick((tick) => tick + 1)

      if (!start || !end || !data) return

      const minLng = Math.min(start.lng, end.lng)
      const maxLng = Math.max(start.lng, end.lng)
      const minLat = Math.min(start.lat, end.lat)
      const maxLat = Math.max(start.lat, end.lat)
      const selectionPolygon = bboxPolygon([minLng, minLat, maxLng, maxLat])

      const intersecting = data.features
        .filter((feature) => booleanIntersects(selectionPolygon, feature.geometry))
        .map((feature) => feature.id)

      if (intersecting.length > 0) {
        selectFeatureRange(intersecting)
      }
    },
  })

  if (!startRef.current || !currentRef.current) return null

  const start = startRef.current
  const current = currentRef.current
  const south = Math.min(start.lat, current.lat)
  const north = Math.max(start.lat, current.lat)
  const west = Math.min(start.lng, current.lng)
  const east = Math.max(start.lng, current.lng)

  return (
    <Rectangle
      bounds={[
        [south, west],
        [north, east],
      ]}
      pathOptions={{ color: "#2563eb", dashArray: "4 4", fillOpacity: 0.08 }}
    />
  )
}
