import { z } from "zod"

/** The seven documented notification types (FR-036). */
export const notificationTypeSchema = z.enum([
  "project_shared",
  "invitation_accepted",
  "comment_added",
  "mention",
  "version_restored",
  "feature_assigned",
  "lock_conflict",
])

/** `Notification` shape returned by every notification API response. */
export const notificationSchema = z.object({
  id: z.string(),
  recipientUserId: z.string(),
  type: notificationTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  read: z.boolean(),
  createdAt: z.string(),
})
export type Notification = z.infer<typeof notificationSchema>
