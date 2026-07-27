import { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertDashboardPermission } from "@/server/repositories/dashboardShareRepository"
import { listFeaturesForLayer } from "@/server/repositories/featureRepository"
import { getAnalysisRunById } from "@/server/repositories/analysisRepository"
import { listActivityForProject } from "@/server/repositories/activityRepository"
import { getSnapshot } from "@/server/repositories/dashboardAnalyticsRepository"
import { sanitizeWidgetHtml } from "@/shared/lib/sanitizeHtml"
import { widgetConfigSchemaFor, type WidgetTypeInput } from "@/shared/contracts/widget.schema"
import { NotFoundError, ValidationError } from "@/shared/errors/apiError"
import {
  DEFAULT_WIDGET_SIZE,
  GRID_COLUMNS,
} from "@/features/dashboards/types/dashboardConfig.constants"
import type {
  DashboardWidgetRecord,
  WidgetLayoutRecord,
} from "@/features/dashboards/types/dashboard.types"
import type { WidgetDataResult } from "@/features/dashboards/types/widget.types"

type TransactionClient = Prisma.TransactionClient

const NON_DATA_DRIVEN_TYPES = new Set(["text", "image", "html"])

function toWidgetRecord(row: {
  id: string
  dashboardId: string
  type: string
  title: string | null
  dataSourceType: string | null
  dataSourceId: string | null
  config: unknown
  groupId: string | null
  isCollapsed: boolean
  createdAt: Date
  updatedAt: Date
}): DashboardWidgetRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    type: row.type,
    title: row.title,
    dataSourceType: row.dataSourceType,
    dataSourceId: row.dataSourceId,
    config: row.config,
    groupId: row.groupId,
    isCollapsed: row.isCollapsed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toLayoutRecord(row: { id: string; widgetId: string; breakpoint: string; x: number; y: number; w: number; h: number }): WidgetLayoutRecord {
  return {
    id: row.id,
    widgetId: row.widgetId,
    breakpoint: row.breakpoint as "desktop" | "tablet" | "mobile",
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
  }
}

/** Validates `config` against its `type`'s Zod schema and sanitizes any HTML/Text content (FR-007) — shared by `addWidget` and `updateWidget`. */
function validateAndSanitizeConfig(type: WidgetTypeInput, config: Record<string, unknown>): Record<string, unknown> {
  const schema = widgetConfigSchemaFor(type)
  const parsed = schema.safeParse(config)
  if (!parsed.success) {
    throw new ValidationError(`Invalid config for widget type "${type}": ${parsed.error.message}`)
  }

  const sanitized: Record<string, unknown> = { ...(parsed.data as Record<string, unknown>) }
  if ((type === "text" || type === "html") && typeof sanitized.content === "string") {
    sanitized.content = sanitizeWidgetHtml(sanitized.content)
  }
  return sanitized
}

/** Computes the next bottom-of-grid `{x, y}` for a new widget on one breakpoint tier — the row after the lowest existing widget. */
async function computeDefaultPosition(
  tx: TransactionClient,
  dashboardId: string,
  breakpoint: "desktop" | "tablet" | "mobile",
): Promise<{ x: number; y: number }> {
  const existing = await tx.widgetLayout.findMany({
    where: { breakpoint, widget: { dashboardId } },
    select: { y: true, h: true },
  })
  const maxBottom = existing.reduce((max, row) => Math.max(max, row.y + row.h), 0)
  return { x: 0, y: maxBottom }
}

export interface AddWidgetInput {
  type: WidgetTypeInput
  title?: string
  dataSourceType?: string
  dataSourceId?: string
  config: Record<string, unknown>
  layout?: { x: number; y: number; w: number; h: number }[]
}

