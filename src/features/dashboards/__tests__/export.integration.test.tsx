import { createRef } from "react"
import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { analyticsService } from "../services/analyticsService"
import { dashboardExportService } from "../services/dashboardExportService"
import { reportService } from "../services/reportService"
import { widgetService } from "../services/widgetService"
import { DashboardExportMenu } from "../components/DashboardExportMenu"
import { ReportHistoryPanel } from "../components/ReportHistoryPanel"
import { WidgetRenderer } from "../components/WidgetRenderer"
import type { DashboardWidgetRecord } from "../types/dashboard.types"

/**
 * Full Export flow (quickstart.md §9; spec.md US9 Acceptance Scenarios
 * 1–4), composing the real `DashboardExportMenu`/`WidgetRenderer`/
 * `ReportHistoryPanel` with only the service boundary mocked, matching
 * `liveAnalytics.integration.test.tsx`'s established pattern.
 */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function chartWidget(overrides: Partial<DashboardWidgetRecord> = {}): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type: "chartBar",
    title: "Parcels by Status",
    dataSourceType: "layer",
    dataSourceId: "layer-1",
    config: { groupByAttribute: "status" },
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

function tableWidget(overrides: Partial<DashboardWidgetRecord> = {}): DashboardWidgetRecord {
  return { ...chartWidget(overrides), id: "w2", type: "table", title: "Parcels" }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Export — full flow", () => {
  it("Scenario 1: exporting the whole dashboard downloads its current visual state", async () => {
    const exportSpy = vi.spyOn(dashboardExportService, "exportDashboardAsImage").mockResolvedValue(undefined)
    const ref = createRef<HTMLDivElement>()

    render(
      <div>
        <div ref={ref} data-testid="dashboard-root" />
        <DashboardExportMenu projectId="p1" dashboardId="d1" widgets={[]} dashboardElementRef={ref} />
      </div>,
    )

    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Export dashboard as image"))

    await waitFor(() => expect(exportSpy).toHaveBeenCalledWith(ref.current, "dashboard.png"))
  })

  it("Scenario 2: exporting a single chart widget downloads an image matching that widget's own rendering", async () => {
    vi.spyOn(widgetService, "getWidgetData").mockResolvedValue({ dataSourceUnavailable: false, data: { features: [] } })
    const exportSpy = vi.spyOn(dashboardExportService, "exportWidgetAsImage").mockResolvedValue(undefined)

    render(<WidgetRenderer dashboardId="d1" widget={chartWidget()} canEdit={false} />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull())

    fireEvent.click(screen.getByRole("button", { name: "Export Parcels by Status as image" }))

    await waitFor(() => expect(exportSpy).toHaveBeenCalledTimes(1))
    expect(exportSpy.mock.calls[0][1]).toBe("Parcels by Status.png")
  })

  it("Scenario 3: exporting a table widget's data downloads a data file", async () => {
    vi.spyOn(analyticsService, "getAnalyticsSnapshot").mockResolvedValue({ data: { featureCount: 3 }, computedAt: "t", isCached: true })
    const exportSpy = vi.spyOn(dashboardExportService, "exportTableWidgetData").mockResolvedValue(undefined)
    const ref = createRef<HTMLDivElement>()

    render(<DashboardExportMenu projectId="p1" dashboardId="d1" widgets={[tableWidget()]} dashboardElementRef={ref} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Parcels"))
    fireEvent.click(await screen.findByText("CSV"))

    await waitFor(() => expect(exportSpy).toHaveBeenCalledWith("layer-1", "csv", "Parcels.csv"))
  })

  it("Scenario 4: downloading a previously generated report reuses ReportHistoryPanel's existing download path (T269 — no duplicate implementation)", async () => {
    vi.spyOn(reportService, "listReports").mockResolvedValue({
      reports: [
        {
          id: "r1",
          dashboardId: "d1",
          userId: "u1",
          scheduledReportId: null,
          format: "pdf",
          status: "succeeded",
          sizeBytes: 1024,
          errorMessage: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      nextCursor: null,
    })
    const downloadSpy = vi.spyOn(reportService, "downloadReport").mockResolvedValue(undefined)

    render(<ReportHistoryPanel projectId="p1" />, { wrapper: wrapper() })
    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Download" }))

    await waitFor(() => expect(downloadSpy).toHaveBeenCalledWith("r1"))
  })
})
