import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { getSnapshot } from "@/server/repositories/dashboardAnalyticsRepository"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("dashboardAnalyticsRepository — getSnapshot", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Analytics Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    layerId = layer.id
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (${"feat-" + Date.now()}, ${layerId}, ST_SetSRID(ST_MakePoint(1, 1), 4326), NOW(), NOW())
    `
  }, 15000)

  it("computes fresh on first read, then serves cached within the TTL", async () => {
    const first = await getSnapshot(projectId, "layerStats", layerId)
    expect(first.isCached).toBe(false)

    const second = await getSnapshot(projectId, "layerStats", layerId)
    expect(second.isCached).toBe(true)
    expect(second.computedAt).toBe(first.computedAt)
  })

  it("systemStats counts dashboards for the project without new heavy SQL", async () => {
    await prismaClient.dashboard.create({ data: { projectId, ownerId: TEST_OWNER_ID, name: "D1" } })
    const snapshot = await getSnapshot(projectId, "systemStats")
    expect(snapshot.data).toMatchObject({ dashboardCount: 1 })
  })

  it("projectStats breaks down feature counts by layer, delegating to 007's statistics builder", async () => {
    const snapshot = await getSnapshot(projectId, "projectStats")
    expect(snapshot.data).toMatchObject({ layerCount: 1, totalFeatures: 1 })
  })
})
