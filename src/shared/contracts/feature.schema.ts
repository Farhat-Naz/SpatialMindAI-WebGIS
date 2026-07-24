import { z } from "zod"
import { geometrySchema, type GeoJSONGeometry } from "./geometry.schema"

export const attributeEntry = z.object({
  key: z.string().trim().min(1, "Attribute key must not be empty"),
  value: z.string(),
})

export const attributes = z
  .array(attributeEntry)
  .refine(
    (entries) => new Set(entries.map((entry) => entry.key)).size === entries.length,
    { message: "Attribute keys must be unique within a feature" },
  )

export const style = z.object({
  color: z.string().trim().min(1, "Style color must not be empty"),
  strokeWidth: z.number().finite().optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
})

/** `POST /api/layers/:layerId/features` request body. */
export const createFeatureSchema = z.object({
  geometry: geometrySchema,
  attributes: attributes.optional(),
  style: style.optional(),
})
export type CreateFeatureInput = z.infer<typeof createFeatureSchema>

/**
 * `PATCH /api/features/:featureId` request body — at least one facet
 * required. `expectedUpdatedAt` (specs/006-collaboration, research.md
 * Decision 5) is additive and optional — every existing caller that omits
 * it sees zero behavior change.
 */
export const updateFeatureSchema = z
  .object({
    geometry: geometrySchema.optional(),
    attributes: attributes.optional(),
    style: style.optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .refine(
    (data) => data.geometry !== undefined || data.attributes !== undefined || data.style !== undefined,
    { message: "At least one of geometry, attributes, or style must be provided" },
  )
export type UpdateFeatureInput = z.infer<typeof updateFeatureSchema>

/** Feature shape returned by every Features API response. */
export const featureSchema = z.object({
  id: z.string(),
  layerId: z.string(),
  geometry: geometrySchema,
  attributes: z.array(attributeEntry),
  style: style.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Feature = z.infer<typeof featureSchema>

export type { GeoJSONGeometry }
