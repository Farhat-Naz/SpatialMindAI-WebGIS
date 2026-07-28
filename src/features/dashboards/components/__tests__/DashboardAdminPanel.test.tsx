import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardAdminService } from "../../services/dashboardAdminService"
import { useWidgetPerformanceStore } from "../../store/widgetPerformanceStore"
import { DashboardAdminPanel } from "../DashboardAdminPanel"
import type { AdminDashboardRow, UsageAnalytics } from "../../types/dashboard.types"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function dashboardRow(overrides: Partial<AdminDashboardRow> = {}): AdminDashboardRow {
  return {
    id: "d1",
    name: "Ops",
    ownerId: "u1",
    visibility: "private",
    shareCount: 2,
    widgets: [{ id: "w1", title: "Feature Count", type: "metricCard" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  }
}

const usage: UsageAnalytics = {
  activityCountByDashboard: [{ dashboardId: "d1", count: 5 }],
  mostUsedWidgetTypes: [{ type: "metricCard", count: 3 }],
}

const INITIAL_PERFORMANCE_STATE = useWidgetPerformanceStore.getState()

beforeEach(() => {
  useWidgetPerformanceStore.setState(INITIAL_PERFORMANCE_STATE, true)
  vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({ activities: [], nextCursor: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardAdminPanel", () => {
  it("T284 — lists every dashboard with owner/last-modified/sharing state", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.getByText("u1")).toBeTruthy()
    expect(screen.getByText(/private/)).toBeTruthy()
    expect(screen.getByText(/shared with 2/)).toBeTruthy()
  })

  it("T285 — shows usage analytics (activity count proxy + most-used widget types)", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/5 activity events/)).toBeTruthy())
    expect(screen.getByText(/metricCard: 3/)).toBeTruthy()
  })

  it("T286 — shows the dashboard-scoped audit log", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({
      activities: [{ id: "a1", userId: "u2", action: "edit", targetType: "dashboard", targetId: "d1", createdAt: "2026-01-03T00:00:00.000Z" }],
      nextCursor: null,
    })
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/u2 — edit \(dashboard\)/)).toBeTruthy())
  })

  it("T287 — flags a widget over the slow threshold as slow, from this session's own recorded durations", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    useWidgetPerformanceStore.getState().recordDuration("w1", 1500)
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/Feature Count \(Ops\)/)).toBeTruthy())
    expect(screen.getByText(/1500ms \(slow\)/)).toBeTruthy()
  })

  it("T287 — shows an explicit empty state when nothing has loaded this session, not a blank section", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/open a dashboard to populate this/)).toBeTruthy())
  })

  it("T288 — access gate: a non-Project-Owner's failed request shows 'Access denied', not the panel", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockRejectedValue(new Error("Forbidden"))
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Access denied")).toBeTruthy())
    expect(screen.queryByText("Dashboard Administration")).toBeNull()
  })
})
