import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../services/dashboardService"
import { widgetService } from "../services/widgetService"
import { useLayers } from "@/features/database/hooks/useLayers"
import { useAnalysisRuns } from "@/features/analysis/hooks/useAnalysis"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { DashboardView } from "../components/DashboardView"
import type { DashboardRecord } from "../types/dashboard.types"

vi.mock("@/features/database/hooks/useLayers", () => ({ useLayers: vi.fn() }))
vi.mock("@/features/analysis/hooks/useAnalysis", () => ({ useAnalysisRuns: vi.fn() }))

/**
 * Remaining Dashboard Layout flow (quickstart.md §3 steps 1–2, 5; spec.md
 * US3 Acceptance Scenarios 1, 2, 5 — reload/responsive covered by T144)
 * exercised through the real `DashboardView` -> `DashboardGrid` ->
 * `WidgetRenderer` composition, not each in isolation.
 */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function dashboardWithTwoWidgets(): DashboardRecord {
  return {
    id: "d1",
    projectId: "p1",
    ownerId: "u1",
    name: "Layout Test",
    templateId: null,
    visibility: "private",
    effectivePermission: "owner",
    isFavorite: false,
    sharedWithMe: false,
    widgets: [
      {
        id: "w1",
        dashboardId: "d1",
        type: "text",
        title: "First",
        dataSourceType: null,
        dataSourceId: null,
        config: { content: "a" },
        groupId: null,
        isCollapsed: false,
        createdAt: "t",
        updatedAt: "t",
        layouts: [{ id: "l1", widgetId: "w1", breakpoint: "desktop", x: 0, y: 0, w: 4, h: 4 }],
      },
      {
        id: "w2",
        dashboardId: "d1",
        type: "text",
        title: "Second",
        dataSourceType: null,
        dataSourceId: null,
        config: { content: "b" },
        groupId: null,
        isCollapsed: false,
        createdAt: "t",
        updatedAt: "t",
        layouts: [{ id: "l2", widgetId: "w2", breakpoint: "desktop", x: 4, y: 0, w: 4, h: 4 }],
      },
    ],
    createdAt: "t",
    updatedAt: "t",
  }
}

const INITIAL_STORE_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_STORE_STATE, true)
  vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboardWithTwoWidgets() })
  vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({ dataSourceUnavailable: false, data: {} })
  vi.mocked(useLayers).mockReturnValue({ data: [] } as never)
  vi.mocked(useAnalysisRuns).mockReturnValue({ data: { runs: [] } } as never)
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub)
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1920 })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Dashboard Layout — drag/resize/group (Scenarios 1, 2, 5)", () => {
  it("Scenario 1/2: entering edit mode enables keyboard move/resize, which saves via useSaveLayout", async () => {
    const saveSpy = vi.spyOn(widgetService, "saveLayout").mockResolvedValue({ layout: [] })
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Edit dashboard" }))

    const gridItem = screen.getByText("First").closest('[tabindex="0"]') as HTMLElement
    fireEvent.keyDown(gridItem, { key: "ArrowRight" })

    await waitFor(() => expect(saveSpy).toHaveBeenCalled())
  })

  it("Scenario 5: grouping two widgets in edit mode sets the second's groupId to the first's id", async () => {
    const updateSpy = vi.spyOn(widgetService, "updateWidget").mockResolvedValue({ widget: {} as never })
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Edit dashboard" }))
    fireEvent.click(screen.getByRole("button", { name: "Group widgets" }))

    fireEvent.click(screen.getByRole("checkbox", { name: "Select First for grouping" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Second for grouping" }))
    fireEvent.click(screen.getByRole("button", { name: /Group selected/ }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith("w2", { groupId: "w1" }))
  })

  it("'Add widget' is only available in edit mode", async () => {
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("First")).toBeTruthy())

    expect(screen.queryByRole("button", { name: "Add widget" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Edit dashboard" }))
    expect(screen.getByRole("button", { name: "Add widget" })).toBeTruthy()
  })
})
