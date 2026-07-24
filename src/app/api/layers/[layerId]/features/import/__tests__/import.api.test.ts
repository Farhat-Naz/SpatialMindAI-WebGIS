import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET, POST as createFeature } from "@/app/api/layers/[layerId]/features/route"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { POST } from "../route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Bulk import API", () => {
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Import API Test Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Import API Test Layer", order: 0 },
    })
    layerId = layer.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("imports a valid FeatureCollection and appends to any existing features", async () => {
    const preExistingResponse = await createFeature(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [0, 0] },
      } as never) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(preExistingResponse.status).toBe(201)

    const response = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features/import`, "POST", {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [1, 1] },
            properties: { name: "Imported A" },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [2, 2] },
            properties: { name: "Imported B" },
          },
        ],
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.importedCount).toBe(2)

    const listResponse = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { features } = await listResponse.json()
    // The pre-existing feature plus both imported ones — nothing removed.
    expect(features.length).toBeGreaterThanOrEqual(3)
  })

  it("rejects a batch containing an invalid geometry with zero rows written (all-or-nothing)", async () => {
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Import Rejection Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Import Rejection Layer", order: 0 },
    })

    const response = await POST(
      jsonRequest(`http://localhost/api/layers/${layer.id}/features/import`, "POST", {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: {} },
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] },
            properties: {},
          },
        ],
      }) as never,
      { params: Promise.resolve({ layerId: layer.id }) },
    )
    expect(response.status).toBe(400)

    const countAfter = await prismaClient.feature.count({ where: { layerId: layer.id } })
    expect(countAfter).toBe(0)

    await prismaClient.project.delete({ where: { id: project.id } })
  })

  it("returns 404 for a layer owned by a different user", async () => {
    const otherOwnerId = `${TEST_OWNER_ID}-other`
    await prismaClient.user.upsert({
      where: { id: otherOwnerId },
      create: { id: otherOwnerId, email: `${otherOwnerId}@example.test` },
      update: {},
    })
    const otherProject = await prismaClient.project.create({
      data: { ownerId: otherOwnerId, name: "Other Owner Project" },
    })
    const otherLayer = await prismaClient.layer.create({
      data: { projectId: otherProject.id, name: "Other Owner Layer", order: 0 },
    })

    const response = await POST(
      jsonRequest(`http://localhost/api/layers/${otherLayer.id}/features/import`, "POST", {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: {} },
        ],
      }) as never,
      { params: Promise.resolve({ layerId: otherLayer.id }) },
    )
    expect(response.status).toBe(404)

    await prismaClient.project.delete({ where: { id: otherProject.id } })
    await prismaClient.user.delete({ where: { id: otherOwnerId } })
  })

  it("rejects a malformed request body with 400 INVALID_INPUT", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features/import`, "POST", {
        type: "FeatureCollection",
        features: [],
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })
})
