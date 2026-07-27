import { Prisma, PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * A `widgetsBlueprint` entry (data-model.md `DashboardTemplate.widgetsBlueprint`)
 * — `dataSourceId` is deliberately absent: a template is platform-wide and
 * cannot pin a specific `Layer.id`. A blueprint widget with a `dataSourceType`
 * but no `dataSourceId` renders its FR-040 "data source unavailable" state
 * (research.md Decision 13) until the user binds it to a real layer, which is
 * the intended first step after creating a dashboard from a template.
 */
interface BlueprintWidget {
  type: string
  title?: string
  dataSourceType?: string
  config: Record<string, unknown>
  layout: { desktop: { x: number; y: number; w: number; h: number } }
}

const DASHBOARD_TEMPLATES: { key: string; name: string; description: string; widgets: BlueprintWidget[] }[] = [
  { key: "blank", name: "Blank", description: "An empty dashboard — add widgets one at a time.", widgets: [] },
  {
    key: "executive",
    name: "Executive",
    description: "A high-level summary: key metrics and a project-wide chart.",
    widgets: [
      {
        type: "metricCard",
        title: "Total Features",
        dataSourceType: "projectStats",
        config: { statType: "featureCount" },
        layout: { desktop: { x: 0, y: 0, w: 3, h: 2 } },
      },
      {
        type: "chartBar",
        title: "Features by Layer",
        dataSourceType: "layerStats",
        config: {},
        layout: { desktop: { x: 3, y: 0, w: 6, h: 4 } },
      },
      {
        type: "table",
        title: "Recent Activity",
        dataSourceType: "activity",
        config: {},
        layout: { desktop: { x: 0, y: 2, w: 3, h: 4 } },
      },
    ],
  },
  {
    key: "operations",
    name: "Operations",
    description: "A working view: the map alongside live layer statistics.",
    widgets: [
      { type: "map", title: "Map", config: {}, layout: { desktop: { x: 0, y: 0, w: 8, h: 6 } } },
      {
        type: "statistics",
        title: "Feature Count",
        dataSourceType: "layerStats",
        config: { statType: "featureCount" },
        layout: { desktop: { x: 8, y: 0, w: 4, h: 3 } },
      },
      {
        type: "table",
        title: "Layer Data",
        dataSourceType: "layer",
        config: {},
        layout: { desktop: { x: 8, y: 3, w: 4, h: 3 } },
      },
    ],
  },
  {
    key: "asset",
    name: "Asset",
    description: "A map widget and a table widget bound to a feature layer (spec.md US8).",
    widgets: [
      { type: "map", title: "Assets", dataSourceType: "layer", config: {}, layout: { desktop: { x: 0, y: 0, w: 7, h: 6 } } },
      {
        type: "table",
        title: "Asset Attributes",
        dataSourceType: "layer",
        config: {},
        layout: { desktop: { x: 7, y: 0, w: 5, h: 6 } },
      },
    ],
  },
  {
    key: "environmental",
    name: "Environmental",
    description: "Area/extent gauges and a trend chart for environmental monitoring.",
    widgets: [
      { type: "map", title: "Map", config: {}, layout: { desktop: { x: 0, y: 0, w: 6, h: 6 } } },
      {
        type: "gauge",
        title: "Average Area",
        dataSourceType: "layerStats",
        config: { statType: "averageArea", min: 0, max: 100 },
        layout: { desktop: { x: 6, y: 0, w: 3, h: 3 } },
      },
      {
        type: "chartLine",
        title: "Trend",
        dataSourceType: "layerStats",
        config: {},
        layout: { desktop: { x: 6, y: 3, w: 6, h: 3 } },
      },
    ],
  },
]

/** Idempotently upserts the five built-in `DashboardTemplate` rows (US8/FR-028). */
async function seedDashboardTemplates(): Promise<void> {
  for (const template of DASHBOARD_TEMPLATES) {
    await prisma.dashboardTemplate.upsert({
      where: { key: template.key },
      update: {
        name: template.name,
        description: template.description,
        widgetsBlueprint: template.widgets as unknown as Prisma.InputJsonValue,
      },
      create: {
        key: template.key,
        name: template.name,
        description: template.description,
        widgetsBlueprint: template.widgets as unknown as Prisma.InputJsonValue,
      },
    })
  }
}

/**
 * Seeds a User row matching DEV_USER_ID (the interim authentication seam,
 * Research Decision 6), plus a second collaborator User row matching
 * DEV_COLLABORATOR_USER_ID if set (specs/006-collaboration's quickstart.md
 * Prerequisites — every multi-user scenario needs a real second seeded
 * user). Idempotent via `upsert` on the primary key — running this script
 * any number of times never creates a duplicate or errors.
 */
async function main() {
  const devUserId = process.env.DEV_USER_ID

  if (!devUserId) {
    throw new Error(
      "DEV_USER_ID must be set (see .env.example) to run the seed script.",
    )
  }

  await prisma.user.upsert({
    where: { id: devUserId },
    update: {},
    create: {
      id: devUserId,
      email: `${devUserId}@dev.local`,
    },
  })

  const devCollaboratorUserId = process.env.DEV_COLLABORATOR_USER_ID
  if (devCollaboratorUserId) {
    await prisma.user.upsert({
      where: { id: devCollaboratorUserId },
      update: {},
      create: {
        id: devCollaboratorUserId,
        email: `${devCollaboratorUserId}@dev.local`,
      },
    })
  }

  // specs/008-dashboard-analytics (US8) — platform-wide, not project-scoped,
  // so unlike a sample dashboard/report these five rows are safe to seed
  // unconditionally (T030). T031's sample dashboard/widget/report fixtures
  // are not seeded here: this script seeds no sample Project/Layer for them
  // to attach to (every existing feature's seed data is limited to Users),
  // so quickstart.md's walkthrough creates that starting data interactively
  // instead of relying on a seeded fixture that would need its own project.
  await seedDashboardTemplates()
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
