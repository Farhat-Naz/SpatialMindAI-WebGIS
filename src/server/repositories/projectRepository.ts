import { Prisma, type Project } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { DuplicateNameError, NotFoundError } from "@/shared/errors/apiError"

/** Lists a user's own projects, most recently created first. */
export async function listProjectsForOwner(ownerId: string): Promise<Project[]> {
  return prismaClient.project.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  })
}

/** Creates a project; throws DuplicateNameError if the owner already has one with this name. */
export async function createProject(
  ownerId: string,
  name: string,
  description?: string,
): Promise<Project> {
  try {
    return await prismaClient.project.create({
      data: { ownerId, name, description },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateNameError(`A project named "${name}" already exists.`)
    }
    throw error
  }
}

/**
 * Returns the project only if `ownerId` owns it OR has an active
 * `ProjectMember` row on it (specs/006-collaboration, research.md Decision
 * 10 — a necessary, narrowly-scoped broadening: without it, an invited
 * Editor/Viewer could never access a shared project through this or any
 * function that calls it). The parameter is still named `ownerId` — kept
 * deliberately, not renamed to something like `actingUserId`, to avoid an
 * unrelated, large-blast-radius rename across every call site for
 * cosmetics alone (documented, intentional). `null` for both "doesn't
 * exist" and "exists but the caller has no access," indistinguishably
 * (see `NotFoundError`'s doc comment) — unchanged for a true non-member.
 */
export async function getProjectById(
  projectId: string,
  ownerId: string,
): Promise<Project | null> {
  return prismaClient.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId }, { members: { some: { userId: ownerId } } }],
    },
  })
}

/** Updates name/description; refreshes updatedAt only. Throws NotFoundError/DuplicateNameError. */
export async function updateProject(
  projectId: string,
  ownerId: string,
  data: { name?: string; description?: string },
): Promise<Project> {
  const existing = await getProjectById(projectId, ownerId)
  if (!existing) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }

  try {
    return await prismaClient.project.update({
      where: { id: projectId },
      data,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateNameError(`A project named "${data.name}" already exists.`)
    }
    throw error
  }
}

/** Deletes a project; cascades to every layer/feature/attribute/style beneath it. */
export async function deleteProject(projectId: string, ownerId: string): Promise<void> {
  const existing = await getProjectById(projectId, ownerId)
  if (!existing) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }
  await prismaClient.project.delete({ where: { id: projectId } })
}
