import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { DELETE, GET as GET_ONE, PATCH } from "../[projectId]/route"
import { GET, POST } from "../route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Projects API", () => {
  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("creates a project", async () => {
    const request = jsonRequest("http://localhost/api/projects", "POST", {
      name: "API Test Project",
      description: "created by projects.api.test.ts",
    })
    const response = await POST(request as never)
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body.project.name).toBe("API Test Project")
  })

  it("rejects a duplicate project name for the same owner with 409", async () => {
    const request = jsonRequest("http://localhost/api/projects", "POST", {
      name: "API Test Project",
    })
    const response = await POST(request as never)
    expect(response.status).toBe(409)

    const body = await response.json()
    expect(body.error.code).toBe("DUPLICATE_NAME")
  })

  it("rejects an empty name with 400 INVALID_INPUT", async () => {
    const request = jsonRequest("http://localhost/api/projects", "POST", { name: "" })
    const response = await POST(request as never)
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })

  it("lists the owner's projects", async () => {
    const request = jsonRequest("http://localhost/api/projects", "GET")
    const response = await GET(request as never)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body.projects)).toBe(true)
    expect(body.projects.some((p: { name: string }) => p.name === "API Test Project")).toBe(true)
  })

  it("gets, updates, and deletes a single project", async () => {
    const created = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Single Project Flow" },
    })

    const getRequest = jsonRequest(`http://localhost/api/projects/${created.id}`, "GET")
    const getResponse = await GET_ONE(getRequest as never, {
      params: Promise.resolve({ projectId: created.id }),
    })
    expect(getResponse.status).toBe(200)

    const patchRequest = jsonRequest(
      `http://localhost/api/projects/${created.id}`,
      "PATCH",
      { description: "updated" },
    )
    const patchResponse = await PATCH(patchRequest as never, {
      params: Promise.resolve({ projectId: created.id }),
    })
    expect(patchResponse.status).toBe(200)
    const patchBody = await patchResponse.json()
    expect(patchBody.project.description).toBe("updated")
    expect(patchBody.project.createdAt).toBe(created.createdAt.toISOString())

    const deleteRequest = jsonRequest(`http://localhost/api/projects/${created.id}`, "DELETE")
    const deleteResponse = await DELETE(deleteRequest as never, {
      params: Promise.resolve({ projectId: created.id }),
    })
    expect(deleteResponse.status).toBe(204)

    const afterDelete = await prismaClient.project.findUnique({ where: { id: created.id } })
    expect(afterDelete).toBeNull()
  })

  it("returns 404 NOT_FOUND for a nonexistent project", async () => {
    const request = jsonRequest("http://localhost/api/projects/does-not-exist", "GET")
    const response = await GET_ONE(request as never, {
      params: Promise.resolve({ projectId: "does-not-exist" }),
    })
    expect(response.status).toBe(404)

    const body = await response.json()
    expect(body.error.code).toBe("NOT_FOUND")
  })

  it("returns 404 NOT_FOUND (not 401) for a project owned by a different user", async () => {
    const otherOwner = await prismaClient.user.upsert({
      where: { id: "test-owner-2" },
      update: {},
      create: { id: "test-owner-2", email: "test-owner-2@dev.local" },
    })
    const otherProject = await prismaClient.project.create({
      data: { ownerId: otherOwner.id, name: "Someone Else's Project" },
    })

    const request = jsonRequest(`http://localhost/api/projects/${otherProject.id}`, "GET")
    const response = await GET_ONE(request as never, {
      params: Promise.resolve({ projectId: otherProject.id }),
    })
    expect(response.status).toBe(404)

    await prismaClient.project.delete({ where: { id: otherProject.id } })
    await prismaClient.user.delete({ where: { id: otherOwner.id } })
  })

  it("returns 401 UNAUTHORIZED when no user can be resolved", async () => {
    const original = process.env.DEV_USER_ID
    delete process.env.DEV_USER_ID

    const request = jsonRequest("http://localhost/api/projects", "GET")
    const response = await GET(request as never)
    expect(response.status).toBe(401)

    process.env.DEV_USER_ID = original
  })
})
