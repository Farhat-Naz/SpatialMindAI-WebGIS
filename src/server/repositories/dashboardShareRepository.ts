import type { DashboardShare } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { getMemberRole } from "@/server/repositories/membershipRepository"
import { recordActivity } from "@/server/repositories/activityRepository"
import { ForbiddenError, NotFoundError } from "@/shared/errors/apiError"
import type { DashboardEffectivePermission } from "@/features/dashboards/types/dashboard.types"

const PERMISSION_RANK: Record<DashboardEffectivePermission, number> = { view: 1, edit: 2, owner: 3 }

export interface DashboardShareRecord {
  id: string
  dashboardId: string
  userId: string
  permission: "view" | "edit"
  grantedByUserId: string
  createdAt: Date
}

function toRecord(row: DashboardShare): DashboardShareRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    userId: row.userId,
    permission: row.permission as "view" | "edit",
    grantedByUserId: row.grantedByUserId,
    createdAt: row.createdAt,
  }
}

/**
 * The single function every dashboard/widget/report/share write path calls
 * to authorize (research.md Decision 7; repository-api.md). Combines the
 * caller's base project role with any `DashboardShare` grant on this
 * specific dashboard — a share can only *broaden* access beyond the base
 * project role, never narrow it below what the role already allows.
 *
 * Returns `null` when the caller has no access at all: not a project
 * member, not the dashboard owner, no share, and the dashboard is not
 * `"public"`. Every caller of this function treats `null` as "throw
 * `NotFoundError`" (non-disclosure — matching `assertProjectRole`'s own
 * "doesn't exist" vs "exists but isn't yours" indistinguishability rule).
 */
export async function resolveEffectivePermission(
  dashboardId: string,
  userId: string,
): Promise<DashboardEffectivePermission | null> {
  const dashboard = await prismaClient.dashboard.findUnique({
    where: { id: dashboardId },
    select: { projectId: true, ownerId: true, visibility: true },
  })
  if (!dashboard) return null

  const project = await prismaClient.project.findUnique({
    where: { id: dashboard.projectId },
    select: { ownerId: true },
  })
  if (!project) return null

  let base: DashboardEffectivePermission | null = null
  if (dashboard.ownerId === userId || project.ownerId === userId) {
    // A project Owner can administer any dashboard in their project without
    // being its creator (plan.md Security — Ownership); a dashboard's own
    // owner naturally gets the same top rank.
    base = "owner"
  } else {
    const role = await getMemberRole(dashboard.projectId, userId)
    if (role === "Owner") base = "owner"
    else if (role === "Editor") base = "edit"
    else if (role === "Viewer") base = "view"
  }

  if (!base && dashboard.visibility === "public") {
    // Reachable by any signed-in platform user (research.md Decision 8) —
    // `userId` is already known-authenticated by the time a repository
    // function is called (Route Handlers resolve `getCurrentUser` first).
    base = "view"
  }

  const share = await prismaClient.dashboardShare.findUnique({
    where: { dashboardId_userId: { dashboardId, userId } },
    select: { permission: true },
  })

  if (!base && !share) return null

  const baseRank = base ? PERMISSION_RANK[base] : 0
  const shareRank = share ? PERMISSION_RANK[share.permission as "view" | "edit"] : 0
  const finalRank = Math.max(baseRank, shareRank)

  return (Object.keys(PERMISSION_RANK) as DashboardEffectivePermission[]).find(
    (key) => PERMISSION_RANK[key] === finalRank,
  ) ?? null
}

/** Throws `NotFoundError`/`ForbiddenError` unless the caller's effective permission meets `minimum`. Returns the resolved permission on success. */
export async function assertDashboardPermission(
  dashboardId: string,
  userId: string,
  minimum: DashboardEffectivePermission,
): Promise<DashboardEffectivePermission> {
  const permission = await resolveEffectivePermission(dashboardId, userId)
  if (!permission) {
    throw new NotFoundError(`No dashboard found with id "${dashboardId}".`)
  }
  if (PERMISSION_RANK[permission] < PERMISSION_RANK[minimum]) {
    throw new ForbiddenError(`This action requires at least "${minimum}" access to this dashboard.`)
  }
  return permission
}

/** Lists every share grant on a dashboard (owner/project-Owner only, FR-023). */
export async function listShares(dashboardId: string, userId: string): Promise<DashboardShareRecord[]> {
  await assertDashboardPermission(dashboardId, userId, "owner")
  const rows = await prismaClient.dashboardShare.findMany({
    where: { dashboardId },
    orderBy: { createdAt: "desc" },
  })
  return rows.map(toRecord)
}

/** Grants (or updates) a user's access to one dashboard — owner/project-Owner only. Upserts on `(dashboardId, userId)`. */
export async function grantShare(
  dashboardId: string,
  granterId: string,
  input: { userId: string; permission: "view" | "edit" },
): Promise<DashboardShareRecord> {
  await assertDashboardPermission(dashboardId, granterId, "owner")

  const row = await prismaClient.$transaction(async (tx) => {
    const share = await tx.dashboardShare.upsert({
      where: { dashboardId_userId: { dashboardId, userId: input.userId } },
      update: { permission: input.permission, grantedByUserId: granterId },
      create: {
        dashboardId,
        userId: input.userId,
        permission: input.permission,
        grantedByUserId: granterId,
      },
    })
    // research.md Decision 11 — FR-042 audit logging.
    const dashboard = await tx.dashboard.findUniqueOrThrow({ where: { id: dashboardId }, select: { projectId: true } })
    await recordActivity(tx, {
      projectId: dashboard.projectId,
      userId: granterId,
      action: "share",
      targetType: "dashboard",
      targetId: dashboardId,
      metadata: { grantedToUserId: input.userId, permission: input.permission },
    })
    return share
  })
  return toRecord(row)
}

/** Revokes a user's share grant — same authorization rule as `grantShare` (FR-027). */
export async function revokeShare(dashboardId: string, granterId: string, targetUserId: string): Promise<void> {
  await assertDashboardPermission(dashboardId, granterId, "owner")
  await prismaClient.$transaction(async (tx) => {
    await tx.dashboardShare.deleteMany({ where: { dashboardId, userId: targetUserId } })
    const dashboard = await tx.dashboard.findUniqueOrThrow({ where: { id: dashboardId }, select: { projectId: true } })
    await recordActivity(tx, {
      projectId: dashboard.projectId,
      userId: granterId,
      action: "share",
      targetType: "dashboard",
      targetId: dashboardId,
      metadata: { revokedFromUserId: targetUserId },
    })
  })
}
