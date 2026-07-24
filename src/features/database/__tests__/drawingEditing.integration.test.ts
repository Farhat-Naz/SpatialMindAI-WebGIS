import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/layers/[layerId]/features/route"
import { DELETE, GET as GET_FEATURE, PATCH } from "@/app/api/features/[featureId]/route"
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
 * Exercises the full draw -> edit -> delete data flow this phase's UI
 * drives (DrawingToolbar / FeatureLayer), through the same Route Handlers
 * those components call — Geoman's own drawing gesture cannot be
 * meaningfully simulated without a real browser, so this test validates
 * the underlying persisted-data flow directly (manual/quickstart
 * verification covers the actual drawing interaction).
 */
describe.skipIf(!dbAvailable)("Drawing & editing lifecycle (integration)", () => {
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Drawing Integration Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Drawing Integration Layer", order: 0 },
    })
    layerId = layer.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("draws (creates), edits geometry, and deletes a feature", async () => {
    // Draw: equivalent to DrawingToolbar's pm:create -> useCreateFeature
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [10, 20] },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(createResponse.status).toBe(201)
    const { feature: created } = await createResponse.json()

    // Edit geometry: equivalent to FeatureLayerItem's pm:edit -> useUpdateFeature
    const editResponse = await PATCH(
      jsonRequest(`http://localhost/api/features/${created.id}`, "PATCH", {
        geometry: { type: "Point", coordinates: [15, 25] },
      }) as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    expect(editResponse.status).toBe(200)
    const { feature: edited } = await editResponse.json()
    expect(edited.geometry.coordinates).toEqual([15, 25])

    // Delete: equivalent to DrawingToolbar's handleDelete -> useDeleteFeature
    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/features/${created.id}`, "DELETE") as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    expect(deleteResponse.status).toBe(204)

    const afterDelete = await GET_FEATURE(
      jsonRequest(`http://localhost/api/features/${created.id}`, "GET") as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )
    expect(afterDelete.status).toBe(404)
  })

  it("undo-of-delete recreates a feature with its prior geometry/attributes/style", async () => {
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: { type: "Point", coordinates: [1, 1] },
        attributes: [{ key: "name", value: "Undo Me" }],
        style: { color: "#123456" },
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { feature: created } = await createResponse.json()

    await DELETE(
      jsonRequest(`http://localhost/api/features/${created.id}`, "DELETE") as never,
      { params: Promise.resolve({ featureId: created.id }) },
    )

    // Undo replays the captured snapshot via the create endpoint
    // (useUndoLastEdit's "delete" case) — simulated here directly.
    const undoResponse = await POST(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "POST", {
        geometry: created.geometry,
        attributes: created.attributes,
        style: created.style,
      }) as never,
      { params: Promise.resolve({ layerId }) },
    )
    expect(undoResponse.status).toBe(201)
    const { feature: restored } = await undoResponse.json()
    expect(restored.geometry).toEqual(created.geometry)
    expect(restored.attributes).toEqual(created.attributes)
    expect(restored.style).toEqual(created.style)

    const listResponse = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    const { features } = await listResponse.json()
    expect(features.some((f: { id: string }) => f.id === restored.id)).toBe(true)
  })
})
