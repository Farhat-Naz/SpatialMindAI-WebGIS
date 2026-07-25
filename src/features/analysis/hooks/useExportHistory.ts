"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { analysisService, type ListPagedParams } from "../services/analysisService"
import { exportAnalysisResult, type ExportFormat, type ExportProgressCallback } from "../services/exportService"
import { queryKeys } from "../services/queryKeys"
import type { AnalysisRunRecord } from "../types/analysis.types"

/** Cursor-paginated export history for a project (US9), newest first. */
export function useExportHistory(projectId: string, params: ListPagedParams = {}) {
  return useQuery({
    queryKey: queryKeys.exportHistory(projectId, params),
    queryFn: () => analysisService.listExports(projectId, params),
    enabled: Boolean(projectId),
  })
}

export interface ExportResultInput {
  run: Pick<AnalysisRunRecord, "resultLayerId" | "resultData">
  format: ExportFormat
  onProgress?: ExportProgressCallback
}

/**
 * Runs a client-side export (research.md Decision 10 — the work happens in
 * the browser, not the server) and logs the outcome via
 * `analysisService.logExport` on completion or failure. Modeled as a
 * mutation (not a network call in the React Query sense) purely so the
 * Result Panel gets the same `isPending`/`onSuccess`/`onError` semantics
 * every other action in this feature already has.
 */
export function useExportResult(projectId: string, sourceAnalysisRunId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ run, format, onProgress }: ExportResultInput) => {
      try {
        const blob = await exportAnalysisResult(run, format, onProgress)
        await analysisService.logExport(projectId, { sourceAnalysisRunId, format, status: "succeeded" })
        return blob
      } catch (error) {
        await analysisService.logExport(projectId, {
          sourceAnalysisRunId,
          format,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Export failed.",
        })
        throw error
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.exportHistoryList(projectId) })
    },
  })
}
