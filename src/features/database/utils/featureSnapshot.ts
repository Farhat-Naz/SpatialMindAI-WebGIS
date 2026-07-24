import type { Feature } from "@/shared/contracts/feature.schema"

export interface FeatureSnapshot {
  geometry: Feature["geometry"]
  attributes: Feature["attributes"]
  style: Feature["style"]
}

/**
 * Produces an independent deep copy of a feature's geometry/attributes/
 * style — used by Copy/Duplicate (FR-027c–e) and Undo (FR-027a). Mutating
 * the original feature afterward MUST NOT affect the snapshot, since a
 * copied feature must survive deletion of its original (spec Edge Cases).
 */
export function snapshotFeature(feature: Feature): FeatureSnapshot {
  return {
    geometry: structuredClone(feature.geometry),
    attributes: structuredClone(feature.attributes),
    style: structuredClone(feature.style),
  }
}
