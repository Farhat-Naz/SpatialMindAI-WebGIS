import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { GET as listNotifications } from "@/app/api/notifications/route"
import { PATCH as markRead } from "@/app/api/notifications/[notificationId]/read/route"
import { POST as markAllRead } from "@/app/api/notifications/mark-all-read/route"
import { DELETE as releaseLock, POST as acquireLock } from "@/app/api/features/[featureId]/lock/route"
import { POST as heartbeat } from "@/app/api/projects/[projectId]/presence/heartbeat/route"
import { GET as getPresence } from "@/app/api/projects/[projectId]/presence/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Notification/Lock/Presence API", () => {
  let projectId: string
  let featureId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    await prismaClient.notification.deleteMany({ where: { recipientUserId: TEST_OWNER_ID } })

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `NLP API Test ${Date.now()}-${Math.random()}` },
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

  it("lists the caller's own notifications, marks one read, and marks all read", async () => {
    await prismaClient.notification.create({
      data: { recipientUserId: TEST_OWNER_ID, type: "mention", payload: {} },
    })

    process.env.DEV_USER_ID = TEST_OWNER_ID
    const listResponse = await listNotifications(
      jsonRequest("http://localhost/api/notifications", "GET") as never,
    )
    const { notifications, unreadCount } = await listResponse.json()
    expect(notifications).toHaveLength(1)
    expect(unreadCount).toBe(1)

    const readResponse = await markRead(
      jsonRequest(`http://localhost/api/notifications/${notifications[0].id}/read`, "PATCH") as never,
      { params: Promise.resolve({ notificationId: notifications[0].id }) },
    )
    expect(readResponse.status).toBe(200)

    await prismaClient.notification.create({
      data: { recipientUserId: TEST_OWNER_ID, type: "mention", payload: {} },
    })
    const markAllResponse = await markAllRead(
      jsonRequest("http://localhost/api/notifications/mark-all-read", "POST") as never,
    )
    expect(markAllResponse.status).toBe(200)

    const finalList = await listNotifications(
      jsonRequest("http://localhost/api/notifications", "GET") as never,
    )
    expect((await finalList.json()).unreadCount).toBe(0)
  })

  it("acquires a lock, conflicts for a different user, then releases it", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const acquireResponse = await acquireLock(
      jsonRequest(`http://localhost/api/features/${featureId}/lock`, "POST") as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(acquireResponse.status).toBe(200)

    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID
    const conflictResponse = await acquireLock(
      jsonRequest(`http://localhost/api/features/${featureId}/lock`, "POST") as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(conflictResponse.status).toBe(409)

    process.env.DEV_USER_ID = TEST_OWNER_ID
    const releaseResponse = await releaseLock(
      jsonRequest(`http://localhost/api/features/${featureId}/lock`, "DELETE") as never,
      { params: Promise.resolve({ featureId }) },
    )
    expect(releaseResponse.status).toBe(204)
  })

  it("presence heartbeat then snapshot reflects the active member", async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    const heartbeatResponse = await heartbeat(
      jsonRequest(`http://localhost/api/projects/${projectId}/presence/heartbeat`, "POST", {
        cursorLng: 1,
        cursorLat: 2,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(heartbeatResponse.status).toBe(200)

    const snapshotResponse = await getPresence(
      jsonRequest(`http://localhost/api/projects/${projectId}/presence`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { presence } = await snapshotResponse.json()
    expect(presence.map((p: { userId: string }) => p.userId)).toContain(TEST_OWNER_ID)
  })
})
