import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"
import { listActivePresenceForProject, upsertPresence } from "../presenceRepository"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("presenceRepository", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Presence Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
  })

  it("upserts a presence heartbeat", async () => {
    const presence = await upsertPresence(projectId, TEST_OWNER_ID, { cursorLng: 1, cursorLat: 2 })
    expect(presence.cursorLng).toBe(1)
    expect(presence.cursorLat).toBe(2)

    const refreshed = await upsertPresence(projectId, TEST_OWNER_ID, { cursorLng: 3, cursorLat: 4 })
    expect(refreshed.cursorLng).toBe(3)

    const rowCount = await prismaClient.presence.count({ where: { projectId, userId: TEST_OWNER_ID } })
    expect(rowCount).toBe(1)
  })

  it("excludes and opportunistically deletes stale presence rows from the active list", async () => {
    await upsertPresence(projectId, TEST_OWNER_ID, {})
    await prismaClient.presence.create({
      data: {
        projectId,
        userId: TEST_COLLABORATOR_ID,
        lastSeenAt: new Date(Date.now() - 60_000),
      },
    })

    const active = await listActivePresenceForProject(projectId)
    expect(active.map((p) => p.userId)).toEqual([TEST_OWNER_ID])

    const staleRowStillExists = await prismaClient.presence.findUnique({
      where: { projectId_userId: { projectId, userId: TEST_COLLABORATOR_ID } },
    })
    expect(staleRowStillExists).toBeNull()
  })
})
