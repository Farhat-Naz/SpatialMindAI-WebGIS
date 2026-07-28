import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../../services/dashboardService"
import { widgetService } from "../../services/widgetService"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { DashboardListPage } from "../DashboardListPage"
import { DashboardView } from "../DashboardView"
import { WidgetRenderer } from "../WidgetRenderer"
import type { DashboardRecord, DashboardWidgetRecord } from "../../types/dashboard.types"

/** T293 — loading/error/empty state coverage for T289–T291's audit, across DashboardListPage/DashboardView/WidgetRenderer. */

// `DashboardGrid` throws for one sentinel dashboardId only — every widget
// already has its own error boundary (Phase 9), so a *widget's own render
// failure* deliberately never reaches DashboardView's module-level boundary
// (T290); this simulates a genuine non-widget failure instead (e.g. a bug
// in the grid/layout code itself), which is what that boundary exists for.
vi.mock("../DashboardGrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../DashboardGrid")>()
  return {
    ...actual,
    DashboardGrid: (props: { dashboardId: string }) => {
      if (props.dashboardId === "throw-render") {
        throw new Error("boom")
      }
      return null
    },
  }
})

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function dashboard(overrides: Partial<DashboardRecord> = {}): DashboardRecord {
  return {
    id: "d1",
    projectId: "p1",
    ownerId: "u1",
    name: "Ops",
    templateId: null,
    visibility: "private",
    effectivePermission: "owner",
    isFavorite: false,
    sharedWithMe: false,
    widgets: [],
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
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

const INITIAL_BUILDER_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_BUILDER_STATE, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Loading states (T289)", () => {
  it("DashboardListPage shows a loading state, not a blank page, while the list fetches", () => {
    vi.spyOn(dashboardService, "listDashboards").mockReturnValue(new Promise(() => {}))
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })
    expect(screen.getByText("Loading dashboards…")).toBeTruthy()
  })

  it("DashboardView shows a loading state, not a blank page, while the dashboard detail fetches", () => {
    vi.spyOn(dashboardService, "getDashboard").mockReturnValue(new Promise(() => {}))
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    expect(screen.getByText("Loading dashboard…")).toBeTruthy()
  })

  it("WidgetRenderer shows a loading state, not a blank widget, while its data fetches", () => {
    vi.spyOn(widgetService, "getWidgetData").mockReturnValue(new Promise(() => {}))
    render(<WidgetRenderer dashboardId="d1" widget={widget()} canEdit={false} />, { wrapper: wrapper() })
    expect(screen.getByText("Loading…")).toBeTruthy()
  })
})

describe("Error states (T290)", () => {
  it("DashboardView: a lastError banner surfaces a non-widget failure (e.g. a layout save error) and can be dismissed", async () => {
    vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboard() })
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    useDashboardBuilderStore.getState().setLastError("Failed to save the layout change.")
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.getByText("Failed to save the layout change.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    await waitFor(() => expect(screen.queryByText("Failed to save the layout change.")).toBeNull())
  })

  it("DashboardView: a non-widget render exception (e.g. a bug in the grid itself) shows a recoverable fallback, not a blank page", async () => {
    vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboard() })
    render(<DashboardView projectId="p1" dashboardId="throw-render" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("This dashboard failed to render")).toBeTruthy())
  })
})

describe("Empty states (T291)", () => {
  it("DashboardListPage: 'No dashboards yet' is distinct from the loading message", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({ dashboards: [], nextCursor: null })
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("No dashboards yet")).toBeTruthy())
    expect(screen.queryByText("Loading dashboards…")).toBeNull()
  })
})
