import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/analysis/presets/route"
import { DELETE } from "@/app/api/analysis/presets/[presetId]/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Analysis Presets API", () => {
  let projectId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Presets API Test ${Date.now()}` },
    })
    projectId = project.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST/GET: creates and lists a preset", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis/presets`, "POST", {
        name: "500m Buffer",
        operationType: "buffer",
        parameters: { distance: 500, unit: "meters" },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(created.status).toBe(201)
    const { preset } = await created.json()
    expect(preset.name).toBe("500m Buffer")

    const listed = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis/presets`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { presets } = await listed.json()
    expect(presets.map((p: { id: string }) => p.id)).toContain(preset.id)
  })

  it("POST: 400 INVALID_INPUT for an unknown operationType", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis/presets`, "POST", {
        name: "Bad",
        operationType: "not-a-real-op",
        parameters: {},
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })

  it("POST: 409 DUPLICATE_NAME on a name collision", async () => {
    await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis/presets`, "POST", {
        name: "Dup",
        operationType: "buffer",
        parameters: {},
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const second = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis/presets`, "POST", {
        name: "Dup",
        operationType: "buffer",
        parameters: {},
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(second.status).toBe(409)
  })

  it("DELETE: removes a preset", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis/presets`, "POST", {
        name: "ToDelete",
        operationType: "buffer",
        parameters: {},
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { preset } = await created.json()

    const deleted = await DELETE(
      jsonRequest(`http://localhost/api/analysis/presets/${preset.id}`, "DELETE") as never,
      { params: Promise.resolve({ presetId: preset.id }) },
    )
    expect(deleted.status).toBe(204)
  })
})
