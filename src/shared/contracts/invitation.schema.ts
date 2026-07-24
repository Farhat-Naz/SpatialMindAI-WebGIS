import { z } from "zod"
import { memberRoleSchema } from "./membership.schema"

export const invitationStatusSchema = z.enum(["pending", "accepted", "declined", "expired"])

/** `Invitation` shape returned by every invitation API response (FR-010–FR-012). */
export const invitationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  invitedByUserId: z.string(),
  invitedUserId: z.string(),
  role: memberRoleSchema,
  status: invitationStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Invitation = z.infer<typeof invitationSchema>
