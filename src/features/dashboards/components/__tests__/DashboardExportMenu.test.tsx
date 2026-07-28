import { createRef } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { analyticsService } from "../../services/analyticsService"
import { dashboardExportService } from "../../services/dashboardExportService"
import { DashboardExportMenu } from "../DashboardExportMenu"
import type { DashboardWidgetRecord } from "../../types/dashboard.types"

function tableWidget(overrides: Partial<DashboardWidgetRecord> = {}): DashboardWidgetRecord {
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
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(analyticsService, "getAnalyticsSnapshot").mockResolvedValue({
    data: { featureCount: 5 },
    computedAt: "t",
    isCached: true,
  })
  vi.spyOn(dashboardExportService, "exportDashboardAsImage").mockResolvedValue(undefined)
  vi.spyOn(dashboardExportService, "exportWidgetAsImage").mockResolvedValue(undefined)
  vi.spyOn(dashboardExportService, "exportTableWidgetData").mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DashboardExportMenu", () => {
  it("T262 — 'Export dashboard as image' captures the dashboard element ref", async () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <div>
        <div ref={ref} />
        <DashboardExportMenu projectId="p1" widgets={[]} dashboardElementRef={ref} />
      </div>,
    )

    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Export dashboard as image"))

    await waitFor(() => expect(dashboardExportService.exportDashboardAsImage).toHaveBeenCalledWith(ref.current, "dashboard.png"))
  })

  it("no table export section renders when the dashboard has no table widgets", async () => {
    const ref = createRef<HTMLDivElement>()
    render(<DashboardExportMenu projectId="p1" widgets={[]} dashboardElementRef={ref} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    await waitFor(() => expect(screen.getByText("Export dashboard as image")).toBeTruthy())
    expect(screen.queryByText("Export table data")).toBeNull()
  })

  it("T264/T265 — exporting a table widget under the size threshold downloads immediately, no warning", async () => {
    const ref = createRef<HTMLDivElement>()
    render(<DashboardExportMenu projectId="p1" widgets={[tableWidget()]} dashboardElementRef={ref} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Parcels"))
    fireEvent.click(await screen.findByText("CSV"))

    await waitFor(() =>
      expect(dashboardExportService.exportTableWidgetData).toHaveBeenCalledWith("layer-1", "csv", "Parcels.csv"),
    )
    expect(screen.queryByText("Large export")).toBeNull()
  })

  it("T268 — a table export above the warning threshold shows a confirmation before downloading", async () => {
    vi.mocked(analyticsService.getAnalyticsSnapshot).mockResolvedValue({
      data: { featureCount: 50_000 },
      computedAt: "t",
      isCached: true,
    })
    const ref = createRef<HTMLDivElement>()
    render(<DashboardExportMenu projectId="p1" widgets={[tableWidget()]} dashboardElementRef={ref} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Parcels"))
    fireEvent.click(await screen.findByText("Excel"))

    await waitFor(() => expect(screen.getByText("Large export")).toBeTruthy())
    expect(screen.getByText(/50,000 rows/)).toBeTruthy()
    expect(dashboardExportService.exportTableWidgetData).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Export anyway" }))
    await waitFor(() =>
      expect(dashboardExportService.exportTableWidgetData).toHaveBeenCalledWith("layer-1", "excel", "Parcels.xlsx"),
    )
  })

  it("T268 — cancelling the large-export warning never downloads", async () => {
    vi.mocked(analyticsService.getAnalyticsSnapshot).mockResolvedValue({
      data: { featureCount: 50_000 },
      computedAt: "t",
      isCached: true,
    })
    const ref = createRef<HTMLDivElement>()
    render(<DashboardExportMenu projectId="p1" widgets={[tableWidget()]} dashboardElementRef={ref} />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(await screen.findByText("Parcels"))
    fireEvent.click(await screen.findByText("CSV"))
    await waitFor(() => expect(screen.getByText("Large export")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByText("Large export")).toBeNull())
    expect(dashboardExportService.exportTableWidgetData).not.toHaveBeenCalled()
  })
})
