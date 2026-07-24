import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/layers/[layerId]/features/route"
import { DELETE, PATCH } from "@/app/api/features/[featureId]/route"
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

describe.skipIf(!dbAvailable)("Feature lifecycle (integration)", () => {
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Feature Integration Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Integration Layer", order: 0 },
    })
    layerId = layer.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("supports create → edit geometry only → edit attributes only → edit style only → delete (FR-013–FR-024)", async () => {
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [10, 10] },
        attributes: [{ key: "name", value: "Original" }],
        style: { color: "#111111" },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { feature: created } = await createResponse.json()

    // Edit geometry only
    const geometryUpdate = await PATCH(
      jsonRequest(`http://localhost/api/features/${created.id}`, "PATCH", {
        geometry: { type: "Point", coordinates: [20, 20] },
      }) as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    const { feature: afterGeometryEdit } = await geometryUpdate.json()
    expect(afterGeometryEdit.geometry.coordinates).toEqual([20, 20])
    expect(afterGeometryEdit.attributes).toEqual(created.attributes)
    expect(afterGeometryEdit.style).toEqual(created.style)

    // Edit attributes only
    const attributesUpdate = await PATCH(
      jsonRequest(`http://localhost/api/features/${created.id}`, "PATCH", {
        attributes: [{ key: "name", value: "Renamed" }],
      }) as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    const { feature: afterAttributesEdit } = await attributesUpdate.json()
    expect(afterAttributesEdit.attributes).toEqual([{ key: "name", value: "Renamed" }])
    expect(afterAttributesEdit.geometry).toEqual(afterGeometryEdit.geometry)
    expect(afterAttributesEdit.style).toEqual(afterGeometryEdit.style)

    // Edit style only
    const styleUpdate = await PATCH(
      jsonRequest(`http://localhost/api/features/${created.id}`, "PATCH", {
        style: { color: "#222222" },
      }) as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    const { feature: afterStyleEdit } = await styleUpdate.json()
    expect(afterStyleEdit.style.color).toBe("#222222")
    expect(afterStyleEdit.geometry).toEqual(afterAttributesEdit.geometry)
    expect(afterStyleEdit.attributes).toEqual(afterAttributesEdit.attributes)

    // Delete — sibling features unaffected
    const sibling = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [30, 30] },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { feature: siblingFeature } = await sibling.json()

    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/features/${created.id}`, "DELETE") as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    expect(deleteResponse.status).toBe(204)

    const listResponse = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { features } = await listResponse.json()
    expect(features.some((f: { id: string }) => f.id === created.id)).toBe(false)
    expect(features.some((f: { id: string }) => f.id === siblingFeature.id)).toBe(true)
  })
})
