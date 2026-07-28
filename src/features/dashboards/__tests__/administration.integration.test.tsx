import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardAdminService } from "../services/dashboardAdminService"
import { dashboardService } from "../services/dashboardService"
import { useWidgetPerformanceStore } from "../store/widgetPerformanceStore"
import { DashboardAdminPanel } from "../components/DashboardAdminPanel"
import { DashboardListPage } from "../components/DashboardListPage"
import type { AdminDashboardRow, DashboardRecord, UsageAnalytics } from "../types/dashboard.types"

/**
 * Full Administration flow (quickstart.md §10; spec.md US10 Acceptance
 * Scenarios 1–5).
 */

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
    shareCount: 1,
    widgets: [{ id: "w1", title: "Feature Count", type: "metricCard" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  }
}

const usage: UsageAnalytics = {
  activityCountByDashboard: [{ dashboardId: "d1", count: 4 }],
  mostUsedWidgetTypes: [{ type: "metricCard", count: 2 }],
}

const auditActivities = [
  { id: "a1", userId: "owner-1", action: "create", targetType: "dashboard", targetId: "d1", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "a2", userId: "editor-1", action: "share", targetType: "dashboard", targetId: "d1", createdAt: "2026-01-04T00:00:00.000Z" },
]

const INITIAL_PERFORMANCE_STATE = useWidgetPerformanceStore.getState()

beforeEach(() => {
  useWidgetPerformanceStore.setState(INITIAL_PERFORMANCE_STATE, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Administration — full flow", () => {
  it("Scenario 1: a Project Owner sees every dashboard with owner, last-modified time, and sharing state", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({ activities: [], nextCursor: null })

    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.getByText("u1")).toBeTruthy()
    expect(screen.getByText(new Date("2026-01-05T00:00:00.000Z").toLocaleString())).toBeTruthy()
    expect(screen.getByText(/private/)).toBeTruthy()
  })

  it("Scenario 2: usage analytics shows the view-count proxy and most-used widget types", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({ activities: [], nextCursor: null })

    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/4 activity events/)).toBeTruthy())
    expect(screen.getByText(/metricCard: 2/)).toBeTruthy()
  })

  it("Scenario 3: the audit log lists every prior create/edit/delete/share action with who and when", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({ activities: auditActivities, nextCursor: null })

    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/owner-1 — create \(dashboard\)/)).toBeTruthy())
    expect(screen.getByText(/editor-1 — share \(dashboard\)/)).toBeTruthy()
  })

  it("Scenario 4: a notably slow-loading widget is identifiable in performance metrics", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({ dashboards: [dashboardRow()], usage })
    vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({ activities: [], nextCursor: null })
    useWidgetPerformanceStore.getState().recordDuration("w1", 2500)

    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/2500ms \(slow\)/)).toBeTruthy())
  })

  it("Scenario 5: a non-Owner (Editor) sees Administration denied, both hidden from navigation and rejected server-side", async () => {
    // "Hidden from navigation" — DashboardListPage's own Administration
    // link is driven by the same Owner-gated query, so a non-Owner never
    // sees it appear.
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({
      dashboards: [
        {
          id: "d1",
          projectId: "p1",
          ownerId: "u1",
          name: "Ops",
          templateId: null,
          visibility: "private",
          effectivePermission: "edit",
          isFavorite: false,
          sharedWithMe: false,
          widgets: [],
          createdAt: "t",
          updatedAt: "t",
        } satisfies DashboardRecord,
      ],
      nextCursor: null,
    })
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockRejectedValue(new Error("Forbidden"))

    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.queryByRole("link", { name: "Administration" })).toBeNull()

    // "Rejected server-side" — attempting the panel directly still denies.
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Access denied")).toBeTruthy())
  })
})
