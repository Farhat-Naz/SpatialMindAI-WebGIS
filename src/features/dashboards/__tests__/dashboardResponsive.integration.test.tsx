import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardService } from "../services/dashboardService"
import { DashboardView } from "../components/DashboardView"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import type { DashboardRecord } from "../types/dashboard.types"

/**
 * Responsive layout + autosave (quickstart.md §3 steps 3–4; spec.md US3
 * Acceptance Scenarios 3–4). Drag/resize/group reflow itself is Phase 9's
 * concern (`DashboardGrid`); this test covers the shell's breakpoint sync
 * and the absence of a manual "Save Layout" action.
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

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width })
  window.dispatchEvent(new Event("resize"))
}

beforeEach(() => {
  vi.spyOn(dashboardService, "getDashboard").mockResolvedValue({ dashboard: dashboard() })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardView — responsive layout + autosave", () => {
  it("Scenario 4: re-resolves the active WidgetLayout tier as the viewport crosses each breakpoint threshold", async () => {
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    act(() => setViewportWidth(1920))
    expect(useDashboardBuilderStore.getState().activeBreakpoint).toBe("desktop")

    act(() => setViewportWidth(900))
    expect(useDashboardBuilderStore.getState().activeBreakpoint).toBe("tablet")

    act(() => setViewportWidth(400))
    expect(useDashboardBuilderStore.getState().activeBreakpoint).toBe("mobile")
  })

  it("Scenario 3: layout changes have no manual 'Save Layout' action — autosave is the only path (FR-009)", async () => {
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    expect(screen.queryByRole("button", { name: /save layout/i })).toBeNull()
  })
})
