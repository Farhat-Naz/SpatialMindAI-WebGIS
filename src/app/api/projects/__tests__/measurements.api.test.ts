import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/measurements/route"
import { DELETE } from "@/app/api/measurements/[measurementId]/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Measurements API", () => {
  let projectId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Measurements API Test ${Date.now()}` },
    })
    projectId = project.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST/GET: saves a measurement with a server-recomputed value, and lists it", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "POST", {
        measurementType: "distance",
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
        label: "Test line",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(created.status).toBe(201)
    const { measurement } = await created.json()
    expect(measurement.unit).toBe("meters")
    expect(measurement.value).toBeGreaterThan(111000)

    const listed = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { measurements } = await listed.json()
    expect(measurements.map((m: { id: string }) => m.id)).toContain(measurement.id)
  })

  it("POST: 400 INVALID_INPUT for a structurally invalid geometry", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "POST", {
        measurementType: "coordinates",
        geometry: { type: "Point", coordinates: [200, 20] },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })

  it("DELETE: removes a measurement", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "POST", {
        measurementType: "coordinates",
        geometry: { type: "Point", coordinates: [5, 5] },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { measurement } = await created.json()

    const deleted = await DELETE(
      jsonRequest(`http://localhost/api/measurements/${measurement.id}`, "DELETE") as never,
      { params: Promise.resolve({ measurementId: measurement.id }) },
    )
    expect(deleted.status).toBe(204)
  })
})
