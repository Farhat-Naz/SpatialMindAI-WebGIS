"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { analysisService, type ListPagedParams } from "../services/analysisService"
import { queryKeys } from "../services/queryKeys"
import type { SaveMeasurementRequestInput } from "../types/analysis.types"

/** Cursor-paginated measurement history for a project (US3/FR-008), newest first. */
export function useMeasurementHistory(projectId: string, params: ListPagedParams = {}) {
  return useQuery({
    queryKey: queryKeys.measurementHistory(projectId, params),
    queryFn: () => analysisService.listMeasurements(projectId, params),
    enabled: Boolean(projectId),
  })
}

/** Saves a measurement (research.md Decision 8 — server-recomputed value); invalidates the project's measurement list only. */
export function useSaveMeasurement(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SaveMeasurementRequestInput) => analysisService.saveMeasurement(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.measurementHistoryList(projectId) })
    },
  })
}

/** Deletes a saved measurement (creator or Owner only); invalidates the project's measurement list only. */
export function useDeleteMeasurement(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (measurementId: string) => analysisService.deleteMeasurement(measurementId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.measurementHistoryList(projectId) })
    },
  })
}
