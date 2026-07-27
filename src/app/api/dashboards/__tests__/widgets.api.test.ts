import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { POST as CREATE_DASHBOARD } from "@/app/api/projects/[projectId]/dashboards/route"
import { POST as ADD_WIDGET } from "@/app/api/dashboards/[dashboardId]/widgets/route"
import { DELETE as DELETE_WIDGET, PATCH as PATCH_WIDGET } from "@/app/api/widgets/[widgetId]/route"
import { GET as GET_WIDGET_DATA } from "@/app/api/dashboards/[dashboardId]/widgets/[widgetId]/data/route"
import { PUT as SAVE_LAYOUT } from "@/app/api/dashboards/[dashboardId]/layout/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Widgets API", () => {
  let projectId: string
  let dashboardId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({ data: { ownerId: TEST_OWNER_ID, name: `Widgets API ${Date.now()}` } })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const created = await CREATE_DASHBOARD(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Widget Host" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    dashboardId = (await created.json()).dashboard.id
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST adds a widget with a default per-breakpoint layout", async () => {
    const response = await ADD_WIDGET(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/widgets`, "POST", {
        type: "text",
        config: { content: "hello" },
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(response.status).toBe(201)
    const { widget, layout } = await response.json()
    expect(widget.type).toBe("text")
    expect(layout).toHaveLength(3)
  })

  it("POST returns 400 INVALID_INPUT before any write when config fails its type-specific schema", async () => {
    const before = await prismaClient.dashboardWidget.count({ where: { dashboardId } })
    const response = await ADD_WIDGET(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/widgets`, "POST", {
        type: "gauge",
        config: {},
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(response.status).toBe(400)
    const after = await prismaClient.dashboardWidget.count({ where: { dashboardId } })
    expect(after).toBe(before)
  })

  it("PATCH updates a widget, DELETE removes it", async () => {
    const created = await ADD_WIDGET(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/widgets`, "POST", {
        type: "text",
        config: { content: "before" },
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    const { widget } = await created.json()

    const patched = await PATCH_WIDGET(
      jsonRequest(`http://localhost/api/widgets/${widget.id}`, "PATCH", { title: "New Title" }) as never,
      { params: Promise.resolve({ widgetId: widget.id }) },
    )
    expect(patched.status).toBe(200)
    expect((await patched.json()).widget.title).toBe("New Title")

    const deleted = await DELETE_WIDGET(jsonRequest(`http://localhost/api/widgets/${widget.id}`, "DELETE") as never, {
      params: Promise.resolve({ widgetId: widget.id }),
    })
    expect(deleted.status).toBe(204)
  })

  it("GET widget data returns 200 with dataSourceUnavailable, never a 4xx, for a deleted source", async () => {
    const created = await ADD_WIDGET(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/widgets`, "POST", {
        type: "table",
        dataSourceType: "layer",
        dataSourceId: "nonexistent-layer",
        config: {},
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    const { widget } = await created.json()

    const response = await GET_WIDGET_DATA(
      new Request(`http://localhost/api/dashboards/${dashboardId}/widgets/${widget.id}/data`) as never,
      { params: Promise.resolve({ dashboardId, widgetId: widget.id }) },
    )
    expect(response.status).toBe(200)
    expect((await response.json()).dataSourceUnavailable).toBe(true)
  })

  it("PUT layout rejects a batch referencing a foreign widgetId as INVALID_INPUT before any write", async () => {
    const otherDashboard = await CREATE_DASHBOARD(
      jsonRequest(`http://localhost/api/projects/${projectId}/dashboards`, "POST", { name: "Other" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const otherDashboardId = (await otherDashboard.json()).dashboard.id
    const foreignWidget = await ADD_WIDGET(
      jsonRequest(`http://localhost/api/dashboards/${otherDashboardId}/widgets`, "POST", {
        type: "text",
        config: { content: "x" },
      }) as never,
      { params: Promise.resolve({ dashboardId: otherDashboardId }) },
    )
    const { widget: foreignWidgetRow } = await foreignWidget.json()

    const response = await SAVE_LAYOUT(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/layout`, "PUT", {
        breakpoint: "desktop",
        items: [{ widgetId: foreignWidgetRow.id, x: 0, y: 0, w: 4, h: 4 }],
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })

  it("PUT layout persists new positions", async () => {
    const created = await ADD_WIDGET(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/widgets`, "POST", {
        type: "text",
        config: { content: "x" },
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    const { widget } = await created.json()

    const response = await SAVE_LAYOUT(
      jsonRequest(`http://localhost/api/dashboards/${dashboardId}/layout`, "PUT", {
        breakpoint: "desktop",
        items: [{ widgetId: widget.id, x: 2, y: 2, w: 3, h: 3 }],
      }) as never,
      { params: Promise.resolve({ dashboardId }) },
    )
    expect(response.status).toBe(200)
    const { layout } = await response.json()
    expect(layout[0]).toMatchObject({ x: 2, y: 2, w: 3, h: 3 })
  })
})
