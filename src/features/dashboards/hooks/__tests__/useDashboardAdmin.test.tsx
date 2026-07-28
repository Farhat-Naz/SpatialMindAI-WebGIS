import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDashboardAdminOverview, useDashboardAuditLog } from "../useDashboardAdmin"
import { dashboardAdminService } from "../../services/dashboardAdminService"

vi.mock("../../services/dashboardAdminService", () => ({
  dashboardAdminService: { getAdminOverview: vi.fn(), listAuditLog: vi.fn() },
}))

const mockedService = vi.mocked(dashboardAdminService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

/** T331/T332 gap-fill — `useDashboardAdmin.ts` (US10/Phase 16) had no direct hook test. */
describe("useDashboardAdmin hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useDashboardAdminOverview: fetches the project's admin overview", async () => {
    mockedService.getAdminOverview.mockResolvedValue({ dashboards: [], usage: { activityCountByDashboard: [], mostUsedWidgetTypes: [] } })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboardAdminOverview("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.getAdminOverview).toHaveBeenCalledWith("p1")
  })

  it("useDashboardAdminOverview: does not retry on failure (a non-Owner's 403 should surface immediately, T288)", async () => {
    mockedService.getAdminOverview.mockRejectedValue(new Error("Forbidden"))
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboardAdminOverview("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockedService.getAdminOverview).toHaveBeenCalledTimes(1)
  })

  it("useDashboardAuditLog: fetches the dashboard-scoped audit log with params", async () => {
    mockedService.listAuditLog.mockResolvedValue({ activities: [], nextCursor: null })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboardAuditLog("p1", { cursor: "c1" }), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.listAuditLog).toHaveBeenCalledWith("p1", { cursor: "c1" })
  })
})
