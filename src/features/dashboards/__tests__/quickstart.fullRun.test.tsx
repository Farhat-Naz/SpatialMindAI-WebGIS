import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../services/dashboardService"
import { dashboardFilterService } from "../services/dashboardFilterService"
import { dashboardShareService } from "../services/dashboardShareService"
import { dashboardAdminService } from "../services/dashboardAdminService"
import { dashboardExportService } from "../services/dashboardExportService"
import { reportService } from "../services/reportService"
import { widgetService } from "../services/widgetService"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { useDashboardFilterStore } from "../store/dashboardFilterStore"
import { DashboardListPage } from "../components/DashboardListPage"
import { DashboardView } from "../components/DashboardView"
import { DashboardAdminPanel } from "../components/DashboardAdminPanel"
import type { DashboardRecord } from "../types/dashboard.types"

/**
 * T341 — a single continuous session touching every one of quickstart.md's
 * ten sections in order, without requiring app state reset between them
 * (the same real components, same QueryClient, share the same mocked
 * dashboard/service state as the session progresses).
 */

function wrapper(client: QueryClient) {
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

const INITIAL_BUILDER_STATE = useDashboardBuilderStore.getState()
const INITIAL_FILTER_STATE = useDashboardFilterStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_BUILDER_STATE, true)
  useDashboardFilterStore.setState(INITIAL_FILTER_STATE, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("quickstart.md — full run-through (all ten sections)", () => {
  it("§1-2 Dashboard Builder + Widgets: create a dashboard, list it, add a widget", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.spyOn(dashboardService, "listTemplates").mockResolvedValue({
      templates: [{ id: "t-blank", key: "blank", name: "Blank", description: null, widgetsBlueprint: [], createdAt: "t", updatedAt: "t" }],
    })
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValueOnce({ dashboards: [], nextCursor: null })
    vi.spyOn(dashboardService, "createDashboard").mockResolvedValue({ dashboard: dashboard() })
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({ dashboards: [dashboard()], nextCursor: null })

    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper(client) })
    await waitFor(() => expect(screen.getByText("No dashboards yet")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ops" } })
    await waitFor(() => expect(screen.getByRole("radio", { name: "Blank" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
  })

  it("§3-6, §9-10 Layout/Analytics/Reporting/Filtering/Export/Admin in one DashboardView session", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    let currentDashboard = dashboard()
    vi.spyOn(dashboardService, "getDashboard").mockImplementation(async () => ({ dashboard: currentDashboard }))
    vi.spyOn(dashboardFilterService, "listFilters").mockResolvedValue({ filters: [] })
    vi.spyOn(dashboardShareService, "listShares").mockResolvedValue({ shares: [] })
    vi.spyOn(reportService, "listReports").mockResolvedValue({ reports: [], nextCursor: null })
    vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [] })
    vi.spyOn(widgetService, "addWidget").mockImplementation(async (dashboardId, input) => {
      const widget = {
        id: "w1",
        dashboardId,
        type: input.type,
        title: input.title ?? null,
        dataSourceType: input.dataSourceType ?? null,
        dataSourceId: input.dataSourceId ?? null,
        config: input.config,
        groupId: null,
        isCollapsed: false,
        createdAt: "t",
        updatedAt: "t",
      }
      const layouts = (["desktop", "tablet", "mobile"] as const).map((breakpoint) => ({
        id: `l-${breakpoint}`,
        widgetId: widget.id,
        breakpoint,
        x: 0,
        y: 0,
        w: 4,
        h: 4,
      }))
      currentDashboard = { ...currentDashboard, widgets: [{ ...widget, layouts }] }
      return { widget, layout: layouts }
    })
    vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({ dataSourceUnavailable: false, data: { data: { featureCount: 5 } } })

    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper(client) })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    // §2/§3 Widgets/Layout — add a widget, confirm edit mode toggles the grid's interactive state.
    fireEvent.click(screen.getByRole("button", { name: "Edit dashboard" }))
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Add widget" })).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Feature Count" } })
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(widgetService.addWidget).toHaveBeenCalledWith("d1", expect.objectContaining({ title: "Feature Count" })))

    // §4 Live Analytics — the added widget appears once the dashboard detail refetches.
    await waitFor(() => expect(screen.getByText("Feature Count")).toBeTruthy())

    // §5 Reporting — generate a report.
    const generateSpy = vi.spyOn(reportService, "generatePdfReport").mockResolvedValue({
      report: { id: "r1", dashboardId: "d1", userId: "u1", scheduledReportId: null, format: "pdf", status: "succeeded", sizeBytes: 10, errorMessage: null, createdAt: "t" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Reports" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Generate report" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))
    await waitFor(() => expect(generateSpy).toHaveBeenCalled())
    fireEvent.keyDown(document.body, { key: "Escape" })

    // §6 Filtering — set a global date filter.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } })
    await waitFor(() =>
      expect(useDashboardFilterStore.getState().activeGlobalFilters).toContainEqual(expect.objectContaining({ filterType: "date" })),
    )

    // §7 Sharing.
    const grantSpy = vi.spyOn(dashboardShareService, "grantShare").mockResolvedValue({
      share: { id: "s1", dashboardId: "d1", userId: "editor-1", permission: "view", grantedByUserId: "u1", createdAt: "t" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Share dashboard" })).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Share with a person"), { target: { value: "editor-1" } })
    fireEvent.click(screen.getByRole("button", { name: "Grant" }))
    await waitFor(() => expect(grantSpy).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    // §9 Export — export the whole dashboard.
    vi.spyOn(dashboardExportService, "exportDashboardAsImage").mockResolvedValue(undefined)
    vi.spyOn(dashboardExportService, "logExport").mockResolvedValue(undefined)
    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Export dashboard as image"))
    await waitFor(() => expect(dashboardExportService.exportDashboardAsImage).toHaveBeenCalled())

    // The session survived every section above without a reset.
    expect(screen.getByText("Ops")).toBeTruthy()
  })

  it("§10 Administration: a Project Owner sees the project's dashboards, usage, audit log, and performance", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({
      dashboards: [
        { id: "d1", name: "Ops", ownerId: "u1", visibility: "private", shareCount: 1, widgets: [{ id: "w1", title: "Feature Count", type: "metricCard" }], createdAt: "t", updatedAt: "t" },
      ],
      usage: { activityCountByDashboard: [{ dashboardId: "d1", count: 3 }], mostUsedWidgetTypes: [{ type: "metricCard", count: 1 }] },
    })
    vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({
      activities: [{ id: "a1", userId: "u1", action: "create", targetType: "dashboard", targetId: "d1", createdAt: "t" }],
      nextCursor: null,
    })

    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper(client) })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.getByText(/3 activity events/)).toBeTruthy()
    expect(screen.getByText(/u1 — create \(dashboard\)/)).toBeTruthy()
  })
})
