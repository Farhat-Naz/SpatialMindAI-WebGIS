import type { Activity } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { listActivityForProject } from "@/server/repositories/activityRepository"

/**
 * Administration (US10/FR-034–FR-038) — every query here is Project-Owner-
 * only, asserted first, server-side (T288). Deliberately separate from
 * `dashboardRepository.ts`'s CRUD (which is reachable by any project
 * member per its own union-scoping, research.md Decision 7) rather than
 * layering an admin flag onto those same functions.
 */

export interface AdminDashboardRow {
  id: string
  name: string
  ownerId: string
  visibility: "private" | "public"
  /** "Sharing state" (FR-034) — how many `DashboardShare` grants exist, not the grants themselves (T217's share dialog already lists those in detail). */
  shareCount: number
  widgets: { id: string; title: string | null; type: string }[]
  createdAt: string
  updatedAt: string
}

/** T284/FR-034 — every dashboard in the project (not `listDashboardsForProject`'s union-scoped subset), with owner/last-modified/sharing state. */
export async function listDashboardsForAdmin(projectId: string, userId: string): Promise<AdminDashboardRow[]> {
  await assertProjectRole(projectId, userId, "Owner")

  const rows = await prismaClient.dashboard.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { shares: true } },
      widgets: { select: { id: true, title: true, type: true } },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    visibility: row.visibility as "private" | "public",
    shareCount: row._count.shares,
    widgets: row.widgets,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export interface UsageAnalytics {
  /**
   * A proxy for "view counts" (FR-035) — this schema has no page-view
   * tracking, and adding one would mean a write on every dashboard-detail
   * fetch (including each 30s live-refresh poll, T107/research.md Decision
   * 6), which this feature's caching decisions deliberately avoid. Counts
   * direct dashboard-level `Activity` rows (create/edit/delete/share)
   * instead — a real, already-logged engagement signal, not literal page
   * views; documented here rather than silently overclaiming the label.
   */
  activityCountByDashboard: { dashboardId: string; count: number }[]
  mostUsedWidgetTypes: { type: string; count: number }[]
}

/** T285/FR-035 — usage analytics scoped to the project's own dashboards. */
export async function getUsageAnalytics(projectId: string, userId: string): Promise<UsageAnalytics> {
  await assertProjectRole(projectId, userId, "Owner")

  const [activityGroups, widgetGroups] = await Promise.all([
    prismaClient.activity.groupBy({
      by: ["targetId"],
      where: { projectId, targetType: "dashboard", targetId: { not: null } },
      _count: { _all: true },
    }),
    prismaClient.dashboardWidget.groupBy({
      by: ["type"],
      where: { dashboard: { projectId } },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
    }),
  ])

  return {
    activityCountByDashboard: activityGroups.map((row) => ({
      dashboardId: row.targetId as string,
      count: row._count._all,
    })),
    mostUsedWidgetTypes: widgetGroups.map((row) => ({ type: row.type, count: row._count._all })),
  }
}

export interface ListAuditLogParams {
  cursor?: string
  limit?: number
}

/** T286/FR-036 — reuses 006's `Activity` feed (research.md Decision 11), filtered to dashboard-related target types; not a second audit viewer. */
export async function listAuditLog(
  projectId: string,
  userId: string,
  params: ListAuditLogParams = {},
): Promise<{ activities: Activity[]; nextCursor: string | null }> {
  await assertProjectRole(projectId, userId, "Owner")
  return listActivityForProject(projectId, { ...params, targetTypes: ["dashboard", "widget", "report"] })
}
