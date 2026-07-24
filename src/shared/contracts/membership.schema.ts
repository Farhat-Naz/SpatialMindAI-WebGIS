import { z } from "zod"

/** Roles a member (not the project's Owner) can hold — Owner only ever changes via transfer. */
export const memberRoleSchema = z.enum(["Editor", "Viewer"])

/** `POST /api/projects/:projectId/invitations` request body. */
export const inviteMemberSchema = z.object({
  invitedUserId: z.string().trim().min(1, "invitedUserId is required"),
  role: memberRoleSchema,
})
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>

/** `PATCH /api/projects/:projectId/members/:userId` request body. */
export const changeMemberRoleSchema = z.object({
  role: memberRoleSchema,
})
export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>

/** `POST /api/projects/:projectId/transfer-ownership` request body. */
export const transferOwnershipSchema = z.object({
  newOwnerUserId: z.string().trim().min(1, "newOwnerUserId is required"),
})
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>

/** `ProjectMember` shape returned by every membership API response. */
export const projectMemberSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  role: z.enum(["Owner", "Editor", "Viewer"]),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ProjectMember = z.infer<typeof projectMemberSchema>
