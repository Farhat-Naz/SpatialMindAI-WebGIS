import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { widgetService } from "../../services/widgetService"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { WidgetRenderer, WIDGET_REGISTRY } from "../WidgetRenderer"
import type { DashboardWidgetRecord } from "../../types/dashboard.types"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function widget(overrides: Partial<DashboardWidgetRecord> = {}): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "text",
    title: "My Widget",
    dataSourceType: null,
    dataSourceId: null,
    config: { content: "hi" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

const INITIAL_STORE_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_STORE_STATE, true)
  vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({ dataSourceUnavailable: false, data: { content: "hi" } })
  vi.spyOn(widgetService, "updateWidget").mockResolvedValue({ widget: widget() })
  vi.spyOn(widgetService, "deleteWidget").mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("WidgetRenderer", () => {
  it("renders the dispatched widget type's component once data resolves", async () => {
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={true} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())
  })

  it("shows WidgetUnavailableState when the data source is unavailable, not an error", async () => {
    vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({ dataSourceUnavailable: true })
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={true} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Data source unavailable")).toBeTruthy())
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("error boundary: a forced render failure in one widget shows the fallback without throwing", async () => {
    const FailingWidget = () => {
      throw new Error("boom")
    }
    const originalMap = WIDGET_REGISTRY.text
    WIDGET_REGISTRY.text = FailingWidget as never
    try {
      render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={true} />, { wrapper: wrapper() })
      await waitFor(() => expect(screen.getByText("This widget failed to render")).toBeTruthy())
    } finally {
      WIDGET_REGISTRY.text = originalMap
    }
  })

  it("toolbar (edit/remove) only shows in edit mode with write permission", async () => {
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={true} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull()

    useDashboardBuilderStore.getState().toggleEditMode()
    await waitFor(() => expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy())
  })

  it("toolbar hidden even in edit mode when canEdit is false (a viewer)", async () => {
    useDashboardBuilderStore.getState().toggleEditMode()
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={false} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull()
  })

  it("remove action calls useDeleteWidget", async () => {
    useDashboardBuilderStore.getState().toggleEditMode()
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={true} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByRole("button", { name: /remove/i })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /remove/i }))
    await waitFor(() => expect(widgetService.deleteWidget).toHaveBeenCalledWith("w1"))
  })

  it("collapse toggle persists isCollapsed via useUpdateWidget", async () => {
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={true} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: /collapse/i }))
    await waitFor(() =>
      expect(widgetService.updateWidget).toHaveBeenCalledWith("w1", { isCollapsed: true }),
    )
  })

  it("manual refresh invalidates this widget's query without waiting for the poll", async () => {
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={true} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())

    const callsBefore = vi.mocked(widgetService.getWidgetData).mock.calls.length
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }))

    await waitFor(() => expect(widgetService.getWidgetData).toHaveBeenCalledTimes(callsBefore + 1))
  })

  it("a sibling widget keeps working after another widget's render failure (error isolation)", async () => {
    const FailingWidget = () => {
      throw new Error("boom")
    }
    const originalMap = WIDGET_REGISTRY.html
    WIDGET_REGISTRY.html = FailingWidget as never
    try {
      render(
        <div>
          <WidgetRenderer dashboardId="d1" widget={widget({ id: "w1", type: "html" })} canEdit={true} />
          <WidgetRenderer dashboardId="d1" widget={widget({ id: "w2", type: "text" })} canEdit={true} />
        </div>,
        { wrapper: wrapper() },
      )
      await waitFor(() => expect(screen.getByText("This widget failed to render")).toBeTruthy())
      // The second widget's own container still renders normally.
      await waitFor(() => expect(screen.getAllByText("My Widget")).toHaveLength(2))
    } finally {
      WIDGET_REGISTRY.html = originalMap
    }
  })
})
