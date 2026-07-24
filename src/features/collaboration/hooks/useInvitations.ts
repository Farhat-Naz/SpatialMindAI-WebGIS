"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { invitationService } from "../services/invitationService"
import { queryKeys } from "../services/queryKeys"
import type { InviteMemberInput } from "@/shared/contracts/membership.schema"

/** Lists a project's invitations. */
export function useInvitations(projectId: string) {
  return useQuery({
    queryKey: queryKeys.invitations(projectId),
    queryFn: async () => (await invitationService.listInvitations(projectId)).invitations,
  })
}

/** Invites a member and invalidates the invitation list on success. */
export function useInvite(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InviteMemberInput) => invitationService.invite(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(projectId) })
    },
  })
}

/** Accepts an invitation, invalidating both invitations and the member list (a new member appears). */
export function useAcceptInvitation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => invitationService.accept(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(projectId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) })
    },
  })
}

/** Declines an invitation and invalidates the invitation list on success. */
export function useDeclineInvitation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (invitationId: string) => invitationService.decline(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invitations(projectId) })
    },
  })
}
