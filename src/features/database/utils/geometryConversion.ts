import { circle as turfCircle } from "@turf/turf"
import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"

export interface RectangleBounds {
  north: number
  south: number
  east: number
  west: number
}

/**
 * Converts a drawn rectangle's bounds into a closed, 5-position `Polygon`
 * ring — rectangles are a drawing-tool affordance only, never a stored
 * geometry kind (Research Decision 2).
 */
export function rectangleToPolygon(bounds: RectangleBounds): GeoJSONGeometry {
  const { north, south, east, west } = bounds
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  }
}

/**
 * Approximates a drawn circle as a many-sided regular `Polygon` via
 * Turf.js — circles are a drawing-tool affordance only, never a stored
 * geometry kind (Research Decision 2). `steps` defaults to 64, matching
 * standard GIS tooling's circle approximation density.
 */
export function circleToPolygon(
  center: [number, number],
  radiusMeters: number,
  steps = 64,
): GeoJSONGeometry {
  const feature = turfCircle(center, radiusMeters, { steps, units: "meters" })
  const coordinates = feature.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => [lng, lat] as [number, number]),
  )
  return { type: "Polygon", coordinates }
}

/**
 * Closes a ring (first position === last) for area/perimeter calculation,
 * without mutating the input — used by the Measure Area tool (US6) to turn
 * a user's clicked points into a valid closed boundary before handing them
 * to Turf.js.
 */
export function closeRing(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points
  const [first] = points
  const last = points[points.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) return points
  return [...points, first]
}
