import type { OperationType } from "@/shared/contracts/analysis.schema"
import type { AnalysisOperationCategory } from "./analysisConfig.constants"

/**
 * One catalog entry per operation `AnalysisToolbox` (Phase 16) renders.
 * `operationType` is present for every operation reachable via
 * `POST /api/projects/:projectId/analysis` (`analysis.schema.ts`'s
 * discriminated union); it is `undefined` for the two kinds of entry that
 * are **not** requests to that endpoint (research.md Decisions 8–9):
 * Measurement tools (computed live client-side; only "Save to History"
 * goes through `measurementRequest.schema.ts`, a different contract) and
 * the four not-yet-implemented raster placeholders (no request shape
 * exists for them at all yet).
 */
export interface AnalysisOperationCatalogEntry {
  /** Stable catalog key — equals `operationType` for every schema-backed operation. */
  key: string
  operationType?: OperationType
  category: AnalysisOperationCategory
  label: string
  implemented: boolean
}

/**
 * Every operation named across spec.md US1–US7, plus 005's
 * `coordinateConversion`/`crsTransformation` (predate 007, still valid
 * `operationType`s, kept visible so nothing in the Zod schema's union is
 * orphaned from the UI). `implemented` starts `false` for every operation
 * whose PostGIS builder/UI form has not yet landed — each user-story phase
 * (8–13) flips its own entries to `true` as it ships (research.md Decision 9
 * for the raster row specifically).
 */
export const ANALYSIS_OPERATION_CATALOG: readonly AnalysisOperationCatalogEntry[] = [
  // --- Buffer Analysis (US1, FR-001–003) ---
  { key: "buffer", operationType: "buffer", category: "buffer", label: "Buffer", implemented: true },

  // --- Spatial Query & Selection (US2, FR-004–006) ---
  { key: "spatialJoin", operationType: "spatialJoin", category: "query", label: "Spatial Join", implemented: true },
  { key: "pointInPolygon", operationType: "pointInPolygon", category: "query", label: "Point in Polygon", implemented: true },
  { key: "nearAnalysis", operationType: "nearAnalysis", category: "query", label: "Near / Nearest", implemented: true },
  { key: "distanceMatrix", operationType: "distanceMatrix", category: "query", label: "Distance Matrix", implemented: false },
  { key: "selectByLocation", operationType: "selectByLocation", category: "query", label: "Select by Location", implemented: true },
  { key: "selectByAttribute", operationType: "selectByAttribute", category: "query", label: "Select by Attribute", implemented: true },
  { key: "touches", operationType: "touches", category: "query", label: "Touches", implemented: true },
  { key: "crosses", operationType: "crosses", category: "query", label: "Crosses", implemented: true },
  { key: "overlaps", operationType: "overlaps", category: "query", label: "Overlaps", implemented: true },

  // --- Measurement Tools (US3, FR-007–009) — no operationType (Decision 8) ---
  { key: "measureDistance", category: "measurement", label: "Distance", implemented: true },
  { key: "measureArea", category: "measurement", label: "Area", implemented: true },
  { key: "measurePerimeter", category: "measurement", label: "Perimeter", implemented: true },
  { key: "measureRadius", category: "measurement", label: "Radius", implemented: true },
  { key: "measureBearing", category: "measurement", label: "Bearing", implemented: true },
  { key: "measureAzimuth", category: "measurement", label: "Azimuth", implemented: true },
  { key: "measureCoordinates", category: "measurement", label: "Coordinates", implemented: true },

  // --- Overlay Analysis (US4, FR-010) ---
  { key: "union", operationType: "union", category: "overlay", label: "Union", implemented: true },
  { key: "intersect", operationType: "intersect", category: "overlay", label: "Intersection", implemented: true },
  { key: "difference", operationType: "difference", category: "overlay", label: "Difference", implemented: true },
  { key: "clip", operationType: "clip", category: "overlay", label: "Clip", implemented: true },
  { key: "erase", operationType: "erase", category: "overlay", label: "Erase", implemented: true },
  { key: "identity", operationType: "identity", category: "overlay", label: "Identity", implemented: true },
  { key: "symmetricalDifference", operationType: "symmetricalDifference", category: "overlay", label: "Symmetrical Difference", implemented: true },

  // --- Geometry Processing (US5, FR-011–015) ---
  { key: "simplify", operationType: "simplify", category: "geometry", label: "Simplify", implemented: true },
  { key: "smoothGeometry", operationType: "smoothGeometry", category: "geometry", label: "Smooth", implemented: true },
  { key: "split", operationType: "split", category: "geometry", label: "Split", implemented: true },
  { key: "merge", operationType: "merge", category: "geometry", label: "Merge", implemented: true },
  { key: "dissolve", operationType: "dissolve", category: "geometry", label: "Dissolve", implemented: true },
  { key: "multipartToSinglepart", operationType: "multipartToSinglepart", category: "geometry", label: "Multipart to Singlepart", implemented: true },
  { key: "singlepartToMultipart", operationType: "singlepartToMultipart", category: "geometry", label: "Singlepart to Multipart", implemented: true },
  { key: "repairGeometry", operationType: "repairGeometry", category: "geometry", label: "Repair Geometry", implemented: true },
  { key: "coordinateConversion", operationType: "coordinateConversion", category: "geometry", label: "Coordinate Conversion", implemented: false },
  { key: "crsTransformation", operationType: "crsTransformation", category: "geometry", label: "CRS Transformation", implemented: false },

  // --- Spatial Statistics (US6, FR-016) ---
  // Summarize leads the category: it is the one entry US6's scenarios
  // describe, computing every statistic below in a single run.
  { key: "summarize", operationType: "summarize", category: "statistics", label: "Summarize", implemented: true },
  { key: "featureCount", operationType: "featureCount", category: "statistics", label: "Feature Count", implemented: true },
  { key: "areaCalculation", operationType: "areaCalculation", category: "statistics", label: "Area Calculation", implemented: true },
  { key: "averageArea", operationType: "averageArea", category: "statistics", label: "Average Area", implemented: true },
  { key: "lengthCalculation", operationType: "lengthCalculation", category: "statistics", label: "Length Calculation", implemented: true },
  { key: "totalLength", operationType: "totalLength", category: "statistics", label: "Total Length", implemented: true },
  { key: "averageLength", operationType: "averageLength", category: "statistics", label: "Average Length", implemented: true },
  { key: "densityAnalysis", operationType: "densityAnalysis", category: "statistics", label: "Density Analysis", implemented: true },
  { key: "boundingBox", operationType: "boundingBox", category: "statistics", label: "Bounding Box", implemented: true },
  { key: "centroid", operationType: "centroid", category: "statistics", label: "Centroid", implemented: true },
  { key: "convexHull", operationType: "convexHull", category: "statistics", label: "Convex Hull", implemented: true },
  { key: "extent", operationType: "extent", category: "statistics", label: "Extent", implemented: true },

  // --- Raster-Ready Framework (US7, FR-017–018) — no operationType yet ---
  // Heatmap is the one raster-adjacent capability this feature actually
  // implements (research.md Decision 9) — flipped to `true` when Phase 16
  // ships its client-side Turf.js point-density rendering; `false` for now
  // since nothing in this codebase renders it yet.
  { key: "heatmap", category: "raster", label: "Heatmap", implemented: true },
  { key: "elevationDem", category: "raster", label: "Elevation / DEM", implemented: false },
  { key: "slope", category: "raster", label: "Slope", implemented: false },
  { key: "aspect", category: "raster", label: "Aspect", implemented: false },
  { key: "hillshade", category: "raster", label: "Hillshade", implemented: false },
]
