import { z } from "zod"

/**
 * Structural + coordinate-range validation only (longitude -180..180,
 * latitude -90..90). Topological validity (closed rings, no
 * self-intersections) is intentionally NOT checked here — that is PostGIS
 * `ST_IsValid`'s job, per Research Decision 3. All coordinates are WGS84
 * (SRID 4326), the platform-wide fixed default.
 */
const longitude = z.number().finite().min(-180).max(180)
const latitude = z.number().finite().min(-90).max(90)

/** A single [longitude, latitude] position. */
const position = z.tuple([longitude, latitude])

/** A ring of positions for a Polygon/MultiPolygon; closure is validated by PostGIS. */
const linearRing = z
  .array(position)
  .min(4, "A polygon ring must have at least 4 positions")

export const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: position,
})

export const multiPointSchema = z.object({
  type: z.literal("MultiPoint"),
  coordinates: z.array(position).min(1),
})

export const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(position).min(2, "A LineString must have at least 2 positions"),
})

export const multiLineStringSchema = z.object({
  type: z.literal("MultiLineString"),
  coordinates: z
    .array(z.array(position).min(2, "Each line must have at least 2 positions"))
    .min(1),
})

export const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(linearRing).min(1),
})

export const multiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(linearRing).min(1)).min(1),
})

/**
 * Discriminated union over the six geometry types the platform supports
 * (Constitution Principle IV / spec FR-014). Any other `type` value
 * (e.g., `GeometryCollection`) is rejected.
 */
export const geometrySchema = z.discriminatedUnion("type", [
  pointSchema,
  multiPointSchema,
  lineStringSchema,
  multiLineStringSchema,
  polygonSchema,
  multiPolygonSchema,
])

export type GeoJSONGeometry = z.infer<typeof geometrySchema>
