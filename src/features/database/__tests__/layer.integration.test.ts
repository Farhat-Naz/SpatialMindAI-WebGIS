import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/projects/[projectId]/layers/route"
import { PATCH as REORDER } from "@/app/api/projects/[projectId]/layers/reorder/route"
import { DELETE, PATCH } from "@/app/api/layers/[layerId]/route"
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

describe.skipIf(!dbAvailable)("Layer lifecycle (integration)", () => {
  let projectId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Layer Integration Project" },
    })
    projectId = project.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("supports create-two → reorder → rename → delete-one (FR-007–FR-012, SC-008)", async () => {
    const roadsResponse = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "POST", {
        name: "Roads",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layer: roads } = await roadsResponse.json()

    const parcelsResponse = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "POST", {
        name: "Parcels",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layer: parcels } = await parcelsResponse.json()

    // Reorder: Parcels before Roads
    await REORDER(
      jsonRequest(
        `http://localhost/api/projects/${projectId}/layers/reorder`,
        "PATCH",
        { orderedLayerIds: [parcels.id, roads.id] },
      ) as never,
      { params: Promise.resolve({ projectId }) },
    )

    // SC-008: ten consecutive reads all return the same, new order
    for (let i = 0; i < 10; i++) {
      const response = await GET(
        jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
        { params: Promise.resolve({ projectId }) },
      )
      const { layers } = await response.json()
      expect(layers.map((l: { id: string }) => l.id)).toEqual([parcels.id, roads.id])
    }

    // Rename Roads
    await PATCH(
      jsonRequest(`http://localhost/api/layers/${roads.id}`, "PATCH", {
        name: "Renamed Roads",
      }) as never,
      { params: Promise.resolve({ layerId: roads.id }) },
    )

    // Delete Parcels; Roads (renamed) must remain, unaffected
    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/layers/${parcels.id}`, "DELETE") as never,
      { params: Promise.resolve({ layerId: parcels.id }) },
    )
    expect(deleteResponse.status).toBe(204)

    const finalListResponse = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/layers`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { layers: finalLayers } = await finalListResponse.json()
    expect(finalLayers).toHaveLength(1)
    expect(finalLayers[0].name).toBe("Renamed Roads")
  })
})
