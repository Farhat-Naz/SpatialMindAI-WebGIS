import type { ReactNode } from "react"
import { createRef } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { analyticsService } from "../services/analyticsService"
import { dashboardAdminService } from "../services/dashboardAdminService"
import { dashboardExportService } from "../services/dashboardExportService"
import { dashboardFilterService } from "../services/dashboardFilterService"
import { DashboardExportMenu } from "../components/DashboardExportMenu"
import { DashboardFilterBar } from "../components/DashboardFilterBar"
import { useDashboardFilterStore } from "../store/dashboardFilterStore"
import type { DashboardWidgetRecord } from "../types/dashboard.types"

/**
 * T340 — Filter → Export → Admin-audit cross-story journey (US6/US9/US10):
 * apply a global filter, export a filtered widget, confirm the export is
 * logged (T340's own addition to close this gap) with the active filter as
 * metadata — the same data the Administration audit log (T286) surfaces.
 */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function tableWidget(): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "table",
    title: "Parcels",
    dataSourceType: "layer",
    dataSourceId: "layer-1",
    config: {},
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
  }
}

const INITIAL_FILTER_STATE = useDashboardFilterStore.getState()

beforeEach(() => {
  useDashboardFilterStore.setState(INITIAL_FILTER_STATE, true)
  vi.spyOn(dashboardFilterService, "listFilters").mockResolvedValue({ filters: [] })
  vi.spyOn(analyticsService, "getAnalyticsSnapshot").mockResolvedValue({ data: { featureCount: 3 }, computedAt: "t", isCached: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Cross-story: Filter → Export → Admin-audit", () => {
  it("US6: applying a global date filter, then US9: exporting reflects that filter, and the export is logged for US10's audit log", async () => {
    const exportSpy = vi.spyOn(dashboardExportService, "exportTableWidgetData").mockResolvedValue(undefined)
    const logSpy = vi.spyOn(dashboardExportService, "logExport").mockResolvedValue(undefined)
    const ref = createRef<HTMLDivElement>()

    // This scenario is about the live, in-progress filter draft — not about
    // reconciling with persisted filters — so the dashboard's own filter
    // list is left permanently pending (same rationale as
    // `DashboardFilterBar.test.tsx`'s Acceptance Scenario 4 test): otherwise
    // `useDashboardFilters` resolving mid-test would race the direct
    // filter-bar interaction below and wipe it via `resetToSaved`.
    vi.spyOn(dashboardFilterService, "listFilters").mockReturnValue(new Promise(() => {}))

    render(
      <>
        <DashboardFilterBar projectId="p1" dashboardId="d1" />
        <DashboardExportMenu projectId="p1" dashboardId="d1" widgets={[tableWidget()]} dashboardElementRef={ref} />
      </>,
      { wrapper: wrapper() },
    )

    // US6 — apply a global date filter.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } })
    await waitFor(() =>
      expect(useDashboardFilterStore.getState().activeGlobalFilters).toContainEqual(
        expect.objectContaining({ filterType: "date" }),
      ),
    )

    // US9 — export the (filtered) table widget.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Parcels"))
    fireEvent.click(await screen.findByText("CSV"))

    await waitFor(() => expect(exportSpy).toHaveBeenCalledWith("layer-1", "csv", "Parcels.csv"))

    // The export is logged with the filter that was active at export time —
    // the same data US10's Administration audit log (T286) surfaces.
    await waitFor(() =>
      expect(logSpy).toHaveBeenCalledWith(
        "d1",
        "csv",
        expect.arrayContaining([expect.objectContaining({ filterType: "date", config: { from: "2026-01-01T00:00:00.000Z" } })]),
      ),
    )
  })

  it("US10: the Administration audit log surfaces a logged export alongside other dashboard actions", async () => {
    vi.spyOn(dashboardAdminService, "getAdminOverview").mockResolvedValue({
      dashboards: [],
      usage: { activityCountByDashboard: [], mostUsedWidgetTypes: [] },
    })
    vi.spyOn(dashboardAdminService, "listAuditLog").mockResolvedValue({
      activities: [
        {
          id: "a1",
          userId: "u1",
          action: "export",
          targetType: "dashboard",
          targetId: "d1",
          metadata: { format: "csv", filters: [{ filterType: "date", config: { from: "2026-01-01T00:00:00.000Z" } }] },
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    })

    const { DashboardAdminPanel } = await import("../components/DashboardAdminPanel")
    render(<DashboardAdminPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText(/u1 — export \(dashboard\)/)).toBeTruthy())
  })
})
