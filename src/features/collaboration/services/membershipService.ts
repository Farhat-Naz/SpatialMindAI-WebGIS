import type { ChangeMemberRoleInput, ProjectMember, TransferOwnershipInput } from "@/shared/contracts/membership.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the membership API — the only caller-facing path to `/api/projects/:id/members*`. */
export const membershipService = {
  listMembers(projectId: string): Promise<{ members: ProjectMember[] }> {
    return apiFetch(`/api/projects/${projectId}/members`)
  },
  changeRole(projectId: string, userId: string, input: ChangeMemberRoleInput): Promise<{ member: ProjectMember }> {
    return apiFetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  },
  removeMember(projectId: string, userId: string): Promise<void> {
    return apiFetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" })
  },
  transferOwnership(projectId: string, input: TransferOwnershipInput): Promise<{ success: boolean }> {
    return apiFetch(`/api/projects/${projectId}/transfer-ownership`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
}
