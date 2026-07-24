import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { getProjectById } from "@/server/repositories/projectRepository"
import { listLayersForProject } from "@/server/repositories/layerRepository"
import { getFeatureById } from "@/server/repositories/featureRepository"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

/**
 * specs/006-collaboration research.md Decision 10 broadened
 * `getProjectById`/`getLayerScopedToOwner`/`getFeatureScopedToOwner` to
 * also recognize an active `ProjectMember` row, not just `Project.ownerId`.
 * This file re-verifies both halves of that change: the pre-existing
 * owner-only / non-member-404 behavior is unchanged, AND a genuine member
 * can now access what they couldn't before.
 */
describe.skipIf(!dbAvailable)("ownership broadening regression (specs/006-collaboration)", () => {
  let projectId: string
  let layerId: string
  let featureId: string
  const strangerId = "test-stranger-1"

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    await prismaClient.user.upsert({
      where: { id: strangerId },
      update: {},
      create: { id: strangerId, email: `${strangerId}@dev.local` },
    })

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Ownership Regression ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    layerId = layer.id
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    featureId = rows[0].id
  })

  it("unchanged: the owner can still resolve their own project/layer/feature", async () => {
    expect(await getProjectById(projectId, TEST_OWNER_ID)).not.toBeNull()
    expect(await listLayersForProject(projectId, TEST_OWNER_ID)).toHaveLength(1)
    expect(await getFeatureById(featureId, TEST_OWNER_ID)).not.toBeNull()
  })

  it("unchanged: a true non-member/non-owner still cannot resolve project/layer/feature", async () => {
    expect(await getProjectById(projectId, strangerId)).toBeNull()
    await expect(listLayersForProject(projectId, strangerId)).rejects.toThrow()
    expect(await getFeatureById(featureId, strangerId)).toBeNull()
  })

  it("new: an invited member (no ownership) can now resolve project/layer/feature", async () => {
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })

    expect(await getProjectById(projectId, TEST_COLLABORATOR_ID)).not.toBeNull()
    expect(await listLayersForProject(projectId, TEST_COLLABORATOR_ID)).toHaveLength(1)
    expect(await getFeatureById(featureId, TEST_COLLABORATOR_ID)).not.toBeNull()
  })

  it("new: removing membership revokes access again", async () => {
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" },
    })
    expect(await getProjectById(projectId, TEST_COLLABORATOR_ID)).not.toBeNull()

    await prismaClient.projectMember.delete({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
    })
    expect(await getProjectById(projectId, TEST_COLLABORATOR_ID)).toBeNull()
  })
})
