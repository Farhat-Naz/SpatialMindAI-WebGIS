import type { Prisma, ProjectMember } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { projectChannel, publish } from "@/server/realtime/channel"
import { NotFoundError, ValidationError } from "@/shared/errors/apiError"
import type { ProjectRole } from "@/server/auth/assertProjectRole"

/** Lists every member of a project (any role), most recently added first. */
export async function listMembersForProject(projectId: string): Promise<ProjectMember[]> {
  return prismaClient.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Changes a member's role between `"Editor"`/`"Viewer"` (never `"Owner"` —
 * ownership only changes via `transferOwnership`). Downgrading a member
 * releases every `FeatureLock` they currently hold within this project
 * (Edge Cases: a Viewer cannot hold a lock).
 */
export async function changeMemberRole(
  projectId: string,
  userId: string,
  role: "Editor" | "Viewer",
): Promise<ProjectMember> {
  const existing = await prismaClient.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  if (!existing) {
    throw new NotFoundError(`No membership found for user "${userId}" in this project.`)
  }
  if (existing.role === "Owner") {
    throw new ValidationError("The Owner's role cannot be changed this way — use transfer-ownership.")
  }

  return prismaClient.$transaction(async (tx) => {
    if (role === "Viewer") {
      await tx.featureLock.deleteMany({
        where: { lockedByUserId: userId, feature: { layer: { projectId } } },
      })
    }
    const member = await tx.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
    })
    await publish(projectChannel(projectId), { type: "member", action: "role_changed", userId }, tx)
    return member
  })
}

/**
 * Removes a member from a project, releasing every lock and presence row
 * they hold within it (Edge Cases). The Owner cannot be removed this way.
 */
export async function removeMember(projectId: string, userId: string): Promise<void> {
  const existing = await prismaClient.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  if (!existing) {
    throw new NotFoundError(`No membership found for user "${userId}" in this project.`)
  }
  if (existing.role === "Owner") {
    throw new ValidationError("The Owner cannot be removed from their own project.")
  }

  await prismaClient.$transaction(async (tx) => {
    await tx.featureLock.deleteMany({
      where: { lockedByUserId: userId, feature: { layer: { projectId } } },
    })
    await tx.presence.deleteMany({ where: { projectId, userId } })
    await tx.projectMember.delete({ where: { projectId_userId: { projectId, userId } } })
    await publish(projectChannel(projectId), { type: "member", action: "removed", userId }, tx)
  })
}

/**
 * Transfers project ownership (FR-003): updates `Project.ownerId` and both
 * affected `ProjectMember.role` values (the outgoing Owner becomes Editor,
 * the incoming member becomes Owner) inside one transaction.
 */
export async function transferOwnership(
  projectId: string,
  currentOwnerId: string,
  newOwnerUserId: string,
): Promise<void> {
  const newOwnerMembership = await prismaClient.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: newOwnerUserId } },
  })
  if (!newOwnerMembership) {
    throw new NotFoundError(`No membership found for user "${newOwnerUserId}" in this project.`)
  }

  await prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.project.update({ where: { id: projectId }, data: { ownerId: newOwnerUserId } })
    await tx.projectMember.update({
      where: { projectId_userId: { projectId, userId: newOwnerUserId } },
      data: { role: "Owner" },
    })
    await tx.projectMember.update({
      where: { projectId_userId: { projectId, userId: currentOwnerId } },
      data: { role: "Editor" },
    })
    await publish(projectChannel(projectId), { type: "member", action: "ownership_transferred" }, tx)
  })
}

/** Resolves a user's role in a project, or `null` if they are not a member. */
export async function getMemberRole(projectId: string, userId: string): Promise<ProjectRole | null> {
  const membership = await prismaClient.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  return (membership?.role as ProjectRole | undefined) ?? null
}
