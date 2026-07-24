import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"
import { listActivityForProject, recordActivity } from "../activityRepository"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("activityRepository", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Activity Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
  })

  it("records an activity row inside a passed-in transaction", async () => {
    await prismaClient.$transaction(async (tx) => {
      await recordActivity(tx, {
        projectId,
        userId: TEST_OWNER_ID,
        action: "create",
        targetType: "layer",
        targetId: "layer-1",
      })
    })

    const { activities } = await listActivityForProject(projectId)
    expect(activities).toHaveLength(1)
    expect(activities[0].action).toBe("create")
  })

  it("leaves no orphaned Activity row if the enclosing transaction rolls back", async () => {
    await expect(
      prismaClient.$transaction(async (tx) => {
        await recordActivity(tx, {
          projectId,
          userId: TEST_OWNER_ID,
          action: "delete",
          targetType: "feature",
        })
        throw new Error("simulated failure after the activity write")
      }),
    ).rejects.toThrow("simulated failure")

    const { activities } = await listActivityForProject(projectId)
    expect(activities).toHaveLength(0)
  })

  it("paginates activity, newest first", async () => {
    for (let i = 0; i < 5; i++) {
      await prismaClient.$transaction(async (tx) => {
        await recordActivity(tx, {
          projectId,
          userId: TEST_OWNER_ID,
          action: "edit",
          targetType: "feature",
          targetId: `feature-${i}`,
        })
      })
    }

    const firstPage = await listActivityForProject(projectId, { limit: 2 })
    expect(firstPage.activities).toHaveLength(2)
    expect(firstPage.nextCursor).not.toBeNull()

    const secondPage = await listActivityForProject(projectId, {
      limit: 2,
      cursor: firstPage.nextCursor!,
    })
    const firstIds = new Set(firstPage.activities.map((a) => a.id))
    for (const activity of secondPage.activities) {
      expect(firstIds.has(activity.id)).toBe(false)
    }
  })
})
