import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardShareService } from "../../services/dashboardShareService"
import { dashboardService } from "../../services/dashboardService"
import { DashboardShareDialog } from "../DashboardShareDialog"
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
    widgets: [],
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(dashboardShareService, "listShares").mockResolvedValue({ shares: [] })
  vi.spyOn(dashboardShareService, "grantShare").mockResolvedValue({ share: {} as never })
  vi.spyOn(dashboardShareService, "revokeShare").mockResolvedValue(undefined)
  vi.spyOn(dashboardService, "setVisibility").mockResolvedValue({ dashboard: dashboard({ visibility: "public" }) })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardShareDialog", () => {
  it("renders nothing for a non-owner (FR-023 grant/revoke is owner-only)", () => {
    const { container } = render(<DashboardShareDialog projectId="p1" dashboard={dashboard({ effectivePermission: "edit" })} />, {
      wrapper: wrapper(),
    })
    expect(container.innerHTML).toBe("")
  })

  it("grants a view/edit share (T216/FR-023)", async () => {
    render(<DashboardShareDialog projectId="p1" dashboard={dashboard()} />, { wrapper: wrapper() })
    fireEvent.click(screen.getByRole("button", { name: "Share" }))

    fireEvent.change(screen.getByLabelText("Share with a person"), { target: { value: "user-2" } })
    fireEvent.change(screen.getByLabelText("Permission"), { target: { value: "edit" } })
    fireEvent.click(screen.getByRole("button", { name: "Grant" }))

    await waitFor(() =>
      expect(dashboardShareService.grantShare).toHaveBeenCalledWith("d1", { userId: "user-2", permission: "edit" }),
    )
  })

  it("lists current shares and revokes one (T217/FR-027)", async () => {
    vi.spyOn(dashboardShareService, "listShares").mockResolvedValue({
      shares: [{ id: "s1", dashboardId: "d1", userId: "user-2", permission: "view", grantedByUserId: "u1", createdAt: "t" }],
    })
    render(<DashboardShareDialog projectId="p1" dashboard={dashboard()} />, { wrapper: wrapper() })
    fireEvent.click(screen.getByRole("button", { name: "Share" }))

    await waitFor(() => expect(screen.getByText("user-2 · view")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }))

    await waitFor(() => expect(dashboardShareService.revokeShare).toHaveBeenCalledWith("d1", "user-2"))
  })

  it("toggles public/private visibility (T218/FR-024)", async () => {
    render(<DashboardShareDialog projectId="p1" dashboard={dashboard()} />, { wrapper: wrapper() })
    fireEvent.click(screen.getByRole("button", { name: "Share" }))

    fireEvent.click(screen.getByRole("button", { name: "Public" }))

    await waitFor(() => expect(dashboardService.setVisibility).toHaveBeenCalledWith("d1", "public"))
  })
})
