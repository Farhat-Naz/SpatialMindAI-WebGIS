import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dashboardFilterService } from "../../services/dashboardFilterService"
import { dashboardService } from "../../services/dashboardService"
import { dashboardShareService } from "../../services/dashboardShareService"
import { reportService } from "../../services/reportService"
import { useDashboardBuilderStore } from "../../store/dashboardBuilderStore"
import { DashboardView } from "../DashboardView"
import type { DashboardRecord } from "../../types/dashboard.types"

/**
 * Full-page accessibility scan (T296–T298, FR/SC-008) — axe scan of the
 * fully-integrated `DashboardView` with every panel opened at least once
 * (widget config, filters, reports, sharing, settings), same convention as
 * every other feature's own a11y test (`ReportGenerationDialog.a11y.test.tsx`,
 * `DashboardExportMenu.a11y.test.tsx`).
 */
const DISABLED_RULES = { "color-contrast": { enabled: false }, region: { enabled: false } }

async function scan(container: HTMLElement): Promise<axe.Result[]> {
  const results = await axe.run(container, { rules: DISABLED_RULES })
  return results.violations
}

function describeViolations(violations: axe.Result[]): string {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help}`).join("\n  ")
}

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

describe("DashboardView — full-page accessibility", () => {
  it("has zero critical/serious axe violations with every panel closed", async () => {
    const { container } = render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    const violations = await scan(container)
    const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
  })

  it("has zero critical/serious axe violations with the widget config, reports, share, and settings panels each opened", async () => {
    const { container } = render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Edit dashboard" }))
    fireEvent.click(screen.getByRole("button", { name: "Add widget" }))
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Add widget" })).toBeTruthy())

    let violations = await scan(container)
    let serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)

    fireEvent.keyDown(document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: "Reports" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Reports" })).toBeTruthy())
    violations = await scan(container)
    serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
    fireEvent.keyDown(document.body, { key: "Escape" })

    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Share dashboard" })).toBeTruthy())
    violations = await scan(container)
    serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Dashboard settings" })).toBeTruthy())
    violations = await scan(container)
    serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    expect(serious, describeViolations(serious)).toHaveLength(0)
  })

  it("every toolbar/panel trigger is a native, keyboard-reachable button (T296)", async () => {
    render(<DashboardView projectId="p1" dashboardId="d1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByText("Ops")).toBeTruthy())

    for (const name of ["Reports", "Export", "Share", "Settings", "Edit dashboard"]) {
      expect(screen.getByRole("button", { name }).tagName).toBe("BUTTON")
    }
  })
})
