import { prismaClient } from "@/server/db/prismaClient"
import type { DashboardTemplateRecord } from "@/features/dashboards/types/dashboard.types"

/** Lists the platform-wide dashboard templates (US8) — no project scoping, no auth beyond a resolved user (api-contracts.md). */
export async function listTemplates(): Promise<DashboardTemplateRecord[]> {
  const rows = await prismaClient.dashboardTemplate.findMany({ orderBy: { name: "asc" } })
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    widgetsBlueprint: row.widgetsBlueprint,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}
