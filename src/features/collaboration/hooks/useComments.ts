"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { commentService } from "../services/commentService"
import { queryKeys } from "../services/queryKeys"
import type { CreateCommentInput, UpdateCommentInput } from "@/shared/contracts/comment.schema"

/** Lists a feature's comments (all threads). */
export function useComments(featureId: string) {
  return useQuery({
    queryKey: queryKeys.comments(featureId),
    queryFn: async () => (await commentService.listComments(featureId)).comments,
  })
}

/** Creates a comment and invalidates the feature's comment list on success. */
export function useCreateComment(featureId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCommentInput) => commentService.createComment(featureId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(featureId) })
    },
  })
}

/** Updates a comment's body and invalidates the feature's comment list on success. */
export function useUpdateComment(featureId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, input }: { commentId: string; input: UpdateCommentInput }) =>
      commentService.updateComment(commentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(featureId) })
    },
  })
}

/** Toggles a comment's resolved state and invalidates the feature's comment list on success. */
export function useResolveComment(featureId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      commentService.resolveComment(commentId, resolved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(featureId) })
    },
  })
}

/** Deletes a comment and invalidates the feature's comment list on success. */
export function useDeleteComment(featureId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => commentService.deleteComment(commentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(featureId) })
    },
  })
}
