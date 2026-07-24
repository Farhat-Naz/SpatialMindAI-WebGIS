"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys as databaseQueryKeys } from "@/features/database"
import { versionService } from "../services/versionService"
import { queryKeys } from "../services/queryKeys"
import type { SaveVersionInput } from "@/shared/contracts/version.schema"

/** Lists a project's versions (metadata only). */
export function useVersions(projectId: string) {
  return useQuery({
    queryKey: queryKeys.versions(projectId),
    queryFn: async () => (await versionService.listVersions(projectId)).versions,
  })
}

/** Saves a new version and invalidates the project's version list on success. */
export function useSaveVersion(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveVersionInput) => versionService.saveVersion(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.versions(projectId) })
    },
  })
}

/**
 * Restores a version. A restore can change any layer/feature in the
 * project, so beyond this feature's own version list, it also invalidates
 * `database`'s entire `["layers", ...]` query-key prefix (imported from
 * `database`'s public barrel) — every layer list and every layer's feature
 * list, project-wide (plan.md React Query Flow).
 */
export function useRestoreVersion(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (versionId: string) => versionService.restoreVersion(versionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.versions(projectId) })
      void queryClient.invalidateQueries({ queryKey: databaseQueryKeys.layers(projectId) })
      void queryClient.invalidateQueries({ queryKey: ["layers"] })
    },
  })
}

/** Compares two versions. */
export function useCompareVersions(versionAId: string | null, versionBId: string | null) {
  return useQuery({
    queryKey: ["versions", "compare", versionAId, versionBId],
    queryFn: () => versionService.compareVersions(versionAId!, versionBId!),
    enabled: Boolean(versionAId && versionBId),
  })
}
