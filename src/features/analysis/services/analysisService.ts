import type {
  AnalysisBatchRequestInput,
  AnalysisPresetRecord,
  AnalysisRequestInput,
  AnalysisRunRecord,
  CreatePresetRequestInput,
  ExportJobRecord,
  LogExportRequestInput,
  MeasurementHistoryRecord,
  SaveMeasurementRequestInput,
} from "../types/analysis.types"
import { apiFetch } from "./apiFetch"

export interface ListRunsParams {
  cursor?: string
  limit?: number
  batchId?: string
  status?: string[]
}

export interface ListPagedParams {
  cursor?: string
  limit?: number
}

function toQueryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params) as [string, string | number | string[] | undefined][]) {
    if (value === undefined) continue
    search.set(key, Array.isArray(value) ? value.join(",") : String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}

/**
 * Client-side fetch wrappers for the Analysis API (contracts/client-api.md).
 * Thin `apiFetch` wrappers only — no business logic beyond request
 * shaping/response parsing (Constitution Principle I).
 */
export const analysisService = {
  /** `POST /api/projects/:projectId/analysis` — the response's `run.status` may still be `"queued"`/`"running"` for a background-executed operation (research.md Decision 5); callers never assume a fixed timing. */
  runAnalysis(projectId: string, input: AnalysisRequestInput): Promise<{ run: AnalysisRunRecord }> {
    return apiFetch(`/api/projects/${projectId}/analysis`, { method: "POST", body: JSON.stringify(input) })
  },
  runBatchAnalysis(
    projectId: string,
    input: AnalysisBatchRequestInput,
  ): Promise<{ batchId: string; runs: AnalysisRunRecord[] }> {
    return apiFetch(`/api/projects/${projectId}/analysis/batch`, { method: "POST", body: JSON.stringify(input) })
  },
  listRuns(projectId: string, params: ListRunsParams = {}): Promise<{ runs: AnalysisRunRecord[]; nextCursor: string | null }> {
    return apiFetch(`/api/projects/${projectId}/analysis${toQueryString(params)}`)
  },
  /** `GET /api/analysis/:runId` — the polling target for the Progress Dialog (research.md Decision 5). */
  getRun(runId: string): Promise<{ run: AnalysisRunRecord }> {
    return apiFetch(`/api/analysis/${runId}`)
  },
  cancelAnalysis(runId: string): Promise<{ run: AnalysisRunRecord }> {
    return apiFetch(`/api/analysis/${runId}/cancel`, { method: "POST" })
  },
  discardResult(runId: string): Promise<{ run: AnalysisRunRecord }> {
    return apiFetch(`/api/analysis/${runId}/discard-result`, { method: "POST" })
  },
  rerunAnalysis(runId: string): Promise<{ run: AnalysisRunRecord }> {
    return apiFetch(`/api/analysis/${runId}/rerun`, { method: "POST" })
  },
  deleteRun(runId: string): Promise<void> {
    return apiFetch(`/api/analysis/${runId}`, { method: "DELETE" })
  },

  listPresets(projectId: string): Promise<{ presets: AnalysisPresetRecord[] }> {
    return apiFetch(`/api/projects/${projectId}/analysis/presets`)
  },
  savePreset(projectId: string, input: CreatePresetRequestInput): Promise<{ preset: AnalysisPresetRecord }> {
    return apiFetch(`/api/projects/${projectId}/analysis/presets`, { method: "POST", body: JSON.stringify(input) })
  },
  deletePreset(presetId: string): Promise<void> {
    return apiFetch(`/api/analysis/presets/${presetId}`, { method: "DELETE" })
  },

  saveMeasurement(
    projectId: string,
    input: SaveMeasurementRequestInput,
  ): Promise<{ measurement: MeasurementHistoryRecord }> {
    return apiFetch(`/api/projects/${projectId}/measurements`, { method: "POST", body: JSON.stringify(input) })
  },
  listMeasurements(
    projectId: string,
    params: ListPagedParams = {},
  ): Promise<{ measurements: MeasurementHistoryRecord[]; nextCursor: string | null }> {
    return apiFetch(`/api/projects/${projectId}/measurements${toQueryString(params)}`)
  },
  deleteMeasurement(measurementId: string): Promise<void> {
    return apiFetch(`/api/measurements/${measurementId}`, { method: "DELETE" })
  },

  logExport(projectId: string, input: LogExportRequestInput): Promise<{ exportJob: ExportJobRecord }> {
    return apiFetch(`/api/projects/${projectId}/exports`, { method: "POST", body: JSON.stringify(input) })
  },
  listExports(
    projectId: string,
    params: ListPagedParams = {},
  ): Promise<{ exports: ExportJobRecord[]; nextCursor: string | null }> {
    return apiFetch(`/api/projects/${projectId}/exports${toQueryString(params)}`)
  },
}
