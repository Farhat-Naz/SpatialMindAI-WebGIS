import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDashboardShares, useGrantShare, useRevokeShare } from "../useDashboardShares"
import { dashboardShareService } from "../../services/dashboardShareService"

vi.mock("../../services/dashboardShareService", () => ({
  dashboardShareService: { listShares: vi.fn(), grantShare: vi.fn(), revokeShare: vi.fn() },
}))

const mockedService = vi.mocked(dashboardShareService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

describe("useDashboardShares hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useDashboardShares lists share grants", async () => {
    mockedService.listShares.mockResolvedValue({ shares: [] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboardShares("d1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it("useGrantShare invalidates only the dashboard's own share list", async () => {
    mockedService.grantShare.mockResolvedValue({ share: {} as never })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useGrantShare("d1"), { wrapper: Wrapper })

    result.current.mutate({ userId: "u2", permission: "view" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1", "shares"] })
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
  })

  it("useRevokeShare invalidates only the dashboard's own share list", async () => {
    mockedService.revokeShare.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useRevokeShare("d1"), { wrapper: Wrapper })

    result.current.mutate("u2")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1", "shares"] })
  })
})
