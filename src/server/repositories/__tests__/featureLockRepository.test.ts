import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"
import { acquireOrRefreshLock, getActiveLockForFeature, releaseLock } from "../featureLockRepository"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("featureLockRepository", () => {
  let featureId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Lock Test ${Date.now()}-${Math.random()}` },
    })
    const layer = await prismaClient.layer.create({ data: { projectId: project.id, name: "L1", order: 0 } })
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layer.id}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    featureId = rows[0].id
  })

  it("acquires a lock for an unlocked feature", async () => {
    const lock = await acquireOrRefreshLock(featureId, TEST_OWNER_ID)
    expect(lock.lockedByUserId).toBe(TEST_OWNER_ID)

    const active = await getActiveLockForFeature(featureId)
    expect(active?.lockedByUserId).toBe(TEST_OWNER_ID)
  })

  it("the same holder refreshing their own lock never conflicts with themselves", async () => {
    await acquireOrRefreshLock(featureId, TEST_OWNER_ID)
    const refreshed = await acquireOrRefreshLock(featureId, TEST_OWNER_ID)
    expect(refreshed.lockedByUserId).toBe(TEST_OWNER_ID)
  })

  it("rejects acquisition by a different user while an unexpired lock is held", async () => {
    await acquireOrRefreshLock(featureId, TEST_OWNER_ID)
    await expect(acquireOrRefreshLock(featureId, TEST_COLLABORATOR_ID)).rejects.toThrow()
  })

  it("releases a lock", async () => {
    await acquireOrRefreshLock(featureId, TEST_OWNER_ID)
    await releaseLock(featureId, TEST_OWNER_ID)

    const active = await getActiveLockForFeature(featureId)
    expect(active).toBeNull()
  })

  it("treats an expired lock as released at read time (research.md Decision 3)", async () => {
    await prismaClient.featureLock.create({
      data: {
        featureId,
        lockedByUserId: TEST_OWNER_ID,
        expiresAt: new Date(Date.now() - 1_000),
      },
    })

    const active = await getActiveLockForFeature(featureId)
    expect(active).toBeNull()

    // A different user can now acquire it — the expired row does not block.
    const acquired = await acquireOrRefreshLock(featureId, TEST_COLLABORATOR_ID)
    expect(acquired.lockedByUserId).toBe(TEST_COLLABORATOR_ID)
  })
})
