import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard } from "@/server/repositories/dashboardRepository"
import { grantShare } from "@/server/repositories/dashboardShareRepository"
import {
  addWidget,
  deleteWidget,
  resolveWidgetData,
  saveLayout,
  updateWidget,
} from "@/server/repositories/widgetRepository"
import { TEST_COLLABORATOR_ID, TEST_OWNER_ID, ensureTestCollaborator, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("widgetRepository", () => {
  let projectId: string
  let dashboardId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Widget Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const layer = await prismaClient.layer.create({ data: { projectId, name: "L1", order: 0 } })
    layerId = layer.id

    const dashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: `Dash ${Date.now()}` })
    dashboardId = dashboard.id
  }, 15000)

  it("addWidget: assigns a default per-breakpoint layout when none is supplied", async () => {
    const { widget, layout } = await addWidget(dashboardId, TEST_OWNER_ID, {
      type: "metricCard",
      dataSourceType: "layer",
      dataSourceId: layerId,
      config: { statType: "featureCount" },
    })
    expect(widget.type).toBe("metricCard")
    expect(layout.map((l) => l.breakpoint).sort()).toEqual(["desktop", "mobile", "tablet"])
  })

  it("addWidget: rejects a config that fails its type-specific schema", async () => {
    await expect(
      addWidget(dashboardId, TEST_OWNER_ID, { type: "gauge", config: { statType: "featureCount" } }),
    ).rejects.toThrow()
  })

  it("addWidget: sanitizes HTML content before storage (FR-007)", async () => {
    const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
      type: "html",
      config: { content: '<p>hi</p><script>alert(1)</script>' },
    })
    expect(JSON.stringify(widget.config)).not.toContain("<script")
  })

  it("updateWidget: re-sanitizes on every content update", async () => {
    const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, { type: "text", config: { content: "clean" } })
    const updated = await updateWidget(widget.id, TEST_OWNER_ID, {
      config: { content: '<img src=x onerror="alert(1)">' },
    })
    expect(JSON.stringify(updated.config)).not.toContain("onerror")
  })

  it("deleteWidget: cascades its WidgetLayout rows", async () => {
    const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, { type: "text", config: { content: "x" } })
    await deleteWidget(widget.id, TEST_OWNER_ID)
    const layouts = await prismaClient.widgetLayout.findMany({ where: { widgetId: widget.id } })
    expect(layouts).toHaveLength(0)
  })

  it("saveLayout: whole-tier replace persists new positions", async () => {
    const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, { type: "text", config: { content: "x" } })
    const result = await saveLayout(dashboardId, TEST_OWNER_ID, {
      breakpoint: "desktop",
      items: [{ widgetId: widget.id, x: 3, y: 5, w: 6, h: 2 }],
    })
    expect(result[0]).toMatchObject({ x: 3, y: 5, w: 6, h: 2 })
  })

  it("saveLayout: rejects a widgetId that does not belong to this dashboard before any write", async () => {
    const otherDashboard = await createDashboard(projectId, TEST_OWNER_ID, { name: "Other" })
    const { widget: foreignWidget } = await addWidget(otherDashboard.id, TEST_OWNER_ID, {
      type: "text",
      config: { content: "x" },
    })

    await expect(
      saveLayout(dashboardId, TEST_OWNER_ID, {
        breakpoint: "desktop",
        items: [{ widgetId: foreignWidget.id, x: 0, y: 0, w: 4, h: 4 }],
      }),
    ).rejects.toThrow()
  })

  it("resolveWidgetData: returns dataSourceUnavailable for a deleted layer, not a thrown error", async () => {
    const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
      type: "table",
      dataSourceType: "layer",
      dataSourceId: "nonexistent-layer-id",
      config: {},
    })
    const result = await resolveWidgetData(dashboardId, widget.id, TEST_OWNER_ID)
    expect(result.dataSourceUnavailable).toBe(true)
  })

  it("resolveWidgetData: a share-only viewer (no base project role) can still resolve widget data", async () => {
    await grantShare(dashboardId, TEST_OWNER_ID, { userId: TEST_COLLABORATOR_ID, permission: "view" })
    const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
      type: "statistics",
      dataSourceType: "layerStats",
      dataSourceId: layerId,
      config: { statType: "featureCount" },
    })

    const result = await resolveWidgetData(dashboardId, widget.id, TEST_COLLABORATOR_ID)
    expect(result.dataSourceUnavailable).toBe(false)
  })
})
