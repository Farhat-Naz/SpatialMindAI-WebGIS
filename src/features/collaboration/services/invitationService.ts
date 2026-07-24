import type { Invitation } from "@/shared/contracts/invitation.schema"
import type { InviteMemberInput } from "@/shared/contracts/membership.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the invitation API. */
export const invitationService = {
  invite(projectId: string, input: InviteMemberInput): Promise<{ invitation: Invitation | null }> {
    return apiFetch(`/api/projects/${projectId}/invitations`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
  listInvitations(projectId: string): Promise<{ invitations: Invitation[] }> {
    return apiFetch(`/api/projects/${projectId}/invitations`)
  },
  accept(invitationId: string): Promise<{ invitation: Invitation }> {
    return apiFetch(`/api/invitations/${invitationId}/accept`, { method: "POST" })
  },
  decline(invitationId: string): Promise<{ invitation: Invitation }> {
    return apiFetch(`/api/invitations/${invitationId}/decline`, { method: "POST" })
  },
}
