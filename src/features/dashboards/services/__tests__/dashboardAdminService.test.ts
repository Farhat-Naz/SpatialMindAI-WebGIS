import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardAdminService } from "../dashboardAdminService"

const fetchMock = vi.fn()

function respondWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
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

/** T329/T330 gap-fill — `dashboardAdminService.ts` (US10/Phase 16) had no direct test. */
describe("dashboardAdminService", () => {
  it("getAdminOverview: GETs the project's admin overview endpoint", async () => {
    await dashboardAdminService.getAdminOverview("p1")
    const { url } = lastCall()
    expect(url).toBe("/api/projects/p1/dashboards/admin")
  })

  it("listAuditLog: GETs the audit log endpoint with no query when no params given", async () => {
    await dashboardAdminService.listAuditLog("p1")
    const { url } = lastCall()
    expect(url).toBe("/api/projects/p1/dashboards/admin/audit")
  })

  it("listAuditLog: encodes cursor/limit as query params", async () => {
    await dashboardAdminService.listAuditLog("p1", { cursor: "c1", limit: 10 })
    const { url } = lastCall()
    expect(url).toBe("/api/projects/p1/dashboards/admin/audit?cursor=c1&limit=10")
  })
})
