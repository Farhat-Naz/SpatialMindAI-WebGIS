import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { widgetService } from "../../services/widgetService"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { DashboardGrid } from "../DashboardGrid"
import type { DashboardWidgetRecord, WidgetLayoutRecord } from "../../types/dashboard.types"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function widget(id: string, overrides: Partial<DashboardWidgetRecord> = {}): DashboardWidgetRecord {
  return {
    id,
    dashboardId: "d1",
    type: "text",
    title: `Widget ${id}`,
    dataSourceType: null,
    dataSourceId: null,
    config: { content: "x" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

function layout(widgetId: string, overrides: Partial<WidgetLayoutRecord> = {}): WidgetLayoutRecord {
  return { id: `l-${widgetId}`, widgetId, breakpoint: "desktop", x: 0, y: 0, w: 4, h: 4, ...overrides }
}

const INITIAL_STORE_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_STORE_STATE, true)
  vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({ dataSourceUnavailable: false, data: {} })
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("DashboardGrid — grouping (US3/FR-011)", () => {
  it("a widget with a groupId set renders normally alongside its group head", async () => {
    render(
      <DashboardGrid
        dashboardId="d1"
        widgets={[widget("w1"), widget("w2", { groupId: "w1" })]}
        layouts={[layout("w1"), layout("w2", { x: 4 })]}
        activeBreakpoint="desktop"
        canEdit={true}
      />,
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(screen.getByText("Widget w1")).toBeTruthy())
    expect(screen.getByText("Widget w2")).toBeTruthy()
  })

  it("cancelling group mode clears the pending selection without calling updateWidget", async () => {
    const updateSpy = vi.spyOn(widgetService, "updateWidget")
    render(
      <DashboardGrid
        dashboardId="d1"
        widgets={[widget("w1"), widget("w2")]}
        layouts={[layout("w1"), layout("w2", { x: 4 })]}
        activeBreakpoint="desktop"
        canEdit={true}
      />,
      { wrapper: wrapper() },
    )
    useDashboardBuilderStore.getState().toggleEditMode()

    await waitFor(() => expect(screen.getByText("Widget w1")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Group widgets" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Widget w1 for grouping" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel grouping" }))

    expect(updateSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })
})

describe("WidgetRenderer collapse — persists across a simulated reload", () => {
  it("re-fetching useDashboard with isCollapsed: true renders the widget collapsed without a fresh user action", async () => {
    const { WidgetRenderer } = await import("../WidgetRenderer")
    const collapsedWidget = widget("w1", { isCollapsed: true })

    render(<WidgetRenderer dashboardId="d1" widget={collapsedWidget} canEdit={true} />, { wrapper: wrapper() })

    // Collapsed: the body (and therefore any data-driven content) never mounts.
    expect(screen.queryByText("Loading…")).toBeNull()
    expect(screen.getByRole("button", { name: /expand/i })).toBeTruthy()
  })
})
