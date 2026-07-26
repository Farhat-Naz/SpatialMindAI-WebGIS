"use client"

import { useState } from "react"
import { useMapEvents } from "react-leaflet"
import { Circle, MapPin, Ruler, Waves } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group"
import { Button } from "@/shared/components/ui/button"
import type { LatLng } from "@/shared/types/common.types"
import { useAnalysisStore, type MeasurementMode } from "../store/analysisStore"
import { useSaveMeasurement } from "../hooks/useMeasurements"
import { measurementService } from "../services/measurementService"
import { formatDistance, formatArea } from "@/features/database/utils/formatMeasurement"

type MeasureMode = MeasurementMode

const MODE_OPTIONS: { value: MeasureMode; label: string; icon: typeof Ruler }[] = [
  { value: "distance", label: "Measure distance", icon: Ruler },
  { value: "area", label: "Measure area", icon: Waves },
  { value: "radius", label: "Measure radius", icon: Circle },
  { value: "coordinates", label: "Read coordinates", icon: MapPin },
]

const MIN_POINTS_FOR_MODE: Record<MeasureMode, number> = {
  distance: 2,
  area: 3,
  radius: 2,
  coordinates: 1,
}

/**
 * Map-overlay measurement control (US3) — always available from the map
 * toolbar independent of the Analysis Panel (spec.md's Independent Test),
 * mirroring `database`'s existing `MeasurementToolbar.tsx`'s click-collection
 * pattern (`useMapEvents`) rather than introducing a second one. Live
 * readouts come from `measurementService` (Turf.js, transient); "Save to
 * History" is the only path that reaches the server, which recomputes the
 * authoritative value (research.md Decision 8). Must render inside a
 * `<MapContainer>`.
 */
export function MeasureToolbar({ projectId }: { projectId: string }) {
  const mode = useAnalysisStore((state) => state.measurementMode)
  const measurementDraft = useAnalysisStore((state) => state.measurementDraft)
  const setMeasurementDraft = useAnalysisStore((state) => state.setMeasurementDraft)
  const setMeasurementMode = useAnalysisStore((state) => state.setMeasurementMode)

  const points = mode && measurementDraft?.type === mode ? measurementDraft.points : []

  useMapEvents({
    click(event) {
      if (!mode) return
      const point: LatLng = { lat: event.latlng.lat, lng: event.latlng.lng }
      // `measurementDraft.type` stores one representative reading type per
      // mode (the store's own doc: one draft, not one per readout) —
      // "distance" for the distance/bearing/azimuth trio, "area" for the
      // area/perimeter pair, matching how the existing `database` Measurement
      // Toolbar already reports area+perimeter from one draw.
      setMeasurementDraft({ type: mode, points: [...points, point] })
    },
    dblclick() {
      if (!mode) return
      setMeasurementMode(null)
    },
  })

  return <MeasurementControls projectId={projectId} />
}

/**
 * The measurement tool picker and live readouts, with no map dependency —
 * so it can render both inside the map overlay (via `MeasureToolbar`,
 * which adds click collection) and in the Analysis panel's Toolbox tab
 * (T245). Selecting a tool here arms the map; the clicks themselves are
 * still collected on the map, the only place a click has a coordinate.
 */
export function MeasurementControls({ projectId }: { projectId: string }) {
  const mode = useAnalysisStore((state) => state.measurementMode)
  const measurementDraft = useAnalysisStore((state) => state.measurementDraft)
  const setMeasurementMode = useAnalysisStore((state) => state.setMeasurementMode)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const saveMeasurement = useSaveMeasurement(projectId)

  const [savedTypes, setSavedTypes] = useState<Set<string>>(new Set())

  const points = mode && measurementDraft?.type === mode ? measurementDraft.points : []

  function handleModeChange(value: string) {
    setSavedTypes(new Set())
    setMeasurementMode((value || null) as MeasureMode | null)
  }

  function handleSave(measurementType: Parameters<typeof measurementService.measure>[0], geometry: object) {
    saveMeasurement.mutate(
      { measurementType, geometry: geometry as never },
      {
        onSuccess: () => setSavedTypes((prev) => new Set(prev).add(measurementType)),
        onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to save the measurement."),
      },
    )
  }

  const hasEnoughPoints = mode ? points.length >= MIN_POINTS_FOR_MODE[mode] : false

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <ToggleGroup type="single" value={mode ?? ""} onValueChange={handleModeChange} aria-label="Measurement tools">
        {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value} aria-label={label}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem
          value="elevation"
          aria-label="Measure elevation (not available)"
          title="Elevation data is not available."
          disabled
        >
          <span className="text-xs">Elev.</span>
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "distance" && hasEnoughPoints && (
        <ReadoutPanel
          rows={[
            {
              label: "Distance",
              value: formatDistance(measurementService.measure("distance", points).value ?? 0),
              onSave: () => handleSave("distance", { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) }),
              saved: savedTypes.has("distance"),
            },
            {
              label: "Bearing",
              value: `${(measurementService.measure("bearing", points).value ?? 0).toFixed(1)}°`,
              onSave: () => handleSave("bearing", { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) }),
              saved: savedTypes.has("bearing"),
            },
            {
              label: "Azimuth",
              value: `${(measurementService.measure("azimuth", points).value ?? 0).toFixed(1)}°`,
              onSave: () => handleSave("azimuth", { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) }),
              saved: savedTypes.has("azimuth"),
            },
          ]}
        />
      )}

      {mode === "area" && hasEnoughPoints && (
        <ReadoutPanel
          rows={[
            {
              label: "Area",
              value: formatArea(measurementService.measure("area", points).value ?? 0),
              onSave: () => {
                const ring = [...points, points[0]].map((p) => [p.lng, p.lat])
                handleSave("area", { type: "Polygon", coordinates: [ring] })
              },
              saved: savedTypes.has("area"),
            },
            {
              label: "Perimeter",
              value: formatDistance(measurementService.measure("perimeter", points).value ?? 0),
              onSave: () => {
                const ring = [...points, points[0]].map((p) => [p.lng, p.lat])
                handleSave("perimeter", { type: "Polygon", coordinates: [ring] })
              },
              saved: savedTypes.has("perimeter"),
            },
          ]}
        />
      )}

      {mode === "radius" && hasEnoughPoints && (
        <ReadoutPanel
          rows={[
            {
              label: "Radius",
              value: formatDistance(measurementService.measure("radius", points).value ?? 0),
              onSave: () => handleSave("radius", { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) }),
              saved: savedTypes.has("radius"),
            },
          ]}
        />
      )}

      {mode === "coordinates" && hasEnoughPoints && (
        <ReadoutPanel
          rows={[
            {
              label: "Coordinates",
              value: (() => {
                const formatted = measurementService.measure("coordinates", points).formatted
                return formatted ? `${formatted.lat}, ${formatted.lng}` : ""
              })(),
              onSave: () => handleSave("coordinates", { type: "Point", coordinates: [points[0].lng, points[0].lat] }),
              saved: savedTypes.has("coordinates"),
            },
          ]}
        />
      )}
    </div>
  )
}

interface ReadoutRow {
  label: string
  value: string
  onSave: () => void
  saved: boolean
}

function ReadoutPanel({ rows }: { rows: ReadoutRow[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 text-sm" role="status" aria-live="polite">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <span>
            {row.label}: {row.value}
          </span>
          <Button variant="outline" size="sm" onClick={row.onSave} disabled={row.saved}>
            {row.saved ? "Saved" : "Save"}
          </Button>
        </div>
      ))}
    </div>
  )
}
