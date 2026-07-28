import type { Activity, Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"

export type ActivityAction =
  | "create"
  | "edit"
  | "delete"
  | "import"
  | "export"
  | "share"
  | "permission_change"
  | "version_restore"

export type ActivityTargetType =
  | "layer"
  | "feature"
  | "member"
  | "version"
  | "comment"
  | "invitation"
  // specs/008-dashboard-analytics — additive (research.md Decision 11).
  | "dashboard"
  | "widget"
  | "report"

export interface RecordActivityInput {
  projectId: string
  userId: string
  action: ActivityAction
  targetType: ActivityTargetType
  targetId?: string
  metadata?: Record<string, unknown>
}

/**
 * Appends one `Activity` row (FR-023, FR-047). Takes an **existing**
 * transaction client and never opens its own (research.md Decision 8) —
 * every caller writes this inside the same transaction as the action it
 * records, so a crash between the two can never leave the action recorded
 * without its audit trail (or vice versa). There is deliberately no
 * update/delete function anywhere in this file — `Activity` is append-only.
 */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  input: RecordActivityInput,
): Promise<Activity> {
  return tx.activity.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}

export interface ListActivityParams {
  cursor?: string
  limit?: number
  /** specs/008-dashboard-analytics (T286) — narrows to a subset of `targetType`s (e.g. the Administration audit log's `"dashboard" | "widget" | "report"`) without a second query implementation. */
  targetTypes?: ActivityTargetType[]
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Cursor-paginated activity history for a project, newest first (US4). */
export async function listActivityForProject(
  projectId: string,
  params: ListActivityParams = {},
): Promise<{ activities: Activity[]; nextCursor: string | null }> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const rows = await prismaClient.activity.findMany({
    where: {
      projectId,
      ...(params.targetTypes ? { targetType: { in: params.targetTypes } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasNextPage = rows.length > limit
  const activities = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? activities[activities.length - 1]?.id ?? null : null

  return { activities, nextCursor }
}
