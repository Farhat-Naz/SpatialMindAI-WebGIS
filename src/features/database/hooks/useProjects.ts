"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { projectService } from "@/features/database/services/projectService"
import { queryKeys } from "@/features/database/services/queryKeys"
import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@/shared/contracts/project.schema"

/** Lists the current user's projects. */
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: async () => (await projectService.list()).projects,
  })
}

/** Creates a project and invalidates the project list on success. */
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectService.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    },
  })
}

/** Updates a project and invalidates its list and detail queries on success. */
export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateProjectInput) => projectService.update(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
    },
  })
}

/** Deletes a project and invalidates the project list on success. */
export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => projectService.remove(projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    },
  })
}

export type { Project }
