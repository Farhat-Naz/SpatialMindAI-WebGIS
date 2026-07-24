import { z } from "zod"
import { geometrySchema } from "./geometry.schema"

const importFeatureEntrySchema = z.object({
  type: z.literal("Feature"),
  geometry: geometrySchema,
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type ImportFeatureEntry = z.infer<typeof importFeatureEntrySchema>

/**
 * `POST /api/layers/:layerId/features/import` request body — a standard
 * GeoJSON `FeatureCollection`. Each `geometry` is re-validated with the
 * existing `geometrySchema` (no duplicated rules); `properties` (if
 * present) is mapped to `FeatureAttribute` key/value rows by the repository
 * layer, flattened to strings the same way single-feature creation already
 * does (Research Decision 5).
 */
export const importFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(importFeatureEntrySchema).min(1, "features must not be empty"),
})
export type ImportFeatureCollectionInput = z.infer<typeof importFeatureCollectionSchema>

/**
 * Flattens a GeoJSON `properties` object into the platform's internal
 * `{ key, value }[]` attribute shape — non-string values are stringified,
 * `null`/`undefined` values are dropped (matching free-form attribute
 * storage, Research Decision 12 of 003-database-foundation).
 */
export function propertiesToAttributes(
  properties: Record<string, unknown> | null | undefined,
): { key: string; value: string }[] {
  if (!properties) return []
  return Object.entries(properties)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({ key, value: String(value) }))
}
