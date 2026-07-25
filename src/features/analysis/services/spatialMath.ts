import * as turf from "@turf/turf"
import type { Feature, LineString, MultiPolygon, Polygon } from "geojson"

/**
 * Pure client-side spatial math for the live, transient Measurement Tools
 * readouts (spec.md US3, research.md Decision 8) — Constitution Principle
 * IV's carve-out for UI feedback that never becomes the persisted source of
 * truth. No function here reads from or writes to a Zustand store; "Save to
 * History" (Phase 10) re-computes the authoritative value server-side via
 * PostGIS before persisting.
 */

/** A raw `[longitude, latitude]` position, WGS84 — matches GeoJSON's own coordinate order. */
export type Position = [number, number]

export type MeasurementDistanceUnit = "meters" | "kilometers" | "feet" | "miles"

const TURF_UNITS_BY_DISTANCE_UNIT: Record<MeasurementDistanceUnit, turf.Units> = {
  meters: "meters",
  kilometers: "kilometers",
  feet: "feet",
  miles: "miles",
}

/** Great-circle distance between two points (FR-007). */
export function measureDistance(from: Position, to: Position, unit: MeasurementDistanceUnit = "meters"): number {
  return turf.distance(turf.point(from), turf.point(to), { units: TURF_UNITS_BY_DISTANCE_UNIT[unit] })
}

/** Radius of a circle drawn from `center` out to `edge` (FR-007) — geometrically identical to distance, named separately for the Radius tool's own affordance. */
export function measureRadius(center: Position, edge: Position, unit: MeasurementDistanceUnit = "meters"): number {
  return measureDistance(center, edge, unit)
}

/** Initial bearing from `from` to `to`, in `turf`'s native -180..180° range (FR-007). */
export function measureBearing(from: Position, to: Position): number {
  return turf.bearing(turf.point(from), turf.point(to))
}

/** Azimuth: bearing normalized to the conventional 0–360° clockwise-from-north range (FR-007), vs. `measureBearing`'s native -180..180°. */
export function measureAzimuth(from: Position, to: Position): number {
  const bearing = measureBearing(from, to)
  return bearing < 0 ? bearing + 360 : bearing
}

/** Area of a polygon/multipolygon in square meters (FR-007/FR-008) — `@turf/area`'s own fixed unit; callers convert for display as needed. */
export function measureArea(polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon): number {
  return turf.area(polygon)
}

/** Perimeter (outer boundary length) of a polygon/multipolygon (FR-007/FR-008) — the ring(s) converted to a line, then measured like any other length. */
export function measurePerimeter(
  polygon: Feature<Polygon | MultiPolygon> | Polygon | MultiPolygon,
  unit: MeasurementDistanceUnit = "meters",
): number {
  const line = turf.polygonToLine(polygon)
  return turf.length(line, { units: TURF_UNITS_BY_DISTANCE_UNIT[unit] })
}

/** Length of a line/multiline feature (FR-008 — measuring an existing line feature without redrawing it). */
export function measureLength(
  line: Feature<LineString> | LineString,
  unit: MeasurementDistanceUnit = "meters",
): number {
  const feature = "type" in line && line.type === "Feature" ? line : turf.feature(line)
  return turf.length(feature, { units: TURF_UNITS_BY_DISTANCE_UNIT[unit] })
}

/** `{ lat, lng }` formatted to 4 decimal places (FR-007's Coordinates tool) — matches `useCoordinates.ts`'s existing display convention, no new format invented. */
export function formatCoordinate(position: Position): { lat: string; lng: string } {
  const [lng, lat] = position
  return { lat: lat.toFixed(4), lng: lng.toFixed(4) }
}
