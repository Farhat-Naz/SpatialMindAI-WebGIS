"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys as databaseQueryKeys } from "@/features/database"
import { DEFAULT_POLL_INTERVAL_MS } from "@/features/analysis/types/analysisConfig.constants"
import { analysisService, type ListRunsParams } from "../services/analysisService"
import { queryKeys } from "../services/queryKeys"
import { useAnalysisStore } from "../store/analysisStore"
import type { AnalysisRequestInput } from "../types/analysis.types"

const NON_TERMINAL_STATUSES = new Set(["queued", "running"])

/**
 * Submits a single Analysis Run (US1-US7's shared entry point — every
 * operation category flows through this one hook, per research.md
 * Decision 1). `retry: false` (T086): an automatic retry of a `POST` that
 * already created a queued job would create a duplicate job. On success,
 * sets `analysisStore.activeRunId` (T111 — "Job Store") so the Progress
 * Dialog/Result Panel know which run to display without an extra manual
 * step in the calling component.
 */
export function useRunAnalysis(projectId: string) {
  const queryClient = useQueryClient()
  const setActiveRunId = useAnalysisStore((state) => state.setActiveRunId)

  return useMutation({
    mutationFn: (input: AnalysisRequestInput) => analysisService.runAnalysis(projectId, input),
    retry: false,
    onSuccess: ({ run }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysisRunsList(projectId) })
      if (run.resultLayerId) {
        void queryClient.invalidateQueries({ queryKey: databaseQueryKeys.layers(projectId) })
      }
      setActiveRunId(run.id)
    },
  })
}

/** Lists a project's Analysis History, optionally filtered by status. */
export function useAnalysisRuns(projectId: string, params: ListRunsParams = {}) {
  return useQuery({
    queryKey: queryKeys.analysisRuns(projectId, params),
    queryFn: () => analysisService.listRuns(projectId, params),
    enabled: Boolean(projectId),
  })
}

/**
 * Fetches one run's current detail — the Progress Dialog's sole data
 * source (research.md Decision 5). With `poll: true`, polls at
 * `DEFAULT_POLL_INTERVAL_MS` while the last-known `status` is
 * `"queued"`/`"running"`, stopping automatically once a terminal status is
 * cached. T087: a small bounded retry count so one transient network blip
 * doesn't stop the dialog from updating, without retrying forever.
 */
export function useAnalysisRun(runId: string, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: queryKeys.analysisRun(runId),
    queryFn: () => analysisService.getRun(runId),
    enabled: Boolean(runId),
    retry: 3,
    refetchInterval: (query) => {
      if (!options?.poll) return false
      const status = query.state.data?.run.status
      return status && NON_TERMINAL_STATUSES.has(status) ? DEFAULT_POLL_INTERVAL_MS : false
    },
  })
}

/** Requests cancellation of a queued/running run; invalidates its own query key on success. */
export function useCancelAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (runId: string) => analysisService.cancelAnalysis(runId),
    onSuccess: (_data, runId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysisRun(runId) })
    },
  })
}

/** Discards a run's result layer (FR-031); invalidates both the run's history list and `database`'s layer list. */
export function useDiscardAnalysisResult(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (runId: string) => analysisService.discardResult(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysisRunsList(projectId) })
      void queryClient.invalidateQueries({ queryKey: databaseQueryKeys.layers(projectId) })
    },
  })
}

/** Re-runs a past analysis with its original inputs/parameters (FR-025). */
export function useRerunAnalysis() {
  return useMutation({
    mutationFn: (runId: string) => analysisService.rerunAnalysis(runId),
  })
}

/** Deletes a history entry only — never its result layer (FR-026); invalidates the project's run list on success. */
export function useDeleteAnalysisRun(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (runId: string) => analysisService.deleteRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysisRunsList(projectId) })
    },
  })
}
