import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reportService } from "../../services/reportService"
import { ScheduledReportsPanel } from "../ScheduledReportsPanel"
import type { ScheduledReportRecord } from "../../types/dashboard.types"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function schedule(overrides: Partial<ScheduledReportRecord> = {}): ScheduledReportRecord {
  return {
    id: "s1",
    dashboardId: "d1",
    userId: "u1",
    format: "csv",
    recurrence: "weekly",
    nextRunAt: "2026-02-01T00:00:00.000Z",
    isActive: true,
    createdAt: "t",
    updatedAt: "t",
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [] })
  vi.spyOn(reportService, "createScheduledReport").mockResolvedValue({ scheduledReport: schedule() })
  vi.spyOn(reportService, "updateScheduledReport").mockResolvedValue({ scheduledReport: schedule({ isActive: false }) })
  vi.spyOn(reportService, "deleteScheduledReport").mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ScheduledReportsPanel", () => {
  it("the format picker structurally excludes PDF (research.md Decision 10, T203/T209)", () => {
    render(<ScheduledReportsPanel dashboardId="d1" />, { wrapper: wrapper() })
    const select = screen.getByLabelText("Format") as HTMLSelectElement
    const options = within(select).getAllByRole("option").map((option) => option.textContent)
    expect(options).toEqual(["excel", "csv", "html"])
    expect(options).not.toContain("pdf")
  })

  it("creates a schedule with the selected format/recurrence", async () => {
    render(<ScheduledReportsPanel dashboardId="d1" />, { wrapper: wrapper() })
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "excel" } })
    fireEvent.change(screen.getByLabelText("Recurrence"), { target: { value: "daily" } })
    fireEvent.click(screen.getByRole("button", { name: "Add schedule" }))

    await waitFor(() => expect(reportService.createScheduledReport).toHaveBeenCalledWith("d1", { format: "excel", recurrence: "daily" }))
  })

  it("pause/resume toggles isActive (T204)", async () => {
    vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [schedule()] })
    render(<ScheduledReportsPanel dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))

    await waitFor(() =>
      expect(reportService.updateScheduledReport).toHaveBeenCalledWith("s1", { isActive: false }),
    )
  })

  it("delete removes the schedule (past Report rows are unaffected server-side, T204)", async () => {
    vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [schedule()] })
    render(<ScheduledReportsPanel dashboardId="d1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(reportService.deleteScheduledReport).toHaveBeenCalledWith("s1"))
  })

  it("shows nextRunAt converted to the viewer's local time (T205)", async () => {
    vi.spyOn(reportService, "listScheduledReports").mockResolvedValue({ scheduledReports: [schedule()] })
    render(<ScheduledReportsPanel dashboardId="d1" />, { wrapper: wrapper() })

    const expected = new Date("2026-02-01T00:00:00.000Z").toLocaleString()
    await waitFor(() => expect(screen.getByText(`Next run: ${expected}`)).toBeTruthy())
  })
})
