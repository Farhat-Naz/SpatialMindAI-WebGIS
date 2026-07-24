import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"
import {
  changeMemberRole,
  listMembersForProject,
  removeMember,
  transferOwnership,
} from "../membershipRepository"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("membershipRepository", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Membership Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_OWNER_ID, role: "Owner" },
    })
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })
  })

  it("lists every member of a project", async () => {
    const members = await listMembersForProject(projectId)
    expect(members).toHaveLength(2)
    expect(members.map((m) => m.userId).sort()).toEqual([TEST_COLLABORATOR_ID, TEST_OWNER_ID].sort())
  })

  it("changes a member's role and releases their locks on downgrade to Viewer", async () => {
    const layer = await prismaClient.layer.create({
      data: { projectId, name: "L1", order: 0 },
    })
    const feature = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layer.id}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    await prismaClient.featureLock.create({
      data: {
        featureId: feature[0].id,
        lockedByUserId: TEST_COLLABORATOR_ID,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })

    const updated = await changeMemberRole(projectId, TEST_COLLABORATOR_ID, "Viewer")
    expect(updated.role).toBe("Viewer")

    const lockAfter = await prismaClient.featureLock.findUnique({ where: { featureId: feature[0].id } })
    expect(lockAfter).toBeNull()
  })

  it("removes a member, releasing their locks and presence", async () => {
    await prismaClient.presence.create({ data: { projectId, userId: TEST_COLLABORATOR_ID } })

    await removeMember(projectId, TEST_COLLABORATOR_ID)

    const members = await listMembersForProject(projectId)
    expect(members.map((m) => m.userId)).not.toContain(TEST_COLLABORATOR_ID)
    const presence = await prismaClient.presence.findUnique({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
    })
    expect(presence).toBeNull()
  })

  it("transfers ownership: swaps Project.ownerId and both members' roles", async () => {
    await transferOwnership(projectId, TEST_OWNER_ID, TEST_COLLABORATOR_ID)

    const project = await prismaClient.project.findUnique({ where: { id: projectId } })
    expect(project?.ownerId).toBe(TEST_COLLABORATOR_ID)

    const newOwnerMembership = await prismaClient.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
    })
    expect(newOwnerMembership?.role).toBe("Owner")

    const oldOwnerMembership = await prismaClient.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: TEST_OWNER_ID } },
    })
    expect(oldOwnerMembership?.role).toBe("Editor")
  })
})
