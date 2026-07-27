import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../../services/dashboardService"
import { dashboardShareService } from "../../services/dashboardShareService"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { DashboardView } from "../DashboardView"
import type { DashboardEffectivePermission, DashboardRecord } from "../../types/dashboard.types"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function dashboard(effectivePermission: DashboardEffectivePermission): DashboardRecord {
  return {
    id: "d1",
    projectId: "p1",
    ownerId: "u1",
    name: "Ops",
    templateId: null,
    visibility: "private",
    effectivePermission,
    isFavorite: false,
    sharedWithMe: false,
    widgets: [],
    createdAt: "t",
    updatedAt: "t",
  }
}

const INITIAL_STORE_STATE = useDashboardBuilderStore.getState()

beforeEach(() => {
  useDashboardBuilderStore.setState(INITIAL_STORE_STATE, true)
  vi.spyOn(dashboardShareService, "listShares").mockResolvedValue({ shares: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardView — read-only UI gating (T221/T223-T225, all effectivePermission levels)", () => {
  it("owner: sees Edit dashboard, Add widget (in edit mode), and Share; no read-only banner", async () => {
    vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboard("owner") })
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Edit dashboard" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy()
    expect(screen.queryByRole("status", { name: /read-only/i })).toBeNull()
  })

  it("edit: sees Edit dashboard, but not Share (grant/revoke is owner-only)", async () => {
    vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboard("edit") })
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Edit dashboard" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull()
  })

  it("view: shows the read-only banner; hides Edit dashboard entirely (not merely disabled)", async () => {
    vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboard("view") })
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/read-only/i)).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Edit dashboard" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Add widget" })).toBeNull()
  })

  it("null (no access): shows the non-disclosure 'not found' state, indistinguishable from a nonexistent dashboard", async () => {
    vi.spyOn(dashboardService, "getDashboard").mockRejectedValue(new Error("Not found"))
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Dashboard not found")).toBeTruthy())
    expect(screen.getByText(/may not exist, or you may not have access/i)).toBeTruthy()
  })
})
