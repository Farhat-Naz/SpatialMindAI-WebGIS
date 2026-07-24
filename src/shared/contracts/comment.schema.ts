import { z } from "zod"

/** `POST /api/features/:featureId/comments` request body. */
export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment body must not be empty"),
  parentCommentId: z.string().trim().min(1).optional(),
})
export type CreateCommentInput = z.infer<typeof createCommentSchema>

/** `PATCH /api/comments/:commentId` request body — at least one field required. */
export const updateCommentSchema = z
  .object({
    body: z.string().trim().min(1, "Comment body must not be empty").optional(),
    resolved: z.boolean().optional(),
  })
  .refine((data) => data.body !== undefined || data.resolved !== undefined, {
    message: "At least one of body or resolved must be provided",
  })
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>

/** `Comment` shape returned by every comment API response (US6). */
export const commentSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  authorId: z.string(),
  parentCommentId: z.string().nullable(),
  body: z.string(),
  resolved: z.boolean(),
  mentionedUserIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Comment = z.infer<typeof commentSchema>
