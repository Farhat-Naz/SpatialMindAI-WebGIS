import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../../services/dashboardService"
import { DashboardListPage } from "../DashboardListPage"
import type { DashboardRecord } from "../../types/dashboard.types"

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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({ dashboards: [dashboard()], nextCursor: null })
  vi.spyOn(dashboardService, "listTemplates").mockResolvedValue({ templates: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardListPage", () => {
  it("renders the loaded dashboard list", async () => {
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
  })

  it("shows the empty state when there are no dashboards, distinct from loading", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({ dashboards: [], nextCursor: null })
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("No dashboards yet")).toBeTruthy())
  })

  it("filters the list client-side as the user types", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({
      dashboards: [dashboard({ id: "d1", name: "Ops" }), dashboard({ id: "d2", name: "Executive" })],
      nextCursor: null,
    })
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Search dashboards"), { target: { value: "exec" } })

    await waitFor(() => expect(screen.queryByText("Ops")).toBeNull())
    expect(screen.getByText("Executive")).toBeTruthy()
  })

  it("opens a dashboard when its row is clicked", async () => {
    const onOpen = vi.fn()
    render(<DashboardListPage projectId="p1" onOpenDashboard={onOpen} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    fireEvent.click(screen.getByText("Ops"))
    expect(onOpen).toHaveBeenCalledWith("d1")
  })

  it("requires explicit AlertDialog confirmation before deleting", async () => {
    const deleteSpy = vi.spyOn(dashboardService, "deleteDashboard").mockResolvedValue(undefined)
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(screen.getByText("Delete this dashboard?")).toBeTruthy()

    const buttons = screen.getAllByRole("button", { name: "Delete" })
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("d1"))
  })

  it("hides Delete for a caller without owner permission", async () => {
    vi.spyOn(dashboardService, "listDashboards").mockResolvedValue({
      dashboards: [dashboard({ effectivePermission: "edit" })],
      nextCursor: null,
    })
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
  })

  it("toggles favorite", async () => {
    const favoriteSpy = vi.spyOn(dashboardService, "setFavorite").mockResolvedValue({ isFavorite: true })
    render(<DashboardListPage projectId="p1" onOpenDashboard={vi.fn()} />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Add Ops to favorites" }))

    await waitFor(() => expect(favoriteSpy).toHaveBeenCalledWith("d1", true))
  })
})
