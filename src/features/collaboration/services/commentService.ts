import type { Comment, CreateCommentInput, UpdateCommentInput } from "@/shared/contracts/comment.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the comment API. */
export const commentService = {
  listComments(featureId: string): Promise<{ comments: Comment[] }> {
    return apiFetch(`/api/features/${featureId}/comments`)
  },
  createComment(featureId: string, input: CreateCommentInput): Promise<{ comment: Comment }> {
    return apiFetch(`/api/features/${featureId}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
  updateComment(commentId: string, input: UpdateCommentInput): Promise<{ comment: Comment }> {
    return apiFetch(`/api/comments/${commentId}`, { method: "PATCH", body: JSON.stringify(input) })
  },
  resolveComment(commentId: string, resolved: boolean): Promise<{ comment: Comment }> {
    return apiFetch(`/api/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved }),
    })
  },
  deleteComment(commentId: string): Promise<void> {
    return apiFetch(`/api/comments/${commentId}`, { method: "DELETE" })
  },
}
