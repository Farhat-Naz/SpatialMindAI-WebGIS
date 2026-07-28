import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../services/dashboardService"
import { dashboardFilterService } from "../services/dashboardFilterService"
import { dashboardShareService } from "../services/dashboardShareService"
import { reportService } from "../services/reportService"
import { widgetService } from "../services/widgetService"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { CreateDashboardDialog } from "../components/CreateDashboardDialog"
import { DashboardView } from "../components/DashboardView"
import type { DashboardRecord } from "../types/dashboard.types"

/**
 * T339 — Template → Widgets → Share → Report cross-story journey (US8/US2/
 * US7/US5), one continuous session: create from the Executive template,
 * add a widget, share with a second user at "view", generate a PDF report.
 */

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
    name: "Executive Overview",
    templateId: "t-exec",
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

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_BUILDER_STATE, true)
  vi.spyOn(dashboardFilterService, "listFilters").mockResolvedValue({ filters: [] })
  vi.spyOn(dashboardShareService, "listShares").mockResolvedValue({ shares: [] })
  vi.spyOn(reportService, "listReports").mockResolvedValue({ reports: [], nextCursor: null })
  vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Cross-story: Template → Widgets → Share → Report", () => {
  it("holds correctly across all four stories in one continuous session", async () => {
    // US8 — create from the Executive template.
    vi.spyOn(dashboardService, "listTemplates").mockResolvedValue({
      templates: [{ id: "t-exec", key: "executive", name: "Executive", description: null, widgetsBlueprint: [], createdAt: "t", updatedAt: "t" }],
    })
    const createSpy = vi.spyOn(dashboardService, "createDashboard").mockResolvedValue({ dashboard: dashboard() })
    let openedDashboardId: string | null = null

    const { unmount } = render(
      <CreateDashboardDialog projectId="p1" onCreated={(id) => (openedDashboardId = id)} />,
      { wrapper: wrapper() },
    )
    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Executive Overview" } })
    await waitFor(() => expect(screen.getByRole("radio", { name: "Executive" })).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: "Executive" }))
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith("p1", expect.objectContaining({ templateId: "t-exec" })))
    await waitFor(() => expect(openedDashboardId).toBe("d1"))
    unmount()

    // US2 — open the created dashboard and add a widget.
    let currentDashboard = dashboard()
    vi.spyOn(dashboardService, "getDashboard").mockImplementation(async () => ({ dashboard: currentDashboard }))
    const addWidgetSpy = vi.spyOn(widgetService, "addWidget").mockImplementation(async (dashboardId, input) => {
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
      currentDashboard = { ...currentDashboard, widgets: [{ ...widget, layouts: [] }] }
      return { widget, layout: [] }
    })

    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Executive Overview")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Edit dashboard" }))
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Add widget" })).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Summary" } })
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))

    await waitFor(() => expect(addWidgetSpy).toHaveBeenCalledWith("d1", expect.objectContaining({ title: "Summary" })))

    // US7 — share the dashboard with a second user at "view".
    const grantSpy = vi.spyOn(dashboardShareService, "grantShare").mockResolvedValue({
      share: { id: "s1", dashboardId: "d1", userId: "editor-1", permission: "view", grantedByUserId: "u1", createdAt: "t" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Share dashboard" })).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Share with a person"), { target: { value: "editor-1" } })
    fireEvent.click(screen.getByRole("button", { name: "Grant" }))

    await waitFor(() => expect(grantSpy).toHaveBeenCalledWith("d1", { userId: "editor-1", permission: "view" }))
    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    // US5 — generate a PDF report.
    const generateSpy = vi.spyOn(reportService, "generatePdfReport").mockResolvedValue({
      report: { id: "r1", dashboardId: "d1", userId: "u1", scheduledReportId: null, format: "pdf", status: "succeeded", sizeBytes: 100, errorMessage: null, createdAt: "t" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Reports" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Generate report" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(generateSpy).toHaveBeenCalled())

    // The dashboard's own identity survived all four stories intact.
    expect(screen.getByText("Executive Overview")).toBeTruthy()
  })
})
