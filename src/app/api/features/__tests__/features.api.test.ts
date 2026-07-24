import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/layers/[layerId]/features/route"
import { DELETE, GET as GET_ONE, PATCH } from "../[featureId]/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const validPolygon = {
  type: "Polygon",
  coordinates: [[[-122.42, 37.77], [-122.41, 37.77], [-122.41, 37.78], [-122.42, 37.78], [-122.42, 37.77]]],
}

const selfIntersectingPolygon = {
  type: "Polygon",
  coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]],
}

describe.skipIf(!dbAvailable)("Features API", () => {
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Features API Test Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Parcels", order: 0 },
    })
    layerId = layer.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("creates a feature with geometry, attributes, and style", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: validPolygon,
        attributes: [{ key: "parcelNumber", value: "A-102" }],
        style: { color: "#2563eb", fillOpacity: 0.4 },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(201)

    const { feature } = await response.json()
    expect(feature.geometry.type).toBe("Polygon")
    expect(feature.attributes).toEqual([{ key: "parcelNumber", value: "A-102" }])
    expect(feature.style.color).toBe("#2563eb")
  })

  it("rejects a structurally invalid geometry (unsupported type) with 400 INVALID_INPUT", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "GeometryCollection", geometries: [] },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })

  it("rejects a topologically invalid (self-intersecting) polygon with 400 INVALID_INPUT", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: selfIntersectingPolygon,
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")

    const countAfter = await prismaClient.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM "Feature" WHERE "layerId" = ${layerId}
    `
    // Only the one valid feature from the prior test should exist — the
    // invalid submission must never be persisted, even transiently.
    expect(Number(countAfter[0].count)).toBe(1)
  })

  it("paginates feature listing with a cursor", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(
        jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
          geometry: { type: "Point", coordinates: [-122.4 + i * 0.001, 37.77] },
        }) as never,
        { params: Promise.resolve({ layerId }) },
      )
    }

    const firstPage = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features?limit=3`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    const firstBody = await firstPage.json()
    expect(firstBody.features).toHaveLength(3)
    expect(firstBody.nextCursor).not.toBeNull()

    const secondPage = await GET(
      jsonRequest(
        `http://localhost/api/layers/${layerId}/features?limit=3&cursor=${firstBody.nextCursor}`,
        "GET",
      ) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const secondBody = await secondPage.json()
    const firstPageIds = new Set(firstBody.features.map((f: { id: string }) => f.id))
    for (const feature of secondBody.features) {
      expect(firstPageIds.has(feature.id)).toBe(false)
    }
  })

  it("filters features by bbox", async () => {
    const response = await GET(
      jsonRequest(
        `http://localhost/api/layers/${layerId}/features?bbox=-180,-90,0,90`,
        "GET",
      ) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    // Everything created in this suite is at negative longitude, so all
    // should be included; a malformed bbox is exercised separately below.
    expect(body.features.length).toBeGreaterThan(0)
  })

  it("rejects a malformed bbox with 400 INVALID_INPUT", async () => {
    const response = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features?bbox=not,a,bbox`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(400)
  })

  it("updates a feature's attributes without changing its geometry or style", async () => {
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [1, 1] },
        style: { color: "#000000" },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { feature: created } = await createResponse.json()

    const updateResponse = await PATCH(
      jsonRequest(`http://localhost/api/features/${created.id}`, "PATCH", {
        attributes: [{ key: "status", value: "reviewed" }],
      }) as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    expect(updateResponse.status).toBe(200)
    const { feature: updated } = await updateResponse.json()

    expect(updated.geometry).toEqual(created.geometry)
    expect(updated.style).toEqual(created.style)
    expect(updated.attributes).toEqual([{ key: "status", value: "reviewed" }])
  })

  it("returns 404 NOT_FOUND for a nonexistent feature", async () => {
    const response = await GET_ONE(
      jsonRequest("http://localhost/api/features/does-not-exist", "GET") as never,
      { params: Promise.resolve({ featureId: "does-not-exist" }) },
    )
    expect(response.status).toBe(404)
  })

  it("deletes a feature and cascades attributes/style", async () => {
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [2, 2] },
        attributes: [{ key: "x", value: "y" }],
        style: { color: "#fff" },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { feature: created } = await createResponse.json()

    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/features/${created.id}`, "DELETE") as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    expect(deleteResponse.status).toBe(204)

    const attributesAfter = await prismaClient.featureAttribute.findMany({
      where: { featureId: created.id },
    })
    const styleAfter = await prismaClient.featureStyle.findUnique({
      where: { featureId: created.id },
    })
    expect(attributesAfter).toHaveLength(0)
    expect(styleAfter).toBeNull()
  })

  it("cascades feature deletion when the parent layer is deleted", async () => {
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Cascade Feature Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Doomed Layer", order: 0 },
    })
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layer.id}/features`, "POST", {
        geometry: { type: "Point", coordinates: [3, 3] },
      }) as never,
      { params: Promise.resolve({ layerId: layer.id }) },
    )
    const { feature } = await createResponse.json()

    await prismaClient.layer.delete({ where: { id: layer.id } })

    const featureAfter = await prismaClient.feature.findUnique({ where: { id: feature.id } })
    expect(featureAfter).toBeNull()

    await prismaClient.project.delete({ where: { id: project.id } })
  })
})
