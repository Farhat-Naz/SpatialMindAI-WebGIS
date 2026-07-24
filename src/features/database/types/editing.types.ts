import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"
import type { Feature } from "@/shared/contracts/feature.schema"
import type { FeatureSnapshot } from "@/features/database/utils/featureSnapshot"

/** Mutually exclusive editing/drawing/measurement tools (data-model.md). */
export type ActiveTool =
  | "select"
  | "draw-point"
  | "draw-line"
  | "draw-polygon"
  | "draw-rectangle"
  | "draw-circle"
  | "edit-geometry"
  | "measure-distance"
  | "measure-area"
  | null

/** The single most recent mutation, replayable to implement one-step Undo (Research Decision 4). */
export type UndoSnapshot =
  | { kind: "geometry"; featureId: string; previousValue: GeoJSONGeometry }
  | { kind: "attributes"; featureId: string; previousValue: Feature["attributes"] }
  | { kind: "style"; featureId: string; previousValue: Feature["style"] }
  | { kind: "delete"; featureId: string; layerId: string; previousValue: FeatureSnapshot }

/** A copied feature's snapshot, held until replaced by a new copy (FR-027c–e). */
export type Clipboard = FeatureSnapshot | null

/**
 * Recomputed live via Turf.js while a measurement tool is active. `value`
 * is always in base SI units (meters for distance, square meters for
 * area) — display formatting (m/km, m²/ha) happens at render time via
 * `formatMeasurement.ts`, not here.
 */
export interface MeasurementResult {
  value: number
  unit: "distance" | "area"
}

/** Transient outcome of the most recent import attempt, shown then discarded. */
export interface ImportResult {
  status: "success" | "error"
  importedCount?: number
  errorMessage?: string
}
