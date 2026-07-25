import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/measurements/route"
import { measurementService } from "../services/measurementService"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/**
 * T165 — full Measurement flow (spec.md US3, quickstart.md §3): a live
 * client-side reading (`measurementService`, Constitution Principle IV's
 * transient carve-out) followed by "Save to History", which the server
 * recomputes independently via PostGIS (research.md Decision 8) — this
 * test asserts the two values agree within a small, expected floating-
 * point/projection tolerance, never exactly bit-for-bit (that would
 * indicate the server is trusting the client's number, the one thing
 * Decision 8 forbids).
 */
describe.skipIf(!dbAvailable)("Measurement integration (US3)", () => {
  let projectId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Measurement Integration Test ${Date.now()}` },
    })
    projectId = project.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("distance: the live client reading and the saved server-recomputed value agree within tolerance", async () => {
    const line = { type: "LineString" as const, coordinates: [[0, 0], [1, 0]] as [number, number][] }
    const liveReading = measurementService.measure("distance", [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }])

    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "POST", {
        measurementType: "distance",
        geometry: line,
        label: "Integration test line",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(201)
    const { measurement } = await response.json()

    expect(liveReading.value).not.toBeNull()
    // Both use great-circle math over the same geometry, so they should be
    // very close — but never asserted as an exact match (Decision 8).
    const relativeDifference = Math.abs(measurement.value - (liveReading.value ?? 0)) / measurement.value
    expect(relativeDifference).toBeLessThan(0.01)
  })

  it("area: saved measurement appears in the project's measurement history", async () => {
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0], [0, 0]] as [number, number][]],
    }

    const saveResponse = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "POST", {
        measurementType: "area",
        geometry: polygon,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(saveResponse.status).toBe(201)
    const { measurement } = await saveResponse.json()
    expect(measurement.unit).toBe("squareMeters")
    expect(measurement.value).toBeGreaterThan(0)

    const listResponse = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { measurements } = await listResponse.json()
    expect(measurements.map((m: { id: string }) => m.id)).toContain(measurement.id)
  })

  it("coordinates: has no scalar value, matching data-model.md's rule", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/measurements`, "POST", {
        measurementType: "coordinates",
        geometry: { type: "Point", coordinates: [10, 20] },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { measurement } = await response.json()
    expect(measurement.value).toBeNull()
    expect(measurement.unit).toBeNull()
  })
})
