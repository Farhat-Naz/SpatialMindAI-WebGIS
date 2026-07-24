"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  featureService,
  type ListFeaturesQueryParams,
} from "@/features/database/services/featureService"
import { queryKeys } from "@/features/database/services/queryKeys"
import type { CreateFeatureInput, Feature, UpdateFeatureInput } from "@/shared/contracts/feature.schema"

/** Lists a layer's features; re-fetches when `params` (e.g. `cursor`) changes. */
export function useFeatures(layerId: string, params?: ListFeaturesQueryParams) {
  return useQuery({
    queryKey: queryKeys.features(layerId, params),
    queryFn: () => featureService.list(layerId, params),
    enabled: Boolean(layerId),
  })
}

/** Creates a feature within a layer; invalidates that layer's feature list on success. */
export function useCreateFeature(layerId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateFeatureInput) => featureService.create(layerId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.featuresList(layerId) })
    },
  })
}

/** Updates a feature's geometry/attributes/style; invalidates its detail and layer list on success. */
export function useUpdateFeature(featureId: string, layerId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateFeatureInput) => featureService.update(featureId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feature(featureId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.featuresList(layerId) })
    },
  })
}

/** Deletes a feature; invalidates the parent layer's feature list on success. */
export function useDeleteFeature(featureId: string, layerId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => featureService.remove(featureId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.featuresList(layerId) })
    },
  })
}

export type { Feature }
