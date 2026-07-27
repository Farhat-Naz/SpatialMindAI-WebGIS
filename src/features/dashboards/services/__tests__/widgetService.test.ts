import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { widgetService } from "../widgetService"

const fetchMock = vi.fn()

function respondWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status })),
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  respondWith({})
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function lastCall(): { url: string; init: RequestInit } {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init }
}

describe("widgetService", () => {
  it("addWidget: POSTs to the dashboard's widgets endpoint", async () => {
    await widgetService.addWidget("dash-1", { type: "text", config: { content: "hi" } })
    const { url, init } = lastCall()
    expect(url).toBe("/api/dashboards/dash-1/widgets")
    expect(init.method).toBe("POST")
  })

  it("updateWidget: PATCHes the widget directly (no dashboardId prefix)", async () => {
    await widgetService.updateWidget("widget-1", { title: "New" })
    const { url, init } = lastCall()
    expect(url).toBe("/api/widgets/widget-1")
    expect(init.method).toBe("PATCH")
  })

  it("deleteWidget: DELETEs the widget", async () => {
    respondWith(null, 204)
    await widgetService.deleteWidget("widget-1")
    const { url, init } = lastCall()
    expect(url).toBe("/api/widgets/widget-1")
    expect(init.method).toBe("DELETE")
  })

  it("getWidgetData: GETs the widget's data endpoint", async () => {
    await widgetService.getWidgetData("dash-1", "widget-1")
    const { url } = lastCall()
    expect(url).toBe("/api/dashboards/dash-1/widgets/widget-1/data")
  })

  it("saveLayout: PUTs the dashboard's layout endpoint", async () => {
    await widgetService.saveLayout("dash-1", {
      breakpoint: "desktop",
      items: [{ widgetId: "w1", x: 0, y: 0, w: 4, h: 4 }],
    })
    const { url, init } = lastCall()
    expect(url).toBe("/api/dashboards/dash-1/layout")
    expect(init.method).toBe("PUT")
  })
})
