import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/exports/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Exports API", () => {
  let projectId: string
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Exports API Test ${Date.now()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L", order: 0 } })
    layerId = layer.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST/GET: logs a completed export and lists it", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/exports`, "POST", {
        sourceLayerId: layerId,
        format: "geojson",
        status: "succeeded",
        featureCount: 10,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(created.status).toBe(201)
    const { exportJob } = await created.json()
    expect(exportJob.status).toBe("succeeded")

    const listed = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/exports`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { exports: history } = await listed.json()
    expect(history.map((e: { id: string }) => e.id)).toContain(exportJob.id)
  })

  it("POST: 400 INVALID_INPUT when both sourceAnalysisRunId and sourceLayerId are set", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/exports`, "POST", {
        sourceLayerId: layerId,
        sourceAnalysisRunId: "some-run-id",
        format: "csv",
        status: "succeeded",
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })
})
