export type {
  AnalysisBatchRequestInput,
  AnalysisRequestInput,
  ListAnalysisRunsQuery,
  OperationType,
} from "@/shared/contracts/analysis.schema"
export type { CreatePresetRequestInput } from "@/shared/contracts/presetRequest.schema"
export type { SaveMeasurementRequestInput } from "@/shared/contracts/measurementRequest.schema"
export type { LogExportRequestInput } from "@/shared/contracts/exportLogRequest.schema"

/**
 * Shared by both `AnalysisRunRecord` and `ExportJobRecord` (T010) so the
 * two never define their own status union independently and drift apart.
 * `AnalysisRun`'s widened lifecycle (data-model.md) — `ExportJob` only ever
 * uses the two terminal values, since it has no `queued`/`running` phase
 * (research.md Decision 10 — client-driven, no server execution to track).
 */
export type AnalysisJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

/** Client-facing shape of a (widened, data-model.md) `AnalysisRun` row, as returned by every `analysis` Route Handler — dates are ISO strings over HTTP. */
export interface AnalysisRunRecord {
  id: string
  projectId: string
  userId: string
  operationType: string
  status: AnalysisJobStatus
  progress: number | null
  parameters: unknown
  inputLayerIds: string[]
  resultLayerId: string | null
  resultData: unknown
  errorMessage: string | null
  batchId: string | null
  presetId: string | null
  startedAt: string | null
  completedAt: string | null
  executionTimeMs: number | null
  cancelRequestedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Client-facing shape of an `AnalysisPreset` row (data-model.md, US8/FR-021). */
export interface AnalysisPresetRecord {
  id: string
  projectId: string
  userId: string
  name: string
  operationType: string
  parameters: unknown
  createdAt: string
  updatedAt: string
}

/** Client-facing shape of a `MeasurementHistory` row (data-model.md, US3/FR-008). `geometry` is the same GeoJSON shape `Feature.geometry` already uses over HTTP. */
export interface MeasurementHistoryRecord {
  id: string
  projectId: string
  userId: string
  measurementType: "distance" | "area" | "perimeter" | "radius" | "bearing" | "azimuth" | "coordinates"
  geometry: unknown
  value: number | null
  unit: string | null
  label: string | null
  createdAt: string
}

/** Client-facing shape of an `ExportJob` row (data-model.md, US9) — a lightweight, always-terminal history record; see `AnalysisJobStatus`'s own doc for why it shares that union rather than its own. */
export interface ExportJobRecord {
  id: string
  projectId: string
  userId: string
  sourceAnalysisRunId: string | null
  sourceLayerId: string | null
  format: "geojson" | "shapefile" | "csv" | "kml"
  status: Extract<AnalysisJobStatus, "succeeded" | "failed">
  featureCount: number | null
  errorMessage: string | null
  createdAt: string
}
