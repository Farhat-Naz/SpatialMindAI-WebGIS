import { Prisma, type Layer } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { getProjectById } from "@/server/repositories/projectRepository"
import { projectChannel, publish } from "@/server/realtime/channel"
import { DuplicateNameError, NotFoundError, ValidationError } from "@/shared/errors/apiError"

/**
 * Returns a layer only if `ownerId` owns its project OR has an active
 * `ProjectMember` row on it (specs/006-collaboration, research.md
 * Decision 10 — identical broadening to `projectRepository.getProjectById`,
 * applied through the layer's parent project).
 */
async function getLayerScopedToOwner(layerId: string, ownerId: string): Promise<Layer | null> {
  return prismaClient.layer.findFirst({
    where: {
      id: layerId,
      project: { OR: [{ ownerId }, { members: { some: { userId: ownerId } } }] },
    },
  })
}

/** Lists a project's layers ordered by `order` ascending. */
export async function listLayersForProject(
  projectId: string,
  ownerId: string,
): Promise<Layer[]> {
  const project = await getProjectById(projectId, ownerId)
  if (!project) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }
  return prismaClient.layer.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  })
}

/**
 * Creates a layer, assigning the next `order` value within its project.
 * specs/006-collaboration: publishes a `layer` realtime event inside the
 * same transaction as the insert (research.md Decision 2).
 */
export async function createLayer(
  projectId: string,
  ownerId: string,
  name: string,
): Promise<Layer> {
  const project = await getProjectById(projectId, ownerId)
  if (!project) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }

  const maxOrder = await prismaClient.layer.aggregate({
    where: { projectId },
    _max: { order: true },
  })
  const nextOrder = (maxOrder._max.order ?? -1) + 1

  try {
    return await prismaClient.$transaction(async (tx) => {
      const layer = await tx.layer.create({
        data: { projectId, name, order: nextOrder },
      })
      await publish(projectChannel(projectId), { type: "layer", action: "create", layerId: layer.id }, tx)
      return layer
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateNameError(`A layer named "${name}" already exists in this project.`)
    }
    throw error
  }
}

/** Renames a layer without affecting its features. Publishes a `layer` realtime event on success. */
export async function renameLayer(
  layerId: string,
  ownerId: string,
  name: string,
): Promise<Layer> {
  const existing = await getLayerScopedToOwner(layerId, ownerId)
  if (!existing) {
    throw new NotFoundError(`No layer found with id "${layerId}".`)
  }

  try {
    return await prismaClient.$transaction(async (tx) => {
      const layer = await tx.layer.update({ where: { id: layerId }, data: { name } })
      await publish(
        projectChannel(existing.projectId),
        { type: "layer", action: "rename", layerId },
        tx,
      )
      return layer
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateNameError(`A layer named "${name}" already exists in this project.`)
    }
    throw error
  }
}

/**
 * Rewrites every layer's `order` in one transaction. `orderedLayerIds` MUST
 * be exactly the project's current layer id set (Research Decision 8) — a
 * partial or mismatched list is rejected before anything is written.
 * Publishes one `layer` realtime event for the reorder on success.
 */
export async function reorderLayers(
  projectId: string,
  ownerId: string,
  orderedLayerIds: string[],
): Promise<Layer[]> {
  const project = await getProjectById(projectId, ownerId)
  if (!project) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }

  const currentLayers = await prismaClient.layer.findMany({ where: { projectId } })
  const currentIds = new Set(currentLayers.map((layer) => layer.id))
  const requestedIds = new Set(orderedLayerIds)

  const isExactMatch =
    currentIds.size === requestedIds.size &&
    [...currentIds].every((id) => requestedIds.has(id))

  if (!isExactMatch) {
    throw new ValidationError(
      "orderedLayerIds must be exactly the set of the project's current layer ids.",
    )
  }

  await prismaClient.$transaction(async (tx) => {
    for (const [index, id] of orderedLayerIds.entries()) {
      await tx.layer.update({ where: { id }, data: { order: index } })
    }
    await publish(projectChannel(projectId), { type: "layer", action: "reorder" }, tx)
  })

  return prismaClient.layer.findMany({ where: { projectId }, orderBy: { order: "asc" } })
}

/** Deletes a layer; cascades to every feature/attribute/style beneath it. Publishes a `layer` realtime event. */
export async function deleteLayer(layerId: string, ownerId: string): Promise<void> {
  const existing = await getLayerScopedToOwner(layerId, ownerId)
  if (!existing) {
    throw new NotFoundError(`No layer found with id "${layerId}".`)
  }

  await prismaClient.$transaction(async (tx) => {
    await tx.layer.delete({ where: { id: layerId } })
    await publish(
      projectChannel(existing.projectId),
      { type: "layer", action: "delete", layerId },
      tx,
    )
  })
}
