import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard } from "@/server/repositories/dashboardRepository"
import { createFilter, deleteFilter, listFilters } from "@/server/repositories/dashboardFilterRepository"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("dashboardFilterRepository", () => {
  let projectId: string
  let dashboardId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Filter Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: `Dash ${Date.now()}` })
    dashboardId = dashboard.id
  }, 15000)

  it("createFilter: creates a global (no widgetId) date filter", async () => {
    const filter = await createFilter(dashboardId, TEST_OWNER_ID, {
      filterType: "date",
      config: { from: "2026-01-01T00:00:00.000Z" },
    })
    expect(filter.widgetId).toBeNull()

    const filters = await listFilters(dashboardId, TEST_OWNER_ID)
    expect(filters).toHaveLength(1)
  })

  it("createFilter: rejects a spatial filter with self-intersecting geometry", async () => {
    const bowtie = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [2, 0],
          [0, 2],
          [0, 0],
        ],
      ],
    }
    await expect(
      createFilter(dashboardId, TEST_OWNER_ID, { filterType: "spatial", config: { geometry: bowtie } }),
    ).rejects.toThrow()
  })

  it("createFilter: accepts a valid spatial filter geometry", async () => {
    const square = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    }
    const filter = await createFilter(dashboardId, TEST_OWNER_ID, { filterType: "spatial", config: { geometry: square } })
    expect(filter.filterType).toBe("spatial")
  })

  it("deleteFilter: removes the filter", async () => {
    const filter = await createFilter(dashboardId, TEST_OWNER_ID, { filterType: "date", config: {} })
    await deleteFilter(filter.id, TEST_OWNER_ID)
    expect(await listFilters(dashboardId, TEST_OWNER_ID)).toHaveLength(0)
  })
})
