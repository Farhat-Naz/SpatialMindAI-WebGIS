import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { buildChunkPageSql, toMeters, toSquareMeters } from "@/server/repositories/analysisOperations"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe("analysisOperations: unit conversion helpers", () => {
  it("toMeters converts every supported distance unit", () => {
    expect(toMeters(1, "meters")).toBe(1)
    expect(toMeters(1, "kilometers")).toBe(1000)
    expect(toMeters(1, "feet")).toBeCloseTo(0.3048)
    expect(toMeters(1, "miles")).toBeCloseTo(1609.344)
  })

  it("toSquareMeters converts every supported area unit", () => {
    expect(toSquareMeters(1, "squareMeters")).toBe(1)
    expect(toSquareMeters(1, "squareKilometers")).toBe(1_000_000)
    expect(toSquareMeters(1, "squareFeet")).toBeCloseTo(0.09290304)
    expect(toSquareMeters(1, "squareMiles")).toBeCloseTo(2_589_988.110336)
  })
})

/**
 * T011's coverage property: given a layer with N features and a chunk page
 * size P, calling `buildChunkPageSql` ⌈N/P⌉ times — each time seeded with
 * the previous page's last id — visits every feature exactly once.
 */
describe.skipIf(!dbAvailable)("buildChunkPageSql: coverage property", () => {
  let layerId: string
  const FEATURE_COUNT = 23

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Chunking Test ${Date.now()}-${Math.random()}` },
    })
    const layer = await prismaClient.layer.create({ data: { projectId: project.id, name: "L1", order: 0 } })
    layerId = layer.id

    for (let i = 0; i < FEATURE_COUNT; i++) {
      await prismaClient.$executeRaw`
        INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      `
    }
  })

  it("visits every feature exactly once across pages, regardless of page size vs. feature count", async () => {
    const pageSize = 7
    const seenIds = new Set<string>()
    let afterId: string | null = null
    let hasMore = true

    while (hasMore) {
      const page: { id: string }[] = await prismaClient.$queryRaw(buildChunkPageSql(layerId, afterId, pageSize))
      for (const row of page) {
        expect(seenIds.has(row.id)).toBe(false)
        seenIds.add(row.id)
      }
      hasMore = page.length === pageSize
      if (hasMore) {
        afterId = page[page.length - 1].id
      }
    }

    expect(seenIds.size).toBe(FEATURE_COUNT)
  })

  it("returns an empty page immediately for a layer with no features", async () => {
    const emptyLayer = await prismaClient.layer.create({
      data: { projectId: (await prismaClient.layer.findUniqueOrThrow({ where: { id: layerId } })).projectId, name: "Empty", order: 1 },
    })
    const page = await prismaClient.$queryRaw<{ id: string }[]>(buildChunkPageSql(emptyLayer.id, null, 7))
    expect(page).toHaveLength(0)
  })
})
