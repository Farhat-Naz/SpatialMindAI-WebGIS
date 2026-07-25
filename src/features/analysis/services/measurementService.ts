import type { LatLng } from "@/shared/types/common.types"
import {
  formatCoordinate,
  measureArea,
  measureAzimuth,
  measureBearing,
  measureDistance,
  measurePerimeter,
  measureRadius,
  type MeasurementDistanceUnit,
  type Position,
} from "./spatialMath"

export type MeasurementDraftType = "distance" | "area" | "perimeter" | "radius" | "bearing" | "azimuth" | "coordinates"

export interface LiveMeasurementResult {
  value: number | null
  unit: string | null
  /** `{ lat, lng }` formatted strings, present only for the `coordinates` tool. */
  formatted?: { lat: string; lng: string }
}

function toPosition(point: LatLng): Position {
  return [point.lng, point.lat]
}

/**
 * Live, client-side measurement readouts for the Measure tools (US3,
 * research.md Decision 8's transient-UI-feedback carve-out) — wraps
 * `spatialMath.ts`'s pure Turf.js functions for the in-progress draw the
 * Measure Toolbar drives. Never calls `fetch`/`apiFetch`; network calls
 * (`analysisService.saveMeasurement`) only happen once the user explicitly
 * saves, at which point the server recomputes the authoritative value.
 */
export const measurementService = {
  /**
   * Computes a live reading for `type` from the in-progress draw's
   * `points`. Returns `{ value: null, unit: null }` for a draft that does
   * not yet have enough points for the given type (e.g. a distance
   * reading needs at least 2 points) — callers show a "keep drawing"
   * affordance rather than treating this as an error.
   */
  measure(type: MeasurementDraftType, points: LatLng[], unit: MeasurementDistanceUnit = "meters"): LiveMeasurementResult {
    switch (type) {
      case "coordinates": {
        if (points.length < 1) return { value: null, unit: null }
        return { value: null, unit: null, formatted: formatCoordinate(toPosition(points[0])) }
      }
      case "distance": {
        if (points.length < 2) return { value: null, unit: null }
        const value = points
          .slice(1)
          .reduce((total, point, i) => total + measureDistance(toPosition(points[i]), toPosition(point), unit), 0)
        return { value, unit }
      }
      case "radius": {
        if (points.length < 2) return { value: null, unit: null }
        return { value: measureRadius(toPosition(points[0]), toPosition(points[1]), unit), unit }
      }
      case "bearing": {
        if (points.length < 2) return { value: null, unit: null }
        return { value: measureBearing(toPosition(points[0]), toPosition(points[1])), unit: "degrees" }
      }
      case "azimuth": {
        if (points.length < 2) return { value: null, unit: null }
        return { value: measureAzimuth(toPosition(points[0]), toPosition(points[1])), unit: "degrees" }
      }
      case "area": {
        if (points.length < 3) return { value: null, unit: null }
        const ring = [...points, points[0]].map(toPosition)
        return { value: measureArea({ type: "Polygon", coordinates: [ring] }), unit: "squareMeters" }
      }
      case "perimeter": {
        if (points.length < 3) return { value: null, unit: null }
        const ring = [...points, points[0]].map(toPosition)
        return { value: measurePerimeter({ type: "Polygon", coordinates: [ring] }, unit), unit }
      }
    }
  },
}
