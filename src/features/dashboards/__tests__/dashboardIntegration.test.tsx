import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../services/dashboardService"
import { dashboardFilterService } from "../services/dashboardFilterService"
import { dashboardShareService } from "../services/dashboardShareService"
import { reportService } from "../services/reportService"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import { DashboardView } from "../components/DashboardView"
import type { DashboardRecord } from "../types/dashboard.types"

/**
 * Full page navigation/integration flow (T294) — every panel Phase 16
 * mounted into `DashboardView` (widgets, layout, filters, reports, sharing,
 * settings) touched in one session, confirming none conflict with another.
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

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_BUILDER_STATE, true)
  vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboard() })
  vi.spyOn(dashboardFilterService, "listFilters").mockResolvedValue({ filters: [] })
  vi.spyOn(dashboardShareService, "listShares").mockResolvedValue({ shares: [] })
  vi.spyOn(reportService, "listReports").mockResolvedValue({ reports: [], nextCursor: null })
  vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardView — full page integration", () => {
  it("every panel is reachable from the toolbar without one closing another", async () => {
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    // Widget panel (T277) — "Edit dashboard" enters edit mode, exposing "Add widget".
    fireEvent.click(screen.getByRole("button", { name: "Edit dashboard" }))
    expect(screen.getByRole("button", { name: "Add widget" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Add widget" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    // Filter bar (T279) — always visible, independent of edit mode.
    expect(screen.getByLabelText("From")).toBeTruthy()

    // Reports (T280).
    fireEvent.click(screen.getByRole("button", { name: "Reports" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy())
    fireEvent.keyDown(document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Reports" })).toBeNull())

    // Sharing (T282) — DashboardShareDialog's own trigger.
    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Share dashboard" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Share dashboard" })).toBeNull())

    // Settings (T283).
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Dashboard settings" })).toBeTruthy())
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Ops")

    // The dashboard's own header/name is still intact throughout — no panel
    // stomped on another's state.
    expect(screen.getByText("Ops")).toBeTruthy()
  })

  it("DashboardAnalyticsSummary (T281) reflects this dashboard's own widget count, alongside every other panel", async () => {
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.getByText("0")).toBeTruthy()
  })
})
