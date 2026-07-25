"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { analysisService } from "../services/analysisService"
import { queryKeys } from "../services/queryKeys"
import type { CreatePresetRequestInput } from "../types/analysis.types"

/** Lists presets visible in a project (US8/FR-021), optionally filtered client-side by operationType. */
export function usePresets(projectId: string, operationType?: string) {
  return useQuery({
    queryKey: queryKeys.analysisPresets(projectId),
    queryFn: () => analysisService.listPresets(projectId),
    enabled: Boolean(projectId),
    select: (data) =>
      operationType ? { presets: data.presets.filter((preset) => preset.operationType === operationType) } : data,
  })
}

/** Saves a named parameter set; invalidates the project's preset list on success. */
export function useSavePreset(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreatePresetRequestInput) => analysisService.savePreset(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysisPresets(projectId) })
    },
  })
}

/** Deletes a preset (creator or project Owner only); invalidates the project's preset list on success. */
export function useDeletePreset(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (presetId: string) => analysisService.deletePreset(presetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.analysisPresets(projectId) })
    },
  })
}
