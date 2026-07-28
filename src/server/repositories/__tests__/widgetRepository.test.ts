import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createDashboard } from "@/server/repositories/dashboardRepository"
import { grantShare } from "@/server/repositories/dashboardShareRepository"
import { createFeature } from "@/server/repositories/featureRepository"
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

  describe("resolveWidgetData — US6/T248/T250/T253 filter application (a layer-sourced widget)", () => {
    it("date filter: narrows to features created within the range", async () => {
      await createFeature(layerId, TEST_OWNER_ID, { geometry: { type: "Point", coordinates: [1, 1] } })
      const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
        type: "table",
        dataSourceType: "layer",
        dataSourceId: layerId,
        config: {},
      })

      const future = new Date(Date.now() + 60_000).toISOString()
      const result = await resolveWidgetData(dashboardId, widget.id, TEST_OWNER_ID, [
        { filterType: "date", config: { from: future } },
      ])

      expect(result.dataSourceUnavailable).toBe(false)
      if (!result.dataSourceUnavailable) {
        expect((result.data as { features: unknown[] }).features).toHaveLength(0)
        expect(result.filteredEmpty).toBe(true)
      }
    })

    it("layer filter: a widget bound to a layer excluded from the filter shows filteredEmpty, not unavailable", async () => {
      await createFeature(layerId, TEST_OWNER_ID, { geometry: { type: "Point", coordinates: [1, 1] } })
      const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
        type: "table",
        dataSourceType: "layer",
        dataSourceId: layerId,
        config: {},
      })

      const result = await resolveWidgetData(dashboardId, widget.id, TEST_OWNER_ID, [
        { filterType: "layer", config: { layerIds: ["some-other-layer-id"] } },
      ])

      expect(result.dataSourceUnavailable).toBe(false)
      if (!result.dataSourceUnavailable) {
        expect((result.data as { features: unknown[] }).features).toHaveLength(0)
        expect(result.filteredEmpty).toBe(true)
      }
    })

    it("attribute filter: only features matching the operator/value are returned", async () => {
      await createFeature(layerId, TEST_OWNER_ID, {
        geometry: { type: "Point", coordinates: [1, 1] },
        attributes: [{ key: "status", value: "open" }],
      })
      await createFeature(layerId, TEST_OWNER_ID, {
        geometry: { type: "Point", coordinates: [2, 2] },
        attributes: [{ key: "status", value: "closed" }],
      })
      const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
        type: "table",
        dataSourceType: "layer",
        dataSourceId: layerId,
        config: {},
      })

      const result = await resolveWidgetData(dashboardId, widget.id, TEST_OWNER_ID, [
        { filterType: "attribute", config: { key: "status", operator: "eq", value: "open" } },
      ])

      expect(result.dataSourceUnavailable).toBe(false)
      if (!result.dataSourceUnavailable) {
        expect((result.data as { features: unknown[] }).features).toHaveLength(1)
        expect(result.filteredEmpty).toBeUndefined()
      }
    })

    it("spatial filter: only features intersecting the drawn geometry are returned", async () => {
      await createFeature(layerId, TEST_OWNER_ID, { geometry: { type: "Point", coordinates: [1, 1] } })
      await createFeature(layerId, TEST_OWNER_ID, { geometry: { type: "Point", coordinates: [50, 50] } })
      const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
        type: "table",
        dataSourceType: "layer",
        dataSourceId: layerId,
        config: {},
      })

      const result = await resolveWidgetData(dashboardId, widget.id, TEST_OWNER_ID, [
        {
          filterType: "spatial",
          config: {
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [0, 0],
                  [2, 0],
                  [2, 2],
                  [0, 2],
                  [0, 0],
                ],
              ],
            },
          },
        },
      ])

      expect(result.dataSourceUnavailable).toBe(false)
      if (!result.dataSourceUnavailable) {
        expect((result.data as { features: unknown[] }).features).toHaveLength(1)
      }
    })

    it("no active filters: behaves exactly as before (all features returned, filteredEmpty absent)", async () => {
      await createFeature(layerId, TEST_OWNER_ID, { geometry: { type: "Point", coordinates: [1, 1] } })
      const { widget } = await addWidget(dashboardId, TEST_OWNER_ID, {
        type: "table",
        dataSourceType: "layer",
        dataSourceId: layerId,
        config: {},
      })

      const result = await resolveWidgetData(dashboardId, widget.id, TEST_OWNER_ID)

      expect(result.dataSourceUnavailable).toBe(false)
      if (!result.dataSourceUnavailable) {
        expect((result.data as { features: unknown[] }).features).toHaveLength(1)
        expect(result.filteredEmpty).toBeUndefined()
      }
    })
  })
})
