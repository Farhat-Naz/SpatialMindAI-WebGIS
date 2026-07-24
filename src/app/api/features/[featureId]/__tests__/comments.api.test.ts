import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "../comments/route"
import { DELETE, PATCH } from "@/app/api/comments/[commentId]/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Comments API", () => {
  let featureId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Comments API Test ${Date.now()}-${Math.random()}` },
    })
    await prismaClient.projectMember.create({
      data: { projectId: project.id, userId: TEST_OWNER_ID, role: "Owner" },
    })
    await prismaClient.projectMember.create({
      data: { projectId: project.id, userId: TEST_COLLABORATOR_ID, role: "Viewer" },
    })
    const layer = await prismaClient.layer.create({ data: { projectId: project.id, name: "L1", order: 0 } })
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layer.id}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    featureId = rows[0].id
  })

  it("a Viewer can read comments but not post one (403)", async () => {
    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const readResponse = await GET(
      jsonRequest(`http://localhost/api/features/${featureId}/comments`, "GET") as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(readResponse.status).toBe(200)

    const postResponse = await POST(
      jsonRequest(`http://localhost/api/features/${featureId}/comments`, "POST", {
        body: "Viewer trying to comment",
      }) as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(postResponse.status).toBe(403)
  })

  it("an Editor (Owner here) can create, reply, resolve, edit, and delete their own comment", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/features/${featureId}/comments`, "POST", {
        body: "Root comment",
      }) as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(createResponse.status).toBe(201)
    const { comment } = await createResponse.json()

    const resolveResponse = await PATCH(
      jsonRequest(`http://localhost/api/comments/${comment.id}`, "PATCH", { resolved: true }) as never,
      { params: Promise.resolve({ commentId: comment.id }) },
    )
    expect(resolveResponse.status).toBe(200)

    const editResponse = await PATCH(
      jsonRequest(`http://localhost/api/comments/${comment.id}`, "PATCH", { body: "Edited" }) as never,
      { params: Promise.resolve({ commentId: comment.id }) },
    )
    expect(editResponse.status).toBe(200)

    const deleteResponse = await DELETE(
      jsonRequest(`http://localhost/api/comments/${comment.id}`, "DELETE") as never,
      { params: Promise.resolve({ commentId: comment.id }) },
    )
    expect(deleteResponse.status).toBe(204)
  })

  it("author-only enforcement: a different member cannot edit or delete someone else's comment", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const createResponse = await POST(
      jsonRequest(`http://localhost/api/features/${featureId}/comments`, "POST", {
        body: "Owner's comment",
      }) as never,
      { params: Promise.resolve({ featureId }) },
    )
    const { comment } = await createResponse.json()

    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const editAttempt = await PATCH(
      jsonRequest(`http://localhost/api/comments/${comment.id}`, "PATCH", { body: "Hijacked" }) as never,
      { params: Promise.resolve({ commentId: comment.id }) },
    )
    expect(editAttempt.status).toBe(403)

    const deleteAttempt = await DELETE(
      jsonRequest(`http://localhost/api/comments/${comment.id}`, "DELETE") as never,
      { params: Promise.resolve({ commentId: comment.id }) },
    )
    expect(deleteAttempt.status).toBe(403)
  })
})
