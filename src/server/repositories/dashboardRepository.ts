import { Prisma, type Dashboard } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { getMemberRole } from "@/server/repositories/membershipRepository"
import { assertDashboardPermission, resolveEffectivePermission } from "@/server/repositories/dashboardShareRepository"
import { recordActivity } from "@/server/repositories/activityRepository"
import { DuplicateNameError, NotFoundError } from "@/shared/errors/apiError"
import type { DashboardRecord } from "@/features/dashboards/types/dashboard.types"
import { GRID_COLUMNS } from "@/features/dashboards/types/dashboardConfig.constants"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

async function hasProjectAccess(projectId: string, userId: string): Promise<boolean> {
  const project = await prismaClient.project.findUnique({ where: { id: projectId }, select: { ownerId: true } })
  if (!project) return false
  if (project.ownerId === userId) return true
  const role = await getMemberRole(projectId, userId)
  return role !== null
}

type WidgetWithLayouts = Prisma.DashboardWidgetGetPayload<{ include: { layouts: true } }>

function toWidgetRecord(widget: WidgetWithLayouts): DashboardRecord["widgets"][number] {
  return {
    id: widget.id,
    dashboardId: widget.dashboardId,
    type: widget.type,
    title: widget.title,
    dataSourceType: widget.dataSourceType,
    dataSourceId: widget.dataSourceId,
    config: widget.config,
    groupId: widget.groupId,
    isCollapsed: widget.isCollapsed,
    createdAt: widget.createdAt.toISOString(),
    updatedAt: widget.updatedAt.toISOString(),
    layouts: widget.layouts.map((layout) => ({
      id: layout.id,
      widgetId: layout.widgetId,
      breakpoint: layout.breakpoint as "desktop" | "tablet" | "mobile",
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h,
    })),
  }
}

/**
 * `widgets` is embedded only when `includeWidgets` is set (`getDashboardById`,
 * a detail fetch) — never on `listDashboardsForProject`'s rows, which would
 * eagerly load every dashboard's full widget set for a list view (T134 note
 * in dashboard.types.ts).
 */