/** Adds a widget to a dashboard (FR-005/FR-006), assigning a default per-breakpoint layout when none is supplied. */
export async function addWidget(
  dashboardId: string,
  userId: string,
  input: AddWidgetInput,
): Promise<{ widget: DashboardWidgetRecord; layout: WidgetLayoutRecord[] }> {
  await assertDashboardPermission(dashboardId, userId, "edit")

  const config = validateAndSanitizeConfig(input.type, input.config)

  const { widget, layouts } = await prismaClient.$transaction(async (tx) => {
    const createdWidget = await tx.dashboardWidget.create({
      data: {
        dashboardId,
        type: input.type,
        title: input.title,
        dataSourceType: input.dataSourceType,
        dataSourceId: input.dataSourceId,
        config: config as Prisma.InputJsonValue,
      },
    })

    const breakpoints: ("desktop" | "tablet" | "mobile")[] = ["desktop", "tablet", "mobile"]
    const createdLayouts = []
    for (const breakpoint of breakpoints) {
      const explicit = input.layout?.[0]
      const position = explicit ? { x: explicit.x, y: explicit.y } : await computeDefaultPosition(tx, dashboardId, breakpoint)
      const size = explicit ? { w: explicit.w, h: explicit.h } : DEFAULT_WIDGET_SIZE
      const w = Math.min(size.w, GRID_COLUMNS[breakpoint])

      const layout = await tx.widgetLayout.create({
        data: { widgetId: createdWidget.id, breakpoint, x: position.x, y: position.y, w, h: size.h },
      })
      createdLayouts.push(layout)
    }

    return { widget: createdWidget, layouts: createdLayouts }
  })

  return { widget: toWidgetRecord(widget), layout: layouts.map(toLayoutRecord) }
}

export interface UpdateWidgetInput {
  title?: string | null
  dataSourceType?: string | null
  dataSourceId?: string | null
  config?: Record<string, unknown>
  groupId?: string | null
  isCollapsed?: boolean
}

/** Updates a widget's fields — re-validates and re-sanitizes `config` on every update, not just creation. */
export async function updateWidget(
  widgetId: string,
  userId: string,
  input: UpdateWidgetInput,
): Promise<DashboardWidgetRecord> {
  const existing = await prismaClient.dashboardWidget.findUnique({ where: { id: widgetId } })
  if (!existing) {
    throw new NotFoundError(`No widget found with id "${widgetId}".`)
  }
  await assertDashboardPermission(existing.dashboardId, userId, "edit")

  if (input.groupId) {
    const group = await prismaClient.dashboardWidget.findUnique({ where: { id: input.groupId } })
    if (!group || group.dashboardId !== existing.dashboardId) {
      throw new ValidationError("groupId must reference a widget on the same dashboard.")
    }
  }

  const config = input.config !== undefined ? validateAndSanitizeConfig(existing.type as WidgetTypeInput, input.config) : undefined

  const row = await prismaClient.dashboardWidget.update({
    where: { id: widgetId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.dataSourceType !== undefined ? { dataSourceType: input.dataSourceType } : {}),
      ...(input.dataSourceId !== undefined ? { dataSourceId: input.dataSourceId } : {}),
      ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
      ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
      ...(input.isCollapsed !== undefined ? { isCollapsed: input.isCollapsed } : {}),
    },
  })
  return toWidgetRecord(row)
}

/** Removes a widget — `WidgetLayout`/`DashboardFilter` rows cascade per schema. */
export async function deleteWidget(widgetId: string, userId: string): Promise<void> {
  const existing = await prismaClient.dashboardWidget.findUnique({ where: { id: widgetId } })
  if (!existing) {
    throw new NotFoundError(`No widget found with id "${widgetId}".`)
  }
  await assertDashboardPermission(existing.dashboardId, userId, "edit")
  await prismaClient.dashboardWidget.delete({ where: { id: widgetId } })
}

export interface SaveLayoutInput {
  breakpoint: "desktop" | "tablet" | "mobile"
  items: { widgetId: string; x: number; y: number; w: number; h: number }[]
}

