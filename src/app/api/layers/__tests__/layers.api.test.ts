import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/layers/route"
import { PATCH as REORDER } from "@/app/api/projects/[projectId]/layers/reorder/route"
import { DELETE, PATCH } from "../[layerId]/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Layers API", () => {
  let projectId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Layers API Test Project" },
    })
    projectId = project.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("creates layers with increasing order and lists them in order", async () => {
    const first = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "POST", {
        name: "Roads",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(first.status).toBe(201)
    const { layer: roads } = await first.json()

    const second = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "POST", {
        name: "Parcels",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layer: parcels } = await second.json()
    expect(parcels.order).toBeGreaterThan(roads.order)

    const listResponse = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layers } = await listResponse.json()
    expect(layers.map((l: { name: string }) => l.name)).toEqual(["Roads", "Parcels"])
  })

  it("rejects a duplicate layer name within the same project with 409", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "POST", {
        name: "Roads",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(409)
  })

  it("reorders layers and returns them consistently on repeated reads", async () => {
    const listResponse = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layers } = await listResponse.json()
    const reversedIds = [...layers].reverse().map((l: { id: string }) => l.id)

    const reorderResponse = await REORDER(
      jsonRequest(
        `http://localhost/api/projects/${projectId}/layers/reorder`,
        "PATCH",
        { orderedLayerIds: reversedIds },
      ) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(reorderResponse.status).toBe(200)

    for (let i = 0; i < 3; i++) {
      const check = await GET(
        jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
        { params: Promise.resolve({ projectId }) },
      )
      const { layers: checkedLayers } = await check.json()
      expect(checkedLayers.map((l: { id: string }) => l.id)).toEqual(reversedIds)
    }
  })

  it("rejects a mismatched reorder list with 400 and changes nothing", async () => {
    const before = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layers: beforeLayers } = await before.json()

    const response = await REORDER(
      jsonRequest(
        `http://localhost/api/projects/${projectId}/layers/reorder`,
        "PATCH",
        { orderedLayerIds: ["not-a-real-id"] },
      ) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)

    const after = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layers: afterLayers } = await after.json()
    expect(afterLayers).toEqual(beforeLayers)
  })

  it("renames a layer without affecting its features, then deletes it", async () => {
    const listResponse = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layers } = await listResponse.json()
    const targetLayerId = layers[0].id

    const renameResponse = await PATCH(
      jsonRequest(`http://localhost/api/layers/${targetLayerId}`, "PATCH", {
        name: "Renamed Layer",
      }) as never,
      { params: Promise.resolve({ layerId: targetLayerId }) },
    )
    expect(renameResponse.status).toBe(200)

    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/layers/${targetLayerId}`, "DELETE") as never,
      { params: Promise.resolve({ layerId: targetLayerId }) },
    )
    expect(deleteResponse.status).toBe(204)

    const stillExists = await prismaClient.layer.findUnique({ where: { id: targetLayerId } })
    expect(stillExists).toBeNull()
  })

  it("cascades layer deletion when the parent project is deleted", async () => {
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Cascade Test Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Doomed Layer", order: 0 },
    })

    await prismaClient.project.delete({ where: { id: project.id } })

    const layerAfter = await prismaClient.layer.findUnique({ where: { id: layer.id } })
    expect(layerAfter).toBeNull()
  })
})
