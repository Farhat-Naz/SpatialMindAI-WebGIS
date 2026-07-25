import type { Comment, Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { getProjectIdForFeature } from "@/server/repositories/featureRepository"
import { createNotification } from "@/server/repositories/notificationRepository"
import { projectChannel, publish } from "@/server/realtime/channel"
import { ForbiddenError, NotFoundError } from "@/shared/errors/apiError"

/**
 * A mention token is `@` followed by the local part (before `@`) of a
 * project member's email — this schema has no dedicated username field
 * (research.md Decision 11), so the email local part is the closest
 * existing analog to a "known project member's identifier."
 */
const MENTION_PATTERN = /@([a-zA-Z0-9._-]+)/g

async function resolveMentions(
  tx: Prisma.TransactionClient,
  featureId: string,
  body: string,
): Promise<string[]> {
  const tokens = new Set([...body.matchAll(MENTION_PATTERN)].map((match) => match[1].toLowerCase()))
  if (tokens.size === 0) {
    return []
  }

  const members = await tx.projectMember.findMany({
    where: { project: { layers: { some: { features: { some: { id: featureId } } } } } },
    include: { user: true },
  })

  const mentioned = new Set<string>()
  for (const member of members) {
    const localPart = member.user.email.split("@")[0]?.toLowerCase()
    if (localPart && tokens.has(localPart)) {
      mentioned.add(member.userId)
    }
  }
  return [...mentioned]
}

/** Lists every comment (all threads) on a feature, oldest first — the client assembles the thread tree. */
export async function listCommentsForFeature(featureId: string): Promise<Comment[]> {
  return prismaClient.comment.findMany({
    where: { featureId },
    orderBy: { createdAt: "asc" },
  })
}

/**
 * Creates a comment (US6), parsing `@mentions` at save time (research.md
 * Decision 11) and writing one `Notification` per mentioned member, all
 * inside one transaction. Publishes a `comment` realtime event (US6
 * scenario 1 — every member sees a new comment live).
 */
export async function createComment(
  featureId: string,
  authorId: string,
  body: string,
  parentCommentId?: string,
): Promise<Comment> {
  if (parentCommentId) {
    const parent = await prismaClient.comment.findUnique({ where: { id: parentCommentId } })
    if (!parent || parent.featureId !== featureId) {
      throw new NotFoundError(`No comment found with id "${parentCommentId}" on this feature.`)
    }
  }

  const projectId = await getProjectIdForFeature(featureId)

  return prismaClient.$transaction(async (tx) => {
    const mentionedUserIds = await resolveMentions(tx, featureId, body)

    const comment = await tx.comment.create({
      data: { featureId, authorId, parentCommentId, body, mentionedUserIds },
    })

    for (const recipientUserId of mentionedUserIds) {
      if (recipientUserId === authorId) continue
      await createNotification(tx, {
        recipientUserId,
        type: "mention",
        payload: { featureId, commentId: comment.id, authorId },
      })
    }

    await publish(projectChannel(projectId), { type: "comment", action: "create", featureId, commentId: comment.id }, tx)

    return comment
  })
}

/** Updates a comment's body and/or resolved state. Only the author may edit the body (FR-035). Publishes on success. */
export async function updateComment(
  commentId: string,
  userId: string,
  data: { body?: string; resolved?: boolean },
): Promise<Comment> {
  const existing = await prismaClient.comment.findUnique({ where: { id: commentId } })
  if (!existing) {
    throw new NotFoundError(`No comment found with id "${commentId}".`)
  }
  if (data.body !== undefined && existing.authorId !== userId) {
    throw new ForbiddenError("Only the comment's author may edit it.")
  }

  const projectId = await getProjectIdForFeature(existing.featureId)

  return prismaClient.$transaction(async (tx) => {
    const comment = await tx.comment.update({ where: { id: commentId }, data })
    await publish(
      projectChannel(projectId),
      { type: "comment", action: "update", featureId: existing.featureId, commentId },
      tx,
    )
    return comment
  })
}

/** Toggles `resolved` — never deletes or hides the comment or its replies (FR-033). Publishes on success. */
export async function resolveComment(commentId: string, resolved: boolean): Promise<Comment> {
  const existing = await prismaClient.comment.findUnique({ where: { id: commentId } })
  if (!existing) {
    throw new NotFoundError(`No comment found with id "${commentId}".`)
  }

  const projectId = await getProjectIdForFeature(existing.featureId)

  return prismaClient.$transaction(async (tx) => {
    const comment = await tx.comment.update({ where: { id: commentId }, data: { resolved } })
    await publish(
      projectChannel(projectId),
      { type: "comment", action: "resolve", featureId: existing.featureId, commentId },
      tx,
    )
    return comment
  })
}

/** Deletes a comment (author-only, FR-035) — cascades to its replies. Publishes on success. */
export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const existing = await prismaClient.comment.findUnique({ where: { id: commentId } })
  if (!existing) {
    throw new NotFoundError(`No comment found with id "${commentId}".`)
  }
  if (existing.authorId !== userId) {
    throw new ForbiddenError("Only the comment's author may delete it.")
  }

  const projectId = await getProjectIdForFeature(existing.featureId)

  await prismaClient.$transaction(async (tx) => {
    await tx.comment.delete({ where: { id: commentId } })
    await publish(
      projectChannel(projectId),
      { type: "comment", action: "delete", featureId: existing.featureId, commentId },
      tx,
    )
  })
}
