import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createPreset, deletePreset, listPresetsForProject } from "@/server/repositories/analysisPresetRepository"
import { TEST_COLLABORATOR_ID, TEST_OWNER_ID, ensureTestCollaborator, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("analysisPresetRepository", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Preset Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" } })
  }, 15000)

  it("createPreset: succeeds for an Editor and is visible to every project member", async () => {
    await createPreset(projectId, TEST_COLLABORATOR_ID, {
      name: "500m Buffer",
      operationType: "buffer",
      parameters: { distance: 500, unit: "meters" },
    })

    const asOwner = await listPresetsForProject(projectId, TEST_OWNER_ID)
    expect(asOwner).toHaveLength(1)
    expect(asOwner[0].name).toBe("500m Buffer")
  })

  it("createPreset: throws DuplicateNameError on a (projectId, name) collision", async () => {
    await createPreset(projectId, TEST_OWNER_ID, { name: "Dup", operationType: "buffer", parameters: {} })
    await expect(createPreset(projectId, TEST_OWNER_ID, { name: "Dup", operationType: "buffer", parameters: {} })).rejects.toThrow()
  })

  it("deletePreset: the creator may delete their own preset", async () => {
    const preset = await createPreset(projectId, TEST_COLLABORATOR_ID, { name: "Mine", operationType: "buffer", parameters: {} })
    await deletePreset(preset.id, TEST_COLLABORATOR_ID)
    expect(await listPresetsForProject(projectId, TEST_OWNER_ID)).toHaveLength(0)
  })

  it("deletePreset: the project Owner may delete someone else's preset", async () => {
    const preset = await createPreset(projectId, TEST_COLLABORATOR_ID, { name: "Theirs", operationType: "buffer", parameters: {} })
    await deletePreset(preset.id, TEST_OWNER_ID)
    expect(await listPresetsForProject(projectId, TEST_OWNER_ID)).toHaveLength(0)
  })

  it("deletePreset: a non-creator, non-Owner member is forbidden", async () => {
    const preset = await createPreset(projectId, TEST_OWNER_ID, { name: "OwnerOnly", operationType: "buffer", parameters: {} })
    await expect(deletePreset(preset.id, TEST_COLLABORATOR_ID)).rejects.toThrow()
  })
})
