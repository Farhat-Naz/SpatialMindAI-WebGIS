import { z } from "zod"

const layerId = z.string().trim().min(1)
const distanceUnit = z.enum(["meters", "kilometers", "feet", "miles"])
const shortDistanceUnit = z.enum(["meters", "kilometers"])
const relationship = z.enum(["intersects", "within", "contains", "nearest"])
/** A raw `[x, y]` coordinate pair in some named source CRS — not assumed WGS84-range (unlike `geometry.schema.ts`'s `position`). */
const rawCoordinate = z.tuple([z.number(), z.number()])

const noParameters = z.undefined().optional()

/**
 * Per-operation `parameters` shape and `inputLayerIds` cardinality, shared
 * by both the single-run and batch request schemas below so the two never
 * drift apart (api-contracts.md's per-operation table, Research Decision 3).
 */
const operationDefinitions = {
  buffer: {
    inputLayerIds: z.tuple([layerId]),
    parameters: z.object({ distance: z.number().positive(), unit: distanceUnit }),
  },
  intersect: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  union: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  difference: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  clip: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  dissolve: {
    inputLayerIds: z.tuple([layerId]),
    parameters: z.object({ attributeKey: z.string().trim().min(1) }),
  },
  merge: { inputLayerIds: z.array(layerId).min(2), parameters: noParameters },
  split: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  spatialJoin: {
    inputLayerIds: z.tuple([layerId, layerId]),
    parameters: z.object({ relationship }),
  },
  pointInPolygon: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  nearAnalysis: {
    inputLayerIds: z.tuple([layerId, layerId]),
    parameters: z
      .object({ maxDistance: z.number().positive().optional(), unit: shortDistanceUnit.optional() })
      .optional(),
  },
  distanceMatrix: {
    inputLayerIds: z.tuple([layerId, layerId]),
    parameters: z.object({ unit: shortDistanceUnit }),
  },
  areaCalculation: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  lengthCalculation: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  centroid: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  convexHull: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  boundingBox: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  densityAnalysis: {
    inputLayerIds: z.tuple([layerId]),
    parameters: z.object({ cellSize: z.number().positive(), unit: shortDistanceUnit }),
  },
  coordinateConversion: {
    inputLayerIds: z.tuple([]),
    parameters: z.object({
      coordinates: z.array(rawCoordinate).min(1),
      sourceCrs: z.string().trim().min(1),
    }),
  },
  crsTransformation: {
    inputLayerIds: z.tuple([layerId]),
    parameters: z.object({ targetCrs: z.string().trim().min(1) }),
  },

  // --- specs/007-spatial-analysis additions (data-model.md "New operationType
  // values") — enum scaffolding only (T009); each operation's own phase
  // (8-13) replaces `noParameters` with its real parameter shape. ---

  // US4 — Overlay Analysis (research.md Decision 7); intersect/union/
  // difference/clip already exist from 005 and are reused unchanged.
  erase: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  identity: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  symmetricalDifference: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },

  // US5 — Geometry Processing; split/merge/dissolve already exist from 005.
  simplify: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  smoothGeometry: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  multipartToSinglepart: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  singlepartToMultipart: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  repairGeometry: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },

  // US2 — Spatial Query; spatialJoin/pointInPolygon/nearAnalysis already
  // cover intersects/within/contains/nearest.
  selectByLocation: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  selectByAttribute: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  touches: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  crosses: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },
  overlaps: { inputLayerIds: z.tuple([layerId, layerId]), parameters: noParameters },

  // US6 — Spatial Statistics; areaCalculation/lengthCalculation/centroid/
  // convexHull/boundingBox/densityAnalysis already exist from 005.
  featureCount: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  totalLength: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  averageLength: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  averageArea: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
  extent: { inputLayerIds: z.tuple([layerId]), parameters: noParameters },
} as const

type OperationDefinitions = typeof operationDefinitions
export type OperationType = keyof OperationDefinitions

/**
 * The single request-body contract for `POST /api/projects/:projectId/analysis`
 * — one discriminated union covering all 22 operations from spec.md, keyed
 * by `operationType`, mirroring `geometry.schema.ts`'s existing pattern
 * (Research Decision 3). Heatmap has no variant here — it is client-side
 * only and never reaches this endpoint (Research Decision 9).
 */
const requestVariants = Object.entries(operationDefinitions).map(([operationType, def]) =>
  z.object({
    operationType: z.literal(operationType as OperationType),
    inputLayerIds: def.inputLayerIds,
    parameters: def.parameters,
  }),
)
export const analysisRequestSchema = z.discriminatedUnion("operationType", [
  requestVariants[0],
  ...requestVariants.slice(1),
])
export type AnalysisRequestInput = z.infer<typeof analysisRequestSchema>

/**
 * `POST /api/projects/:projectId/analysis/batch` request body — one
 * operation/parameter set applied across 1–20 independent input sets
 * (FR-022). Reuses the same per-operation `parameters` shape as
 * `analysisRequestSchema` so the two contracts cannot drift apart.
 */
const batchVariants = Object.entries(operationDefinitions).map(([operationType, def]) =>
  z.object({
    operationType: z.literal(operationType as OperationType),
    parameters: def.parameters,
    items: z.array(z.object({ inputLayerIds: def.inputLayerIds })).min(1).max(20),
  }),
)
export const analysisBatchRequestSchema = z.discriminatedUnion("operationType", [
  batchVariants[0],
  ...batchVariants.slice(1),
])
export type AnalysisBatchRequestInput = z.infer<typeof analysisBatchRequestSchema>

/** `GET /api/projects/:projectId/analysis` query params — cursor pagination plus an optional Batch Run scope. */
export const listAnalysisRunsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  batchId: z.string().optional(),
})
export type ListAnalysisRunsQuery = z.infer<typeof listAnalysisRunsQuerySchema>
