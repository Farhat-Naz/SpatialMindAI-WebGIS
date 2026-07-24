"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { layerService } from "@/features/database/services/layerService"
import { queryKeys } from "@/features/database/services/queryKeys"
import type { CreateLayerInput, Layer, RenameLayerInput } from "@/shared/contracts/layer.schema"

/** Lists a project's layers, ordered. */
export function useLayers(projectId: string) {
  return useQuery({
    queryKey: queryKeys.layers(projectId),
    queryFn: async () => (await layerService.list(projectId)).layers,
    enabled: Boolean(projectId),
  })
}

/** Creates a layer within a project and invalidates its layer list on success. */
export function useCreateLayer(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateLayerInput) => layerService.create(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.layers(projectId) })
    },
  })
}

/** Renames a layer; invalidates the parent project's layer list on success. */
export function useRenameLayer(layerId: string, projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RenameLayerInput) => layerService.rename(layerId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.layers(projectId) })
    },
  })
}

/** Bulk-reorders a project's layers; invalidates its layer list on success. */
export function useReorderLayers(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orderedLayerIds: string[]) => layerService.reorder(projectId, orderedLayerIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.layers(projectId) })
    },
  })
}

/** Deletes a layer; invalidates the parent project's layer list on success. */
export function useDeleteLayer(layerId: string, projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => layerService.remove(layerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.layers(projectId) })
    },
  })
}

export type { Layer }
