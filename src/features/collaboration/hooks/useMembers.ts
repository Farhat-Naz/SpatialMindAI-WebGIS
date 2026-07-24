"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { membershipService } from "../services/membershipService"
import { queryKeys } from "../services/queryKeys"
import type { ChangeMemberRoleInput, TransferOwnershipInput } from "@/shared/contracts/membership.schema"

/** Lists a project's members. */
export function useMembers(projectId: string) {
  return useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: async () => (await membershipService.listMembers(projectId)).members,
  })
}

/** Changes a member's role and invalidates the member list on success. */
export function useChangeRole(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: ChangeMemberRoleInput }) =>
      membershipService.changeRole(projectId, userId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) })
    },
  })
}

/** Removes a member and invalidates the member list on success. */
export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => membershipService.removeMember(projectId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) })
    },
  })
}

/** Transfers project ownership and invalidates the member list on success. */
export function useTransferOwnership(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TransferOwnershipInput) => membershipService.transferOwnership(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) })
    },
  })
}
