import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../dashboardService"

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

describe("dashboardService", () => {
  it("listDashboards: GETs the project's dashboards, encoding params", async () => {
    await dashboardService.listDashboards("proj-1", { limit: 10, favoritesOnly: true })
    const { url, init } = lastCall()
    expect(url).toBe("/api/projects/proj-1/dashboards?limit=10&favoritesOnly=true")
    expect(init.method).toBeUndefined()
  })

  it("createDashboard: POSTs to the project's dashboards endpoint", async () => {
    await dashboardService.createDashboard("proj-1", { name: "Ops", templateId: "tpl-1" })
    const { url, init } = lastCall()
    expect(url).toBe("/api/projects/proj-1/dashboards")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({ name: "Ops", templateId: "tpl-1" })
  })

  it("renameDashboard: PATCHes name only", async () => {
    await dashboardService.renameDashboard("dash-1", "New Name")
    const { url, init } = lastCall()
    expect(url).toBe("/api/dashboards/dash-1")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({ name: "New Name" })
  })

  it("setVisibility: PATCHes visibility only", async () => {
    await dashboardService.setVisibility("dash-1", "public")
    const { init } = lastCall()
    expect(JSON.parse(init.body as string)).toEqual({ visibility: "public" })
  })

  it("deleteDashboard: DELETEs the dashboard", async () => {
    respondWith(null, 204)
    await dashboardService.deleteDashboard("dash-1")
    const { url, init } = lastCall()
    expect(url).toBe("/api/dashboards/dash-1")
    expect(init.method).toBe("DELETE")
  })

  it("duplicateDashboard: POSTs to the duplicate endpoint", async () => {
    await dashboardService.duplicateDashboard("dash-1")
    const { url, init } = lastCall()
    expect(url).toBe("/api/dashboards/dash-1/duplicate")
    expect(init.method).toBe("POST")
  })

  it("setFavorite(true): POSTs; setFavorite(false): DELETEs", async () => {
    await dashboardService.setFavorite("dash-1", true)
    expect(lastCall().init.method).toBe("POST")

    fetchMock.mockReset()
    respondWith({}, 200)
    await dashboardService.setFavorite("dash-1", false)
    expect(lastCall().init.method).toBe("DELETE")
  })

  it("listTemplates: GETs the platform-wide templates endpoint", async () => {
    await dashboardService.listTemplates()
    const { url } = lastCall()
    expect(url).toBe("/api/dashboard-templates")
  })
})
