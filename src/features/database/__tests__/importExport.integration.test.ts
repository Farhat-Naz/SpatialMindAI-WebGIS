import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/layers/[layerId]/features/route"
import { POST as IMPORT } from "@/app/api/layers/[layerId]/features/import/route"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/**
 * Full import -> append-only -> export flow (US7, quickstart.md Section 5)
 * through the same Route Handlers `ImportExportControls`/`exportLayerAsGeoJson`
 * call, against the test database (skip-if-unavailable). Export's pagination
 * aggregation is replicated inline here (paging `GET` with a small limit)
 * since `exportLayerAsGeoJson` itself goes through the browser `fetch` stack,
 * which isn't available to a direct Route-Handler-level test — matching this
 * codebase's existing integration test convention.
 */
describe.skipIf(!dbAvailable)("Import -> export completeness (integration)", () => {
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Import/Export Integration Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Import/Export Integration Layer", order: 0 },
    })
    layerId = layer.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("import is append-only, and export aggregates every page of the result", async () => {
    const preExisting = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [0, 0] },
        attributes: [{ key: "name", value: "Pre-existing" }],
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(preExisting.status).toBe(201)

    const importedFeatures = Array.from({ length: 12 }, (_, i) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [i, i] },
      properties: { name: `Imported ${i}` },
    }))

    const importResponse = await IMPORT(
      jsonRequest(`http://localhost/api/layers/${layerId}/features/import`, "POST", {
        type: "FeatureCollection",
        features: importedFeatures,
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(importResponse.status).toBe(201)
    const { importedCount } = await importResponse.json()
    expect(importedCount).toBe(12)

    const listResponse = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { features: allFeatures } = await listResponse.json()
    // 1 pre-existing + 12 imported = 13, exactly — nothing altered or removed.
    expect(allFeatures).toHaveLength(13)

    // Replicates exportLayerAsGeoJson's pagination-aggregation logic
    // (Research Decision 6) directly against the Route Handler.
    const exportedFeatures: { attributes: { key: string; value: string }[] }[] = []
    let cursor: string | null = null
    do {
      const url = new URL(`http://localhost/api/layers/${layerId}/features`)
      url.searchParams.set("limit", "5")
      if (cursor) url.searchParams.set("cursor", cursor)
      const page = await GET(jsonRequest(url.toString(), "GET") as never, {
        params: Promise.resolve({ layerId }),
      })
      const body = await page.json()
      exportedFeatures.push(...body.features)
      cursor = body.nextCursor
    } while (cursor)

    expect(exportedFeatures).toHaveLength(13)
    const names = exportedFeatures.map(
      (feature) => feature.attributes.find((a) => a.key === "name")?.value,
    )
    expect(names).toContain("Pre-existing")
    expect(names.filter((name) => name?.startsWith("Imported"))).toHaveLength(12)
  })
})
