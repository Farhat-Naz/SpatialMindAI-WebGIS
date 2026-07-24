import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { PATCH } from "../route"
import { POST as acquireLock } from "../lock/route"
import { GET as stream } from "@/app/api/projects/[projectId]/stream/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Feature conflict extension + stream access check", () => {
  let projectId: string
  let featureId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Conflict API Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Editor" },
    })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layer.id}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
      RETURNING id
    `
    featureId = rows[0].id
  })

  it("an expectedUpdatedAt mismatch is rejected with 409", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const staleTimestamp = new Date(0).toISOString()

    const response = await PATCH(
      jsonRequest(`http://localhost/api/features/${featureId}`, "PATCH", {
        attributes: [{ key: "k", value: "v" }],
        expectedUpdatedAt: staleTimestamp,
      }) as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(response.status).toBe(409)
  })

  it("an update from a different user while a lock is held is rejected with 409", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await acquireLock(
      jsonRequest(`http://localhost/api/features/${featureId}/lock`, "POST") as never,
      { params: Promise.resolve({ featureId }) },
    )

    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const response = await PATCH(
      jsonRequest(`http://localhost/api/features/${featureId}`, "PATCH", {
        attributes: [{ key: "k", value: "v" }],
      }) as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(response.status).toBe(409)
  })

  it("an update with no expectedUpdatedAt/lock conflict still succeeds (existing behavior unchanged)", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const response = await PATCH(
      jsonRequest(`http://localhost/api/features/${featureId}`, "PATCH", {
        attributes: [{ key: "k", value: "v" }],
      }) as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(response.status).toBe(200)
  })

  it("a non-member's stream request is rejected before any stream would open (404)", async () => {
    process.env.DEV_USER_ID = "test-stream-stranger-1"
    await prismaClient.user.upsert({
      where: { id: "test-stream-stranger-1" },
      update: {},
      create: { id: "test-stream-stranger-1", email: "test-stream-stranger-1@dev.local" },
    })

    const response = await stream(
      jsonRequest(`http://localhost/api/projects/${projectId}/stream`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(404)
  })
})
