import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/analysis/route"
import { GET as GET_RUN } from "@/app/api/analysis/[runId]/route"
import { POST as CANCEL } from "@/app/api/analysis/[runId]/cancel/route"
import { POST as DISCARD_RESULT } from "@/app/api/analysis/[runId]/discard-result/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Analysis API", () => {
  let projectId: string
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Analysis API Test ${Date.now()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L", order: 0 } })
    layerId = layer.id
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
    `
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST .../analysis: returns 202 with the run's current status", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: [layerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(202)
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    expect(run.resultData).toEqual({ featureCount: 1 })
  })

  it("POST .../analysis: 400 INVALID_INPUT for a malformed body", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", { operationType: "not-a-real-op" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })

  it("POST .../analysis: 404 for a non-existent input layer", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: ["nonexistent-layer-id"],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(404)
  })

  it("GET .../analysis: status filter returns only matching runs", async () => {
    const response = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis?status=queued,running`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(200)
    const { runs } = await response.json()
    expect(runs).toEqual([])
  })

  it("GET /api/analysis/:runId: polling target returns the widened run shape", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: [layerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await created.json()

    const response = await GET_RUN(jsonRequest(`http://localhost/api/analysis/${run.id}`, "GET") as never, {
      params: Promise.resolve({ runId: run.id }),
    })
    expect(response.status).toBe(200)
    const { run: fetched } = await response.json()
    expect(fetched.id).toBe(run.id)
    expect(fetched).toHaveProperty("progress")
    expect(fetched).toHaveProperty("userId")
  })

  it("POST /api/analysis/:runId/cancel: no-op success on an already-terminal run", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: [layerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await created.json()

    const response = await CANCEL(jsonRequest(`http://localhost/api/analysis/${run.id}/cancel`, "POST") as never, {
      params: Promise.resolve({ runId: run.id }),
    })
    expect(response.status).toBe(200)
    const { run: cancelled } = await response.json()
    expect(cancelled.status).toBe("succeeded")
  })

  it("POST /api/analysis/:runId/discard-result: clears resultLayerId, 400 if none exists", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "buffer",
        inputLayerIds: [layerId],
        parameters: { distance: 50, unit: "meters" },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await created.json()
    expect(run.resultLayerId).not.toBeNull()

    const response = await DISCARD_RESULT(
      jsonRequest(`http://localhost/api/analysis/${run.id}/discard-result`, "POST") as never,
      { params: Promise.resolve({ runId: run.id }) },
    )
    expect(response.status).toBe(200)
    const { run: discarded } = await response.json()
    expect(discarded.resultLayerId).toBeNull()

    const second = await DISCARD_RESULT(
      jsonRequest(`http://localhost/api/analysis/${run.id}/discard-result`, "POST") as never,
      { params: Promise.resolve({ runId: run.id }) },
    )
    expect(second.status).toBe(400)
  })
})

/**
 * T134 — Buffer through the background-execution path (research.md
 * Decision 5): an input past `BACKGROUND_EXECUTION_THRESHOLD` (500
 * features) is chunked over multiple pages (T011's chunk size for the
 * "buffer" category is also 500), so this layer's size guarantees at least
 * two chunk iterations for both the non-dissolve and dissolve paths —
 * exercising T039's chunk-safe dissolve behavior (SC-002) rather than just
 * the fast, single-chunk path already covered above.
 */
describe.skipIf(!dbAvailable)("Analysis API — Buffer background path (large input)", () => {
  let projectId: string
  let largeLayerId: string
  const FEATURE_COUNT = 750

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Buffer Background Path Test ${Date.now()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Large", order: 0 } })
    largeLayerId = layer.id
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT gen_random_uuid(), ${largeLayerId},
        ST_SetSRID(ST_MakePoint((n % 100)::float8 * 0.001, (n / 100)::float8 * 0.001), 4326),
        NOW(), NOW()
      FROM generate_series(1, ${FEATURE_COUNT}) AS n
    `
  }, 30000)

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it(
    "non-dissolve: eventually produces one buffer feature per input feature via the chunked path",
    async () => {
      const response = await POST(
        jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
          operationType: "buffer",
          inputLayerIds: [largeLayerId],
          parameters: { distance: 10, unit: "meters" },
        }) as never,
        { params: Promise.resolve({ projectId }) },
      )
      expect(response.status).toBe(202)
      const { run } = await response.json()
      expect(["queued", "running", "succeeded"]).toContain(run.status)

      const finalRun = await pollUntilTerminal(run.id)
      expect(finalRun.status).toBe("succeeded")
      const count = await prismaClient.feature.count({ where: { layerId: finalRun.resultLayerId } })
      expect(count).toBe(FEATURE_COUNT)
    },
    30000,
  )

  it(
    "dissolve: still produces exactly one merged feature across multiple chunks (chunk-safety, plan.md Risks)",
    async () => {
      const response = await POST(
        jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
          operationType: "buffer",
          inputLayerIds: [largeLayerId],
          parameters: { distance: 10, unit: "meters", dissolve: true },
        }) as never,
        { params: Promise.resolve({ projectId }) },
      )
      const { run } = await response.json()

      const finalRun = await pollUntilTerminal(run.id)
      expect(finalRun.status).toBe("succeeded")
      const count = await prismaClient.feature.count({ where: { layerId: finalRun.resultLayerId } })
      expect(count).toBe(1)
    },
    30000,
  )

  async function pollUntilTerminal(runId: string): Promise<{ status: string; resultLayerId: string }> {
    const deadline = Date.now() + 20000
    for (;;) {
      const response = await GET_RUN(jsonRequest(`http://localhost/api/analysis/${runId}`, "GET") as never, {
        params: Promise.resolve({ runId }),
      })
      const { run } = await response.json()
      if (["succeeded", "failed", "cancelled"].includes(run.status)) {
        return run
      }
      if (Date.now() > deadline) {
        throw new Error(`Run ${runId} did not reach a terminal status in time (last status: ${run.status}).`)
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
})