/** Whole-tier replace inside one transaction (FR-008/FR-009) — the atomic unit that makes concurrent-edit resolution well-defined ("last-write-wins per save"). */
export async function saveLayout(
  dashboardId: string,
  userId: string,
  input: SaveLayoutInput,
): Promise<WidgetLayoutRecord[]> {
  await assertDashboardPermission(dashboardId, userId, "edit")

  const widgetIds = input.items.map((item) => item.widgetId)
  const owned = await prismaClient.dashboardWidget.findMany({
    where: { id: { in: widgetIds }, dashboardId },
    select: { id: true },
  })
  if (owned.length !== new Set(widgetIds).size) {
    throw new ValidationError("layout items reference a widget that does not belong to this dashboard.")
  }

  const rows = await prismaClient.$transaction(async (tx) => {
    const result = []
    for (const item of input.items) {
      const layout = await tx.widgetLayout.upsert({
        where: { widgetId_breakpoint: { widgetId: item.widgetId, breakpoint: input.breakpoint } },
        update: { x: item.x, y: item.y, w: item.w, h: item.h },
        create: { widgetId: item.widgetId, breakpoint: input.breakpoint, x: item.x, y: item.y, w: item.w, h: item.h },
      })
      result.push(layout)
    }
    return result
  })

  return rows.map(toLayoutRecord)
}

/**
 * Resolves one widget's current data, dispatching by `dataSourceType`
 * (repository-api.md). Delegates to the repository that already owns each
 * data source rather than duplicating any of their query logic (research.md
 * Decision 5). A deleted/unresolvable data source returns
 * `{ dataSourceUnavailable: true }` — data, not a thrown error (research.md
 * Decision 13, FR-040).
 *
 * `scopingProjectOwnerId` (the dashboard's project owner) is used — never
 * `userId` — to call into `featureRepository`/`analysisRepository`, both of
 * which check plain project membership internally. A caller reaching this
 * function has already passed `assertDashboardPermission` above, which
 * independently accounts for `DashboardShare`/public-visibility broadening
 * (research.md Decision 7) that those two untouched repositories don't know
 * about; the project owner's id trivially satisfies their membership check
 * without duplicating that logic here.
 */
export async function resolveWidgetData(
  dashboardId: string,
  widgetId: string,
  userId: string,
): Promise<WidgetDataResult> {
  await assertDashboardPermission(dashboardId, userId, "view")

  const widget = await prismaClient.dashboardWidget.findUnique({ where: { id: widgetId } })
  if (!widget || widget.dashboardId !== dashboardId) {
    throw new NotFoundError(`No widget found with id "${widgetId}" on this dashboard.`)
  }

  if (NON_DATA_DRIVEN_TYPES.has(widget.type) || !widget.dataSourceType) {
    return { dataSourceUnavailable: false, data: widget.config }
  }

  const dashboard = await prismaClient.dashboard.findUnique({
    where: { id: dashboardId },
    select: { projectId: true },
  })
  if (!dashboard) {
    return { dataSourceUnavailable: true }
  }
  const project = await prismaClient.project.findUnique({
    where: { id: dashboard.projectId },
    select: { ownerId: true },
  })
  if (!project) {
    return { dataSourceUnavailable: true }
  }
  const scopingProjectOwnerId = project.ownerId

  try {
    switch (widget.dataSourceType) {
      case "layer": {
        if (!widget.dataSourceId) return { dataSourceUnavailable: true }
        const result = await listFeaturesForLayer(widget.dataSourceId, scopingProjectOwnerId, {})
        return { dataSourceUnavailable: false, data: result }
      }
      case "analysisRun": {
        if (!widget.dataSourceId) return { dataSourceUnavailable: true }
        const run = await getAnalysisRunById(widget.dataSourceId, scopingProjectOwnerId)
        if (!run) return { dataSourceUnavailable: true }
        return { dataSourceUnavailable: false, data: run }
      }
      case "projectStats":
      case "layerStats":
      case "featureStats": {
        const snapshot = await getSnapshot(dashboard.projectId, widget.dataSourceType, widget.dataSourceId ?? undefined)
        return { dataSourceUnavailable: false, data: snapshot }
      }
      case "activity": {
        const result = await listActivityForProject(dashboard.projectId, {})
        return { dataSourceUnavailable: false, data: result }
      }
      case "systemStats":
      case "storageStats": {
        const snapshot = await getSnapshot(dashboard.projectId, widget.dataSourceType)
        return { dataSourceUnavailable: false, data: snapshot }
      }
      default:
        return { dataSourceUnavailable: true }
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { dataSourceUnavailable: true }
    }
    throw error
  }
}
