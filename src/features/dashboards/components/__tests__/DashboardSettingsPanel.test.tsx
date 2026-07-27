import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../../services/dashboardService"
import { DashboardSettingsPanel } from "../DashboardSettingsPanel"
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
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  }
}

let renameSpy: ReturnType<typeof vi.spyOn>
let visibilitySpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  renameSpy = vi.spyOn(dashboardService, "renameDashboard").mockResolvedValue({ dashboard: dashboard({ name: "New" }) })
  visibilitySpy = vi
    .spyOn(dashboardService, "setVisibility")
    .mockResolvedValue({ dashboard: dashboard({ visibility: "public" }) })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardSettingsPanel", () => {
  it("does not rename on every keystroke — only on blur/Enter (T138)", () => {
    render(<DashboardSettingsPanel projectId="p1" dashboard={dashboard()} />, { wrapper: wrapper() })

    const input = screen.getByLabelText("Name")
    fireEvent.change(input, { target: { value: "O" } })
    fireEvent.change(input, { target: { value: "Op" } })
    fireEvent.change(input, { target: { value: "New" } })

    expect(renameSpy).not.toHaveBeenCalled()
  })

  it("saves the rename on blur", async () => {
    render(<DashboardSettingsPanel projectId="p1" dashboard={dashboard()} />, { wrapper: wrapper() })

    const input = screen.getByLabelText("Name")
    fireEvent.change(input, { target: { value: "New" } })
    fireEvent.blur(input)

    await waitFor(() => expect(renameSpy).toHaveBeenCalledWith("d1", "New"))
  })

  it("shows the visibility control for an owner", async () => {
    render(<DashboardSettingsPanel projectId="p1" dashboard={dashboard({ effectivePermission: "owner" })} />, {
      wrapper: wrapper(),
    })
    expect(screen.getByText("Visibility")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Public" }))
    await waitFor(() => expect(visibilitySpy).toHaveBeenCalledWith("d1", "public"))
  })

  it("hides the visibility control entirely for a non-owner (per effectivePermission)", () => {
    render(<DashboardSettingsPanel projectId="p1" dashboard={dashboard({ effectivePermission: "edit" })} />, {
      wrapper: wrapper(),
    })
    expect(screen.queryByText("Visibility")).toBeNull()
  })

  it("displays read-only metadata", () => {
    render(<DashboardSettingsPanel projectId="p1" dashboard={dashboard()} shareCount={2} />, { wrapper: wrapper() })
    expect(screen.getByText("Owner")).toBeTruthy()
    expect(screen.getByText("u1")).toBeTruthy()
    expect(screen.getByText("2 people")).toBeTruthy()
  })
})
