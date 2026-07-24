import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"
import {
  createNotification,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "../notificationRepository"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("notificationRepository", () => {
  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    await prismaClient.notification.deleteMany({
      where: { recipientUserId: { in: [TEST_OWNER_ID, TEST_COLLABORATOR_ID] } },
    })
  })

  it("creates a notification inside a transaction", async () => {
    await prismaClient.$transaction(async (tx) => {
      await createNotification(tx, {
        recipientUserId: TEST_OWNER_ID,
        type: "comment_added",
        payload: { featureId: "f1" },
      })
    })

    const { notifications, unreadCount } = await listNotificationsForUser(TEST_OWNER_ID)
    expect(notifications).toHaveLength(1)
    expect(unreadCount).toBe(1)
  })

  it("marks one notification read and reflects it in the unread count", async () => {
    const created = await prismaClient.$transaction((tx) =>
      createNotification(tx, {
        recipientUserId: TEST_OWNER_ID,
        type: "mention",
        payload: {},
      }),
    )

    const updated = await markNotificationRead(created.id, TEST_OWNER_ID)
    expect(updated.read).toBe(true)

    const { unreadCount } = await listNotificationsForUser(TEST_OWNER_ID)
    expect(unreadCount).toBe(0)
  })

  it("rejects marking another user's notification as read", async () => {
    const created = await prismaClient.$transaction((tx) =>
      createNotification(tx, {
        recipientUserId: TEST_OWNER_ID,
        type: "mention",
        payload: {},
      }),
    )

    await expect(markNotificationRead(created.id, TEST_COLLABORATOR_ID)).rejects.toThrow()
  })

  it("marks all of a user's notifications read", async () => {
    for (let i = 0; i < 3; i++) {
      await prismaClient.$transaction((tx) =>
        createNotification(tx, { recipientUserId: TEST_OWNER_ID, type: "mention", payload: {} }),
      )
    }

    const result = await markAllNotificationsRead(TEST_OWNER_ID)
    expect(result.updatedCount).toBe(3)

    const { unreadCount } = await listNotificationsForUser(TEST_OWNER_ID)
    expect(unreadCount).toBe(0)
  })
})
