import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAnalyticsSnapshot } from "../useAnalytics"
import { analyticsService } from "../../services/analyticsService"

vi.mock("../../services/analyticsService", () => ({
  analyticsService: { getAnalyticsSnapshot: vi.fn() },
}))

const mockedService = vi.mocked(analyticsService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper }
}

describe("useAnalyticsSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches a snapshot for a project/type", async () => {
    mockedService.getAnalyticsSnapshot.mockResolvedValue({ data: { featureCount: 5 }, computedAt: "t", isCached: false })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAnalyticsSnapshot("p1", "systemStats"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.getAnalyticsSnapshot).toHaveBeenCalledWith("p1", "systemStats", undefined)
  })

  it("passes scopeId through for layerStats", async () => {
    mockedService.getAnalyticsSnapshot.mockResolvedValue({ data: {}, computedAt: "t", isCached: false })
    const { Wrapper } = createWrapper()
    renderHook(() => useAnalyticsSnapshot("p1", "layerStats", "layer-1"), { wrapper: Wrapper })

    await waitFor(() => expect(mockedService.getAnalyticsSnapshot).toHaveBeenCalledWith("p1", "layerStats", "layer-1"))
  })

  it("does not fetch when disabled", () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAnalyticsSnapshot("p1", "systemStats", undefined, { enabled: false }), {
      wrapper: Wrapper,
    })

    expect(result.current.fetchStatus).toBe("idle")
    expect(mockedService.getAnalyticsSnapshot).not.toHaveBeenCalled()
  })
})
