import { geometrySchema } from "@/shared/contracts/geometry.schema"

export interface GeoJsonValidationResult {
  valid: boolean
  message?: string
}

/**
 * Structural pre-check reusing the existing `geometrySchema` — lets drawn/
 * imported geometry fail fast client-side (six-type/coordinate-range rules)
 * before any network call, without duplicating those rules in a second
 * schema. Topological validity (e.g., self-intersection) is still the
 * server's `ST_IsValid` check to make — this function cannot and does not
 * replace it.
 */
export function validateGeometryStructure(geometry: unknown): GeoJsonValidationResult {
  const result = geometrySchema.safeParse(geometry)
  if (result.success) {
    return { valid: true }
  }
  return {
    valid: false,
    message: result.error.issues[0]?.message ?? "Invalid geometry.",
  }
}

/**
 * Validates every feature's geometry in a parsed GeoJSON `FeatureCollection`
 * before submission, matching the all-or-nothing behavior the server itself
 * enforces (spec FR-034/FR-035) — the first invalid feature's message is
 * surfaced so the whole file can be rejected immediately, client-side.
 */
export function validateFeatureCollectionStructure(
  featureCollection: unknown,
): GeoJsonValidationResult {
  if (
    typeof featureCollection !== "object" ||
    featureCollection === null ||
    (featureCollection as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((featureCollection as { features?: unknown }).features)
  ) {
    return { valid: false, message: "File is not a valid GeoJSON FeatureCollection." }
  }

  const features = (featureCollection as { features: unknown[] }).features
  if (features.length === 0) {
    return { valid: false, message: "The file contains no features to import." }
  }

  for (const feature of features) {
    const geometry = (feature as { geometry?: unknown }).geometry
    const result = validateGeometryStructure(geometry)
    if (!result.valid) {
      return result
    }
  }

  return { valid: true }
}
