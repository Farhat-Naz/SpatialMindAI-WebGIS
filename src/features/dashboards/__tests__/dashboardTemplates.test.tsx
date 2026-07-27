import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard } from "@/server/repositories/dashboardRepository"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"

/**
 * Each of the five built-in templates' blueprint (T231–T235) — creates its
 * own `DashboardTemplate` rows mirroring `prisma/seed.ts`'s definitions
 * rather than depending on the seed script having run against the test
 * database (`vitest.global-setup.ts` only applies migrations, not seed
 * data), so this test is self-contained and DB-realistic either way.
 */

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("Dashboard templates — blueprint instantiation", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Templates Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
  }, 15000)

  it("T231: Blank produces zero widgets, identical to a manual no-template create", async () => {
    const template = await prismaClient.dashboardTemplate.create({
      data: { key: `blank-${Date.now()}`, name: "Blank", widgetsBlueprint: [] },
    })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "From Blank", templateId: template.id })

    const widgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id } })
    expect(widgets).toHaveLength(0)
  })

  it("T232: Executive produces a Metric Card, a Statistics Widget, and an Activity-sourced widget", async () => {
    const template = await prismaClient.dashboardTemplate.create({
      data: {
        key: `executive-${Date.now()}`,
        name: "Executive",
        widgetsBlueprint: [
          { type: "metricCard", dataSourceType: "projectStats", config: { statType: "featureCount" }, layout: { desktop: { x: 0, y: 0, w: 3, h: 2 } } },
          { type: "statistics", dataSourceType: "projectStats", config: {}, layout: { desktop: { x: 3, y: 0, w: 6, h: 4 } } },
          { type: "table", dataSourceType: "activity", config: {}, layout: { desktop: { x: 0, y: 2, w: 3, h: 4 } } },
        ],
      },
    })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "From Executive", templateId: template.id })

    const widgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id } })
    expect(widgets.map((w) => w.type).sort()).toEqual(["metricCard", "statistics", "table"])
    expect(widgets.some((w) => w.dataSourceType === "activity")).toBe(true)
  })

  it("T233: Operations produces an Activity widget plus layer/feature statistics widgets", async () => {
    const template = await prismaClient.dashboardTemplate.create({
      data: {
        key: `operations-${Date.now()}`,
        name: "Operations",
        widgetsBlueprint: [
          { type: "table", dataSourceType: "activity", config: {}, layout: { desktop: { x: 0, y: 0, w: 6, h: 4 } } },
          { type: "statistics", dataSourceType: "layerStats", config: {}, layout: { desktop: { x: 6, y: 0, w: 3, h: 4 } } },
          { type: "statistics", dataSourceType: "featureStats", config: {}, layout: { desktop: { x: 9, y: 0, w: 3, h: 4 } } },
        ],
      },
    })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "From Operations", templateId: template.id })

    const widgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id } })
    const dataSourceTypes = widgets.map((w) => w.dataSourceType).sort()
    expect(dataSourceTypes).toEqual(["activity", "featureStats", "layerStats"])
  })

  it("T234: Environmental produces a Map Widget plus statistics/chart widgets", async () => {
    const template = await prismaClient.dashboardTemplate.create({
      data: {
        key: `environmental-${Date.now()}`,
        name: "Environmental",
        widgetsBlueprint: [
          { type: "map", config: {}, layout: { desktop: { x: 0, y: 0, w: 6, h: 6 } } },
          { type: "gauge", dataSourceType: "layerStats", config: { statType: "averageArea", min: 0, max: 100 }, layout: { desktop: { x: 6, y: 0, w: 3, h: 3 } } },
          { type: "chartLine", dataSourceType: "layerStats", config: {}, layout: { desktop: { x: 6, y: 3, w: 6, h: 3 } } },
        ],
      },
    })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "From Environmental", templateId: template.id })

    const widgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id } })
    expect(widgets.map((w) => w.type).sort()).toEqual(["chartLine", "gauge", "map"])
  })

  it("T235: Asset produces a Map Widget and a Table Widget, both layer-bound", async () => {
    const template = await prismaClient.dashboardTemplate.create({
      data: {
        key: `asset-${Date.now()}`,
        name: "Asset",
        widgetsBlueprint: [
          { type: "map", dataSourceType: "layer", config: {}, layout: { desktop: { x: 0, y: 0, w: 7, h: 6 } } },
          { type: "table", dataSourceType: "layer", config: {}, layout: { desktop: { x: 7, y: 0, w: 5, h: 6 } } },
        ],
      },
    })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "From Asset", templateId: template.id })

    const widgets = await prismaClient.dashboardWidget.findMany({ where: { dashboardId: dashboard.id } })
    expect(widgets.map((w) => w.type).sort()).toEqual(["map", "table"])
    expect(widgets.every((w) => w.dataSourceType === "layer")).toBe(true)
  })

  it("every blueprint widget gets a WidgetLayout row per breakpoint (T029-style default) inside the same atomic transaction", async () => {
    const template = await prismaClient.dashboardTemplate.create({
      data: {
        key: `asset-layout-${Date.now()}`,
        name: "Asset",
        widgetsBlueprint: [{ type: "map", config: {}, layout: { desktop: { x: 0, y: 0, w: 7, h: 6 } } }],
      },
    })
    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Layout Check", templateId: template.id })

    const widget = await prismaClient.dashboardWidget.findFirstOrThrow({ where: { dashboardId: dashboard.id } })
    const layouts = await prismaClient.widgetLayout.findMany({ where: { widgetId: widget.id } })
    expect(layouts.map((l) => l.breakpoint).sort()).toEqual(["desktop", "mobile", "tablet"])
  })
})
