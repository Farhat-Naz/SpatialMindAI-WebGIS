import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/projects/route"
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/projects/[projectId]/route"
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

describe.skipIf(!dbAvailable)("Project lifecycle (integration)", () => {
  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("supports the full create → list → update → delete journey (FR-001–FR-006)", async () => {
    // Create
    const createResponse = await POST(
      jsonRequest("http://localhost/api/projects", "POST", {
        name: "Integration Lifecycle Project",
        description: "initial",
      }) as never,
    )
    expect(createResponse.status).toBe(201)
    const { project: created } = await createResponse.json()
    expect(created.createdAt).toBe(created.updatedAt)

    // List
    const listResponse = await GET(jsonRequest("http://localhost/api/projects", "GET") as never)
    const { projects } = await listResponse.json()
    expect(projects.some((p: { id: string }) => p.id === created.id)).toBe(true)

    // Update — createdAt must not change, updatedAt must
    const updateResponse = await PATCH(
      jsonRequest(`http://localhost/api/projects/${created.id}`, "PATCH", {
        description: "revised",
      }) as never,
      { params: Promise.resolve({ projectId: created.id }) },
    )
    expect(updateResponse.status).toBe(200)
    const { project: updated } = await updateResponse.json()
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).not.toBe(created.updatedAt)
    expect(updated.description).toBe("revised")

    // Delete
    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/projects/${created.id}`, "DELETE") as never,
      { params: Promise.resolve({ projectId: created.id }) },
    )
    expect(deleteResponse.status).toBe(204)

    // Deleted project is now 404, not a silent empty success
    const getAfterDelete = await GET_ONE(
      jsonRequest(`http://localhost/api/projects/${created.id}`, "GET") as never,
      { params: Promise.resolve({ projectId: created.id }) },
    )
    expect(getAfterDelete.status).toBe(404)
  })

  it("rejects a cross-owner update and leaves the project unchanged (Edge Cases)", async () => {
    const otherOwner = await prismaClient.user.upsert({
      where: { id: "integration-other-owner" },
      update: {},
      create: { id: "integration-other-owner", email: "integration-other-owner@dev.local" },
    })
    const otherProject = await prismaClient.project.create({
      data: { ownerId: otherOwner.id, name: "Not Mine" },
    })

    const response = await PATCH(
      jsonRequest(`http://localhost/api/projects/${otherProject.id}`, "PATCH", {
        name: "Hijacked",
      }) as never,
      { params: Promise.resolve({ projectId: otherProject.id }) },
    )
    expect(response.status).toBe(404)

    const stillOriginal = await prismaClient.project.findUnique({
      where: { id: otherProject.id },
    })
    expect(stillOriginal?.name).toBe("Not Mine")

    await prismaClient.project.delete({ where: { id: otherProject.id } })
    await prismaClient.user.delete({ where: { id: otherOwner.id } })
  })
})