async function toRecord(row: Dashboard, userId: string, widgets: WidgetWithLayouts[] = []): Promise<DashboardRecord> {
  const [permission, favorite, share] = await Promise.all([
    resolveEffectivePermission(row.id, userId),
    prismaClient.dashboardFavorite.findUnique({
      where: { dashboardId_userId: { dashboardId: row.id, userId } },
      select: { id: true },
    }),
    prismaClient.dashboardShare.findUnique({
      where: { dashboardId_userId: { dashboardId: row.id, userId } },
      select: { id: true },
    }),
  ])

  return {
    id: row.id,
    projectId: row.projectId,
    ownerId: row.ownerId,
    name: row.name,
    templateId: row.templateId,
    visibility: row.visibility as "private" | "public",
    effectivePermission: permission ?? "view",
    isFavorite: Boolean(favorite),
    sharedWithMe: Boolean(share),
    widgets: widgets.map(toWidgetRecord),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface ListDashboardsParams {
  cursor?: string
  limit?: number
  favoritesOnly?: boolean
}

/**
 * Lists dashboards in a project (US1), union-scoped: a project member
 * (Viewer+) sees every dashboard in the project; a non-member sees only
 * dashboards shared with them directly or marked `"public"` (research.md
 * Decision 7) — never the whole project's dashboard list.
 */
export async function listDashboardsForProject(
  projectId: string,
  userId: string,
  params: ListDashboardsParams = {},
): Promise<{ dashboards: DashboardRecord[]; nextCursor: string | null }> {
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const isMember = await hasProjectAccess(projectId, userId)

  const where: Prisma.DashboardWhereInput = {
    projectId,
    ...(isMember ? {} : { OR: [{ visibility: "public" }, { shares: { some: { userId } } }] }),
    ...(params.favoritesOnly ? { favorites: { some: { userId } } } : {}),
  }

  const rows = await prismaClient.dashboard.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1]?.id ?? null : null

  const dashboards = await Promise.all(pageRows.map((row) => toRecord(row, userId)))
  return { dashboards, nextCursor }
}

/**
 * Gets one dashboard, union-scoped identically to `listDashboardsForProject`
 * (via `resolveEffectivePermission`) — embeds every widget and its
 * per-breakpoint layout rows (client-api.md: "widgets are returned embedded
 * in dashboard detail, matching `AnalysisRun`'s one-query precedent").
 */
export async function getDashboardById(dashboardId: string, userId: string): Promise<DashboardRecord> {
  await assertDashboardPermission(dashboardId, userId, "view")
  const row = await prismaClient.dashboard.findUnique({
    where: { id: dashboardId },
    include: { widgets: { include: { layouts: true } } },
  })
  if (!row) {
    throw new NotFoundError(`No dashboard found with id "${dashboardId}".`)
  }
  const { widgets, ...dashboard } = row
  return toRecord(dashboard, userId, widgets)
}

interface WidgetsBlueprintEntry {
  type: string
  title?: string
  dataSourceType?: string
  config: Record<string, unknown>
  layout: { desktop: { x: number; y: number; w: number; h: number } }
}

/** Creates a dashboard (FR-001), optionally seeded from a template's `widgetsBlueprint` in one transaction (US8/FR-029). */
export async function createDashboard(
  projectId: string,
  userId: string,
  input: { name: string; templateId?: string },
): Promise<DashboardRecord> {
  await assertProjectRole(projectId, userId, "Editor")

  let blueprint: WidgetsBlueprintEntry[] = []
  if (input.templateId) {
    const template = await prismaClient.dashboardTemplate.findUnique({ where: { id: input.templateId } })
    if (!template) {
      throw new NotFoundError(`No dashboard template found with id "${input.templateId}".`)
    }
    blueprint = template.widgetsBlueprint as unknown as WidgetsBlueprintEntry[]
  }

  try {
    const row = await prismaClient.$transaction(async (tx) => {
      const dashboard = await tx.dashboard.create({
        data: { projectId, ownerId: userId, name: input.name, templateId: input.templateId ?? null },
      })

      let mobileStackY = 0
      for (const widget of blueprint) {
        const createdWidget = await tx.dashboardWidget.create({
          data: {
            dashboardId: dashboard.id,
            type: widget.type,
            title: widget.title,
            dataSourceType: widget.dataSourceType,
            config: widget.config as Prisma.InputJsonValue,
          },
        })

        const desktop = widget.layout.desktop
        // Tablet/mobile rows aren't authored per template (data-model.md's
        // blueprint shape only carries a desktop layout) — derived here so
        // a template-created dashboard has a placement on every breakpoint
        // tier from the start, matching `addWidget`'s own default-layout
        // behavior for a manually-added widget. Tablet keeps the desktop
        // position, clamped to the narrower grid; mobile stacks every
        // widget full-width, one after another.
        const tabletWidth = Math.min(desktop.w, GRID_COLUMNS.tablet)
        const mobileHeight = desktop.h
        await tx.widgetLayout.createMany({
          data: [
            { widgetId: createdWidget.id, breakpoint: "desktop", ...desktop },
            {
              widgetId: createdWidget.id,
              breakpoint: "tablet",
              x: Math.min(desktop.x, GRID_COLUMNS.tablet - tabletWidth),
              y: desktop.y,
              w: tabletWidth,
              h: desktop.h,
            },
            { widgetId: createdWidget.id, breakpoint: "mobile", x: 0, y: mobileStackY, w: GRID_COLUMNS.mobile, h: mobileHeight },
          ],
        })
        mobileStackY += mobileHeight
      }

      return dashboard
    })
    return toRecord(row, userId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateNameError(`A dashboard named "${input.name}" already exists in this project.`)
    }
    throw error
  }
}

/** Renames a dashboard — any Editor-or-broader effective permission may rename (FR-001). */
export async function renameDashboard(dashboardId: string, userId: string, name: string): Promise<DashboardRecord> {
  await assertDashboardPermission(dashboardId, userId, "edit")
  try {
    const row = await prismaClient.dashboard.update({ where: { id: dashboardId }, data: { name } })
    return toRecord(row, userId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateNameError(`A dashboard named "${name}" already exists in this project.`)
    }
    throw error
  }
}

/** Changes `visibility` — dashboard owner or project Owner only (FR-024), a stricter gate than a plain rename. */
export async function setDashboardVisibility(
  dashboardId: string,
  userId: string,
  visibility: "private" | "public",
): Promise<DashboardRecord> {
  const dashboard = await prismaClient.dashboard.findUnique({ where: { id: dashboardId } })
  if (!dashboard) {
    throw new NotFoundError(`No dashboard found with id "${dashboardId}".`)
  }
  if (dashboard.ownerId !== userId) {
    await assertProjectRole(dashboard.projectId, userId, "Owner")
  }

  const row = await prismaClient.dashboard.update({ where: { id: dashboardId }, data: { visibility } })
  return toRecord(row, userId)
}

/** Deletes a dashboard and everything it cascades to, logging one `Activity` row (research.md Decision 11). */
export async function deleteDashboard(dashboardId: string, userId: string): Promise<void> {
  await assertDashboardPermission(dashboardId, userId, "owner")
  const dashboard = await prismaClient.dashboard.findUnique({ where: { id: dashboardId } })
  if (!dashboard) {
    throw new NotFoundError(`No dashboard found with id "${dashboardId}".`)
  }

  await prismaClient.$transaction(async (tx) => {
    await tx.dashboard.delete({ where: { id: dashboardId } })
    await recordActivity(tx, {
      projectId: dashboard.projectId,
      userId,
      action: "delete",
      targetType: "dashboard",
      targetId: dashboardId,
    })
  })
}

/** Deep-copies a dashboard's widgets/layout/filters into a new, fully independent dashboard (FR-002) — zero shared rows with the source. */
export async function duplicateDashboard(dashboardId: string, userId: string): Promise<DashboardRecord> {
  await assertDashboardPermission(dashboardId, userId, "view")

  const source = await prismaClient.dashboard.findUnique({
    where: { id: dashboardId },
    include: { widgets: { include: { layouts: true, filters: true } }, filters: { where: { widgetId: null } } },
  })
  if (!source) {
    throw new NotFoundError(`No dashboard found with id "${dashboardId}".`)
  }

  const row = await prismaClient.$transaction(async (tx) => {
    let copyName = `${source.name} (copy)`
    const collision = await tx.dashboard.findUnique({
      where: { projectId_name: { projectId: source.projectId, name: copyName } },
    })
    if (collision) copyName = `${source.name} (copy ${Date.now()})`

    const dashboard = await tx.dashboard.create({
      data: { projectId: source.projectId, ownerId: userId, name: copyName, visibility: "private" },
    })

    const widgetIdMap = new Map<string, string>()
    for (const widget of source.widgets) {
      const newWidget = await tx.dashboardWidget.create({
        data: {
          dashboardId: dashboard.id,
          type: widget.type,
          title: widget.title,
          dataSourceType: widget.dataSourceType,
          dataSourceId: widget.dataSourceId,
          config: widget.config as Prisma.InputJsonValue,
          isCollapsed: widget.isCollapsed,
        },
      })
      widgetIdMap.set(widget.id, newWidget.id)
    }

    for (const widget of source.widgets) {
      const newWidgetId = widgetIdMap.get(widget.id)
      if (!newWidgetId) continue
      if (widget.groupId && widgetIdMap.has(widget.groupId)) {
        await tx.dashboardWidget.update({
          where: { id: newWidgetId },
          data: { groupId: widgetIdMap.get(widget.groupId) },
        })
      }
      for (const layout of widget.layouts) {
        await tx.widgetLayout.create({
          data: { widgetId: newWidgetId, breakpoint: layout.breakpoint, x: layout.x, y: layout.y, w: layout.w, h: layout.h },
        })
      }
      for (const filter of widget.filters) {
        await tx.dashboardFilter.create({
          data: {
            dashboardId: dashboard.id,
            widgetId: newWidgetId,
            filterType: filter.filterType,
            config: filter.config as Prisma.InputJsonValue,
          },
        })
      }
    }

    for (const filter of source.filters) {
      await tx.dashboardFilter.create({
        data: {
          dashboardId: dashboard.id,
          widgetId: null,
          filterType: filter.filterType,
          config: filter.config as Prisma.InputJsonValue,
        },
      })
    }

    return dashboard
  })

  return toRecord(row, userId)
}

/** Favorites a dashboard for the requesting user (FR-003) — idempotent upsert. */
export async function setFavorite(dashboardId: string, userId: string): Promise<void> {
  await assertDashboardPermission(dashboardId, userId, "view")
  await prismaClient.dashboardFavorite.upsert({
    where: { dashboardId_userId: { dashboardId, userId } },
    update: {},
    create: { dashboardId, userId },
  })
}

/** Unfavorites a dashboard — idempotent no-op if not currently favorited. */
export async function unsetFavorite(dashboardId: string, userId: string): Promise<void> {
  await prismaClient.dashboardFavorite.deleteMany({ where: { dashboardId, userId } })
}
