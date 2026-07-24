"use client"

import { useEffect, useState } from "react"
import { Polygon, Polyline, useMapEvents } from "react-leaflet"
import { area as turfArea, length as turfLength, polygon as turfPolygon, lineString as turfLineString } from "@turf/turf"
import { Ruler, Waves } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group"
import { useEditingStore } from "@/features/database/store/editingStore"
import { formatArea, formatDistance } from "@/features/database/utils/formatMeasurement"
import { closeRing } from "@/features/database/utils/geometryConversion"

type MeasureTool = "measure-distance" | "measure-area"

/**
 * Measurement Toolbar (US6) — ad hoc distance/area/perimeter measurement,
 * computed entirely client-side via Turf.js and never persisted (Research
 * Decision 3). Must be rendered inside a `<MapContainer>`.
 */
export function MeasurementToolbar() {
  const tool = useEditingStore((s) => s.tool)
  const setTool = useEditingStore((s) => s.setTool)
  const setMeasurementResult = useEditingStore((s) => s.setMeasurementResult)
  const result = useEditingStore((s) => s.measurementResult)
  const [points, setPoints] = useState<[number, number][]>([])
  const [perimeter, setPerimeter] = useState<number | null>(null)

  const isMeasuring = tool === "measure-distance" || tool === "measure-area"

  useMapEvents({
    click(event) {
      if (!isMeasuring) return
      setPoints((prev) => [...prev, [event.latlng.lng, event.latlng.lat]])
    },
    dblclick() {
      if (!isMeasuring) return
      // Finish the measurement: keep the result visible, stop collecting more points.
      setTool(null)
    },
  })

  // Recompute live on every point addition (live measurement while drawing).
  useEffect(() => {
    if (!isMeasuring || points.length < 2) {
      setMeasurementResult(null)
      setPerimeter(null)
      return
    }

    if (tool === "measure-distance") {
      const line = turfLineString(points)
      const meters = turfLength(line, { units: "meters" })
      setMeasurementResult({ value: meters, unit: "distance" })
      return
    }

    if (tool === "measure-area" && points.length >= 3) {
      const ring = closeRing(points)
      const polygon = turfPolygon([ring])
      const squareMeters = turfArea(polygon)
      const perimeterMeters = turfLength(turfLineString(ring), { units: "meters" })
      setMeasurementResult({ value: squareMeters, unit: "area" })
      // Perimeter is reported alongside area (a natural extension of
      // distance measurement applied to the closed ring's boundary, not a
      // second store field — both derive from the same points).
      setPerimeter(perimeterMeters)
    }
  }, [points, tool, isMeasuring, setMeasurementResult])

  function handleToolChange(value: string) {
    setPoints([])
    setPerimeter(null)
    setTool((value || null) as MeasureTool | null)
  }

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <ToggleGroup
        type="single"
        value={tool === "measure-distance" || tool === "measure-area" ? tool : ""}
        onValueChange={handleToolChange}
        aria-label="Measurement tools"
      >
        <ToggleGroupItem value="measure-distance" aria-label="Measure distance">
          <Ruler className="h-4 w-4" aria-hidden="true" />
        </ToggleGroupItem>
        <ToggleGroupItem value="measure-area" aria-label="Measure area">
          <Waves className="h-4 w-4" aria-hidden="true" />
        </ToggleGroupItem>
      </ToggleGroup>

      {result && (
        <div className="rounded-md border bg-background px-3 py-2 text-sm" role="status" aria-live="polite">
          {result.unit === "distance" ? (
            <span>Distance: {formatDistance(result.value)}</span>
          ) : (
            <span>
              Area: {formatArea(result.value)}
              {perimeter !== null && <> · Perimeter: {formatDistance(perimeter)}</>}
            </span>
          )}
        </div>
      )}

      {tool === "measure-distance" && points.length >= 2 && (
        <Polyline
          positions={points.map(([lng, lat]) => [lat, lng])}
          pathOptions={{ color: "#f59e0b", dashArray: "4 4" }}
        />
      )}
      {tool === "measure-area" && points.length >= 3 && (
        <Polygon
          positions={points.map(([lng, lat]) => [lat, lng])}
          pathOptions={{ color: "#f59e0b", fillOpacity: 0.15, dashArray: "4 4" }}
        />
      )}
    </div>
  )
}
