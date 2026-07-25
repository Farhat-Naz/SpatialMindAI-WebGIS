import type { Notification, Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { publish, userChannel } from "@/server/realtime/channel"
import { NotFoundError } from "@/shared/errors/apiError"

export type NotificationType =
  | "project_shared"
  | "invitation_accepted"
  | "comment_added"
  | "mention"
  | "version_restored"
  | "feature_assigned"
  | "lock_conflict"

export interface CreateNotificationInput {
  recipientUserId: string
  type: NotificationType
  payload: Record<string, unknown>
}

/**
 * Creates one `Notification` row (research.md Decision 9). Takes an
 * **existing** transaction client, mirroring `recordActivity`'s convention
 * (research.md Decision 8) — the notification-triggering event and the
 * notification itself commit atomically. Publishes to the recipient's
 * **personal** channel, not any project channel (research.md Decision 9) —
 * only the intended recipient's SSE stream receives the event.
 */
export async function createNotification(
  tx: Prisma.TransactionClient,
  input: CreateNotificationInput,
): Promise<Notification> {
  const notification = await tx.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      type: input.type,
      payload: input.payload as Prisma.InputJsonValue,
    },
  })
  await publish(
    userChannel(input.recipientUserId),
    { type: "notification", notificationId: notification.id, notificationType: input.type },
    tx,
  )
  return notification
}

export interface ListNotificationsParams {
  cursor?: string
  limit?: number
  unreadOnly?: boolean
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Cursor-paginated notifications for one recipient, newest first, plus their unread count (FR-037/FR-038). */
export async function listNotificationsForUser(
  userId: string,
  params: ListNotificationsParams = {},
): Promise<{ notifications: Notification[]; nextCursor: string | null; unreadCount: number }> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const [rows, unreadCount] = await Promise.all([
    prismaClient.notification.findMany({
      where: { recipientUserId: userId, ...(params.unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    }),
    prismaClient.notification.count({ where: { recipientUserId: userId, read: false } }),
  ])

  const hasNextPage = rows.length > limit
  const notifications = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? notifications[notifications.length - 1]?.id ?? null : null

  return { notifications, nextCursor, unreadCount }
}

/**
 * Marks one notification read — only its recipient may do so. A
 * notification is a private, per-user resource (unlike a project-scoped
 * resource where membership already implies visibility), so a mismatched
 * recipient is reported identically to "doesn't exist" (`NotFoundError`,
 * non-disclosing) rather than `ForbiddenError` — matching this codebase's
 * established non-disclosure pattern (`NotFoundError`'s own doc comment).
 */
export async function markNotificationRead(notificationId: string, userId: string): Promise<Notification> {
  const existing = await prismaClient.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId },
  })
  if (!existing) {
    throw new NotFoundError(`No notification found with id "${notificationId}".`)
  }
  return prismaClient.notification.update({ where: { id: notificationId }, data: { read: true } })
}

/** Marks every unread notification for `userId` as read. */
export async function markAllNotificationsRead(userId: string): Promise<{ updatedCount: number }> {
  const result = await prismaClient.notification.updateMany({
    where: { recipientUserId: userId, read: false },
    data: { read: true },
  })
  return { updatedCount: result.count }
}
