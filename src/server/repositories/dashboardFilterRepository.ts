import { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertDashboardPermission } from "@/server/repositories/dashboardShareRepository"
import { filterConfigSchemaFor, type FilterTypeInput } from "@/shared/contracts/dashboardFilter.schema"
import { NotFoundError, ValidationError } from "@/shared/errors/apiError"
import type { DashboardFilterRecord } from "@/features/dashboards/types/dashboard.types"

function toRecord(row: {
  id: string
  dashboardId: string
  widgetId: string | null
  filterType: string
  config: unknown
  createdAt: Date
  updatedAt: Date
}): DashboardFilterRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    widgetId: row.widgetId,
    filterType: row.filterType as DashboardFilterRecord["filterType"],
    config: row.config,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Lists every filter (global and widget-scoped) on a dashboard. */
export async function listFilters(dashboardId: string, userId: string): Promise<DashboardFilterRecord[]> {
  await assertDashboardPermission(dashboardId, userId, "view")
  const rows = await prismaClient.dashboardFilter.findMany({ where: { dashboardId }, orderBy: { createdAt: "asc" } })
  return rows.map(toRecord)
}

export interface CreateFilterInput {
  widgetId?: string
  filterType: FilterTypeInput
  config: Record<string, unknown>
}

/** Creates a global (no `widgetId`) or widget-scoped filter (US6/FR-020/FR-021). A spatial filter's geometry passes `ST_IsValid` before persistence (Constitution Principle IV). */
export async function createFilter(
  dashboardId: string,
  userId: string,
  input: CreateFilterInput,
): Promise<DashboardFilterRecord> {
  // Filters are a viewer-facing concern (client-api.md's `dashboardFilterStore`
  // doc) — any user who can view the dashboard may set filters, not just
  // editors.
  await assertDashboardPermission(dashboardId, userId, "view")

  if (input.widgetId) {
    const widget = await prismaClient.dashboardWidget.findUnique({ where: { id: input.widgetId } })
    if (!widget || widget.dashboardId !== dashboardId) {
      throw new ValidationError("widgetId must reference a widget on this dashboard.")
    }
  }

  const schema = filterConfigSchemaFor(input.filterType)
  const parsed = schema.safeParse(input.config)
  if (!parsed.success) {
    throw new ValidationError(`Invalid config for filter type "${input.filterType}": ${parsed.error.message}`)
  }

  if (input.filterType === "spatial") {
    const geometry = (parsed.data as { geometry: unknown }).geometry
    const [{ valid }] = await prismaClient.$queryRaw<{ valid: boolean }[]>`
      SELECT ST_IsValid(ST_GeomFromGeoJSON(${JSON.stringify(geometry)})) AS valid
    `
    if (!valid) {
      throw new ValidationError("The submitted filter geometry is not valid.")
    }
  }

  const row = await prismaClient.dashboardFilter.create({
    data: {
      dashboardId,
      widgetId: input.widgetId ?? null,
      filterType: input.filterType,
      config: parsed.data as Prisma.InputJsonValue,
    },
  })
  return toRecord(row)
}

/** Removes a filter. */
export async function deleteFilter(filterId: string, userId: string): Promise<void> {
  const existing = await prismaClient.dashboardFilter.findUnique({ where: { id: filterId } })
  if (!existing) {
    throw new NotFoundError(`No filter found with id "${filterId}".`)
  }
  await assertDashboardPermission(existing.dashboardId, userId, "view")
  await prismaClient.dashboardFilter.delete({ where: { id: filterId } })
}
