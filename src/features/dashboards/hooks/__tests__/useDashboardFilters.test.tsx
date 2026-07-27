import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCreateFilter, useDashboardFilters, useDeleteFilter } from "../useDashboardFilters"
import { dashboardFilterService } from "../../services/dashboardFilterService"

vi.mock("../../services/dashboardFilterService", () => ({
  dashboardFilterService: { listFilters: vi.fn(), createFilter: vi.fn(), deleteFilter: vi.fn() },
}))

const mockedService = vi.mocked(dashboardFilterService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

describe("useDashboardFilters hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useDashboardFilters lists filters", async () => {
    mockedService.listFilters.mockResolvedValue({ filters: [] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDashboardFilters("d1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it("useCreateFilter invalidates only the dashboard's own filter list — not reports or shares (T106)", async () => {
    mockedService.createFilter.mockResolvedValue({ filter: {} as never })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useCreateFilter("d1"), { wrapper: Wrapper })

    result.current.mutate({ filterType: "date", config: {} })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1", "filters"] })
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
  })

  it("useDeleteFilter invalidates only the dashboard's own filter list", async () => {
    mockedService.deleteFilter.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteFilter("d1"), { wrapper: Wrapper })

    result.current.mutate("filter-1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1", "filters"] })
  })
})
