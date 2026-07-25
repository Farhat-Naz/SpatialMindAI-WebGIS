import type { Invitation } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { recordActivity } from "@/server/repositories/activityRepository"
import { createNotification } from "@/server/repositories/notificationRepository"
import { projectChannel, publish } from "@/server/realtime/channel"
import { ForbiddenError, NotFoundError } from "@/shared/errors/apiError"

/**
 * Creates an invitation (FR-010–FR-012). Per Edge Cases (duplicate
 * invitations), this is a conditional no-op, not a `@@unique` constraint —
 * if a `"pending"` invitation already exists for `(projectId,
 * invitedUserId)`, or that user already has a `ProjectMember` row, the
 * existing invitation (or `null` for the already-a-member case) is
 * returned unchanged rather than creating a duplicate or erroring.
 */
export async function createInvitation(
  projectId: string,
  invitedByUserId: string,
  invitedUserId: string,
  role: "Editor" | "Viewer",
): Promise<Invitation | null> {
  const existingMembership = await prismaClient.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: invitedUserId } },
  })
  if (existingMembership) {
    return null
  }

  const existingPending = await prismaClient.invitation.findFirst({
    where: { projectId, invitedUserId, status: "pending" },
  })
  if (existingPending) {
    return existingPending
  }

  return prismaClient.invitation.create({
    data: { projectId, invitedByUserId, invitedUserId, role, status: "pending" },
  })
}

/** Lists a project's invitations, newest first. */
export async function listInvitationsForProject(projectId: string): Promise<Invitation[]> {
  return prismaClient.invitation.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Accepts an invitation: creates the `ProjectMember` row, writes an
 * `Activity` entry, and notifies the inviter — all inside one transaction
 * (research.md Decisions 8–9). Only the invited user may accept.
 */
export async function acceptInvitation(invitationId: string, userId: string): Promise<Invitation> {
  const invitation = await prismaClient.invitation.findUnique({ where: { id: invitationId } })
  if (!invitation) {
    throw new NotFoundError(`No invitation found with id "${invitationId}".`)
  }
  if (invitation.invitedUserId !== userId) {
    throw new NotFoundError(`No invitation found with id "${invitationId}".`)
  }
  if (invitation.status !== "pending") {
    throw new ForbiddenError("This invitation is no longer pending.")
  }

  return prismaClient.$transaction(async (tx) => {
    await tx.projectMember.create({
      data: { projectId: invitation.projectId, userId, role: invitation.role },
    })

    const updated = await tx.invitation.update({
      where: { id: invitationId },
      data: { status: "accepted" },
    })

    await recordActivity(tx, {
      projectId: invitation.projectId,
      userId,
      action: "share",
      targetType: "invitation",
      targetId: invitationId,
    })

    await createNotification(tx, {
      recipientUserId: invitation.invitedByUserId,
      type: "invitation_accepted",
      payload: { projectId: invitation.projectId, invitationId, acceptedByUserId: userId },
    })

    await publish(projectChannel(invitation.projectId), { type: "member", action: "joined", userId }, tx)

    return updated
  })
}

/** Declines an invitation. Only the invited user may decline. */
export async function declineInvitation(invitationId: string, userId: string): Promise<Invitation> {
  const invitation = await prismaClient.invitation.findUnique({ where: { id: invitationId } })
  if (!invitation) {
    throw new NotFoundError(`No invitation found with id "${invitationId}".`)
  }
  if (invitation.invitedUserId !== userId) {
    throw new NotFoundError(`No invitation found with id "${invitationId}".`)
  }
  if (invitation.status !== "pending") {
    throw new ForbiddenError("This invitation is no longer pending.")
  }

  return prismaClient.invitation.update({
    where: { id: invitationId },
    data: { status: "declined" },
  })
}
