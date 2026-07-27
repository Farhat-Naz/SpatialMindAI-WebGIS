import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAddWidget, useDeleteWidget, useSaveLayout, useUpdateWidget, useWidgetData } from "../useWidgets"
import { widgetService } from "../../services/widgetService"

vi.mock("../../services/widgetService", () => ({
  widgetService: {
    addWidget: vi.fn(),
    updateWidget: vi.fn(),
    deleteWidget: vi.fn(),
    getWidgetData: vi.fn(),
    saveLayout: vi.fn(),
  },
}))

const mockedService = vi.mocked(widgetService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

describe("useWidgets hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useAddWidget: invalidates only the dashboard's own detail", async () => {
    mockedService.addWidget.mockResolvedValue({ widget: {} as never, layout: [] })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useAddWidget("d1"), { wrapper: Wrapper })

    result.current.mutate({ type: "text", config: { content: "hi" } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1"] })
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
  })

  it("useUpdateWidget: invalidates the dashboard's own detail", async () => {
    mockedService.updateWidget.mockResolvedValue({ widget: {} as never })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useUpdateWidget("d1"), { wrapper: Wrapper })

    result.current.mutate({ widgetId: "w1", input: { title: "New" } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1"] })
  })

  it("useDeleteWidget: invalidates the dashboard's own detail", async () => {
    mockedService.deleteWidget.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteWidget("d1"), { wrapper: Wrapper })

    result.current.mutate("w1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1"] })
  })

  it("useWidgetData: fetches data when enabled", async () => {
    mockedService.getWidgetData.mockResolvedValue({ dataSourceUnavailable: false, data: { value: 1 } })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useWidgetData("d1", "w1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.getWidgetData).toHaveBeenCalledWith("d1", "w1")
  })

  it("useWidgetData: does not fetch when enabled is false (viewport-pause gate)", async () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useWidgetData("d1", "w1", { enabled: false }), { wrapper: Wrapper })

    expect(result.current.fetchStatus).toBe("idle")
    expect(mockedService.getWidgetData).not.toHaveBeenCalled()
  })

  it("useWidgetData: surfaces dataSourceUnavailable as ordinary data, not an error", async () => {
    mockedService.getWidgetData.mockResolvedValue({ dataSourceUnavailable: true })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useWidgetData("d1", "w1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(result.current.data?.dataSourceUnavailable).toBe(true)
  })

  it("useSaveLayout: invalidates the dashboard's own detail", async () => {
    mockedService.saveLayout.mockResolvedValue({ layout: [] })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useSaveLayout("d1"), { wrapper: Wrapper })

    result.current.mutate({ breakpoint: "desktop", items: [] })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1"] })
  })
})
