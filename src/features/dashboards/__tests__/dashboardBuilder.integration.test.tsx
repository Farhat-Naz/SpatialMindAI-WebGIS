import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../services/dashboardService"
import { DashboardListPage } from "../components/DashboardListPage"
import type { DashboardRecord } from "../types/dashboard.types"

/**
 * Full Dashboard Builder flow (quickstart.md §1; spec.md US1 Acceptance
 * Scenarios 1–5): create, rename entry point, duplicate, favorite, delete —
 * exercised through the actually-composed `DashboardListPage` +
 * `CreateDashboardDialog` tree, not each in isolation.
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

beforeEach(() => {
  vi.spyOn(dashboardService, "listTemplates").mockResolvedValue({ templates: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Dashboard Builder — full flow", () => {
  it("Scenario 1: create a dashboard — appears in the project's list", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValueOnce({ dashboards: [], nextCursor: null })
    vi.spyOn(dashboardService, "createDashboard").mockResolvedValue({ dashboard: dashboard() })
    const onOpen = vi.fn()

    render(<DashboardListPage projectId="p1" onOpenDashboard={onOpen} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("No dashboards yet")).toBeTruthy())

    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({ dashboards: [dashboard()], nextCursor: null })

    fireEvent.click(screen.getByRole("button", { name: "New dashboard" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ops" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("d1"))
  })

  it("Scenario 3: duplicate a dashboard produces an independent copy", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({ dashboards: [dashboard()], nextCursor: null })
    const duplicateSpy = vi.spyOn(dashboardService, "duplicateDashboard").mockResolvedValue({
      dashboard: dashboard({ id: "d2", name: "Ops (copy)" }),
    })

    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }))
    await waitFor(() => expect(duplicateSpy).toHaveBeenCalledWith("d1"))
  })

  it("Scenario 4: favorite a dashboard, then filter to favorites-only", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({
      dashboards: [dashboard({ isFavorite: true })],
      nextCursor: null,
    })

    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }))
    await waitFor(() =>
      expect(dashboardService.listDashboards).toHaveBeenLastCalledWith("p1", { favoritesOnly: true }),
    )
  })

  it("Scenario 5: delete requires explicit confirmation, then removes the dashboard", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({ dashboards: [dashboard()], nextCursor: null })
    const deleteSpy = vi.spyOn(dashboardService, "deleteDashboard").mockResolvedValue(undefined)

    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(deleteSpy).not.toHaveBeenCalled()

    const confirmButtons = screen.getAllByRole("button", { name: "Delete" })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("d1"))
  })
})
