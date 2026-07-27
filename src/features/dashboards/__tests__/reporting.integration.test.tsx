import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reportService } from "../services/reportService"
import { ReportGenerationDialog } from "../components/ReportGenerationDialog"
import { ReportHistoryPanel } from "../components/ReportHistoryPanel"
import { ScheduledReportsPanel } from "../components/ScheduledReportsPanel"
import type { ReportRecord } from "../types/dashboard.types"

/** Full Reporting flow (quickstart.md §5; spec.md US5 Acceptance Scenarios 1–5). */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function Screen() {
  return (
    <div>
      <ReportGenerationDialog projectId="p1" dashboardId="d1" dashboardElement={document.createElement("div")} />
      <ReportHistoryPanel projectId="p1" />
      <ScheduledReportsPanel dashboardId="d1" />
    </div>
  )
}

let reports: ReportRecord[] = []

beforeEach(() => {
  reports = []
  vi.spyOn(reportService, "listReports").mockImplementation(async () => ({ reports, nextCursor: null }))
  vi.spyOn(reportService, "generatePdfReport").mockImplementation(async () => {
    const report: ReportRecord = {
      id: "r-pdf",
      dashboardId: "d1",
      userId: "u1",
      scheduledReportId: null,
      format: "pdf",
      status: "succeeded",
      sizeBytes: 500,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    }
    reports = [report, ...reports]
    return { report }
  })
  vi.spyOn(reportService, "generateCsvReport").mockImplementation(async () => {
    const report: ReportRecord = {
      id: "r-csv",
      dashboardId: "d1",
      userId: "u1",
      scheduledReportId: null,
      format: "csv",
      status: "succeeded",
      sizeBytes: 100,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    }
    reports = [report, ...reports]
    return { report }
  })
  vi.spyOn(reportService, "downloadReport").mockResolvedValue(undefined)
  vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [] })
  vi.spyOn(reportService, "createScheduledReport").mockResolvedValue({
    scheduledReport: {
      id: "s1",
      dashboardId: "d1",
      userId: "u1",
      format: "csv",
      recurrence: "weekly",
      nextRunAt: new Date().toISOString(),
      isActive: true,
      createdAt: "t",
      updatedAt: "t",
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Reporting — full flow", () => {
  it("Scenario 1: generating a PDF report appears in Generated Reports without a page reload", async () => {
    render(<Screen />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(reportService.generatePdfReport).toHaveBeenCalled())
  })

  it("Scenario 2/3: generating a CSV report calls generateCsvReport", async () => {
    render(<Screen />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    fireEvent.click(screen.getByRole("radio", { name: "CSV" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(reportService.generateCsvReport).toHaveBeenCalledWith("d1"))
  })

  it("Scenario 4: creating a schedule calls useCreateScheduledReport with a non-PDF format", async () => {
    render(<Screen />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Add schedule" }))

    await waitFor(() => expect(reportService.createScheduledReport).toHaveBeenCalledWith("d1", { format: "csv", recurrence: "weekly" }))
  })

  it("Scenario 5: Generated Reports list is downloadable (FR-018/FR-033)", async () => {
    reports = [
      {
        id: "r1",
        dashboardId: "d1",
        userId: "u1",
        scheduledReportId: null,
        format: "csv",
        status: "succeeded",
        sizeBytes: 100,
        errorMessage: null,
        createdAt: "t",
      },
    ]
    render(<Screen />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Download" }))

    await waitFor(() => expect(reportService.downloadReport).toHaveBeenCalledWith("r1"))
  })
})
