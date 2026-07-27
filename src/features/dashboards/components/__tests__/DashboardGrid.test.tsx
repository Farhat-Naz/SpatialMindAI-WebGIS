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
  vi.spyOn(widgetService, "saveLayout").mockResolvedValue({ layout: [] })

  // jsdom has no real layout engine — react-grid-layout's ResizeObserver-based
  // width measurement never fires without a real ResizeObserver polyfill.
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

describe("DashboardGrid", () => {
  it("renders one WidgetRenderer per widget at the active breakpoint's layout", async () => {
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

    await waitFor(() => expect(screen.getByText("Widget w1")).toBeTruthy())
    expect(screen.getByText("Widget w2")).toBeTruthy()
  })

  it("only renders layout rows for the active breakpoint tier", async () => {
    render(
      <DashboardGrid
        dashboardId="d1"
        widgets={[widget("w1"), widget("w2")]}
        layouts={[layout("w1", { breakpoint: "desktop" }), layout("w2", { breakpoint: "mobile" })]}
        activeBreakpoint="desktop"
        canEdit={true}
      />,
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(screen.getByText("Widget w1")).toBeTruthy())
    expect(screen.queryByText("Widget w2")).toBeNull()
  })

  it("keyboard: ArrowRight moves the focused widget and saves the new layout (T153/T166)", async () => {
    render(
      <DashboardGrid
        dashboardId="d1"
        widgets={[widget("w1")]}
        layouts={[layout("w1", { x: 0, y: 0 })]}
        activeBreakpoint="desktop"
        canEdit={true}
      />,
      { wrapper: wrapper() },
    )
    useDashboardBuilderStore.getState().toggleEditMode()

    await waitFor(() => expect(screen.getByText("Widget w1")).toBeTruthy())
    const gridItem = screen.getByText("Widget w1").closest('[tabindex="0"]') as HTMLElement
    expect(gridItem).toBeTruthy()

    fireEvent.keyDown(gridItem, { key: "ArrowRight" })

    await waitFor(() =>
      expect(widgetService.saveLayout).toHaveBeenCalledWith("d1", {
        breakpoint: "desktop",
        items: [{ widgetId: "w1", x: 1, y: 0, w: 4, h: 4 }],
      }),
    )
  })

  it("keyboard: Shift+ArrowDown resizes (grows height) the focused widget", async () => {
    render(
      <DashboardGrid
        dashboardId="d1"
        widgets={[widget("w1")]}
        layouts={[layout("w1", { w: 4, h: 4 })]}
        activeBreakpoint="desktop"
        canEdit={true}
      />,
      { wrapper: wrapper() },
    )
    useDashboardBuilderStore.getState().toggleEditMode()

    await waitFor(() => expect(screen.getByText("Widget w1")).toBeTruthy())
    const gridItem = screen.getByText("Widget w1").closest('[tabindex="0"]') as HTMLElement

    fireEvent.keyDown(gridItem, { key: "ArrowDown", shiftKey: true })

    await waitFor(() =>
      expect(widgetService.saveLayout).toHaveBeenCalledWith("d1", {
        breakpoint: "desktop",
        items: [{ widgetId: "w1", x: 0, y: 0, w: 4, h: 5 }],
      }),
    )
  })

  it("keyboard move/resize is disabled outside edit mode", async () => {
    render(
      <DashboardGrid
        dashboardId="d1"
        widgets={[widget("w1")]}
        layouts={[layout("w1")]}
        activeBreakpoint="desktop"
        canEdit={true}
      />,
      { wrapper: wrapper() },
    )

    await waitFor(() => expect(screen.getByText("Widget w1")).toBeTruthy())
    const gridItem = screen.getByText("Widget w1").closest("div[tabindex]") ?? screen.getByText("Widget w1").closest("div")!

    fireEvent.keyDown(gridItem, { key: "ArrowRight" })
    expect(widgetService.saveLayout).not.toHaveBeenCalled()
  })

  it("group mode: selecting 2+ widgets and clicking 'Group selected' sets groupId on the non-head members", async () => {
    const updateSpy = vi.spyOn(widgetService, "updateWidget").mockResolvedValue({ widget: widget("w2") })
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
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Widget w2 for grouping" }))

    fireEvent.click(screen.getByRole("button", { name: /Group selected/ }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith("w2", { groupId: "w1" }))
  })
})
