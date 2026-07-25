import { Prisma, type AnalysisPreset } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { DuplicateNameError, NotFoundError } from "@/shared/errors/apiError"

export interface AnalysisPresetRecord {
  id: string
  projectId: string
  userId: string
  name: string
  operationType: string
  parameters: unknown
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: AnalysisPreset): AnalysisPresetRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    name: row.name,
    operationType: row.operationType,
    parameters: row.parameters,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Lists every preset in a project — visible to any project member (Viewer+), matching the spec's "quick-start option" for the whole team (US8/FR-021). */
export async function listPresetsForProject(projectId: string, userId: string): Promise<AnalysisPresetRecord[]> {
  await assertProjectRole(projectId, userId, "Viewer")
  const rows = await prismaClient.analysisPreset.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  })
  return rows.map(toRecord)
}

/** Creates a preset (Editor+, US8/FR-021) — throws `DuplicateNameError` on a `(projectId, name)` collision, mirroring `layerRepository.createLayer`'s exact pattern. */
export async function createPreset(
  projectId: string,
  userId: string,
  input: { name: string; operationType: string; parameters: unknown },
): Promise<AnalysisPresetRecord> {
  await assertProjectRole(projectId, userId, "Editor")

  try {
    const row = await prismaClient.analysisPreset.create({
      data: {
        projectId,
        userId,
        name: input.name,
        operationType: input.operationType,
        parameters: input.parameters as Prisma.InputJsonValue,
      },
    })
    return toRecord(row)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateNameError(`A preset named "${input.name}" already exists in this project.`)
    }
    throw error
  }
}

/** Deletes a preset — creator or project Owner only (US8/FR-021). Runs launched from it keep their history (`AnalysisRun.presetId` is set-null, an existing schema rule). */
export async function deletePreset(presetId: string, userId: string): Promise<void> {
  const existing = await prismaClient.analysisPreset.findUnique({ where: { id: presetId } })
  if (!existing) {
    throw new NotFoundError(`No preset found with id "${presetId}".`)
  }

  if (existing.userId !== userId) {
    await assertProjectRole(existing.projectId, userId, "Owner")
  } else {
    await assertProjectRole(existing.projectId, userId, "Viewer")
  }

  await prismaClient.analysisPreset.delete({ where: { id: presetId } })
}
