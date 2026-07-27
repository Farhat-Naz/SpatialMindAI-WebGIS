import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reportService } from "../../services/reportService"
import { ReportHistoryPanel } from "../ReportHistoryPanel"
import type { ReportRecord } from "../../types/dashboard.types"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function report(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: "r1",
    dashboardId: "d1",
    userId: "u1",
    scheduledReportId: null,
    format: "csv",
    status: "succeeded",
    sizeBytes: 100,
    errorMessage: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(reportService, "downloadReport").mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ReportHistoryPanel", () => {
  it("lists reports and downloads on click (T206/FR-033)", async () => {
    vi.spyOn(reportService, "listReports").mockResolvedValue({ reports: [report()], nextCursor: null })
    render(<ReportHistoryPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: "Download" })).toBeTruthy())
    expect(within(screen.getByRole("list")).getByText("csv")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Download" }))

    await waitFor(() => expect(reportService.downloadReport).toHaveBeenCalledWith("r1"))
  })

  it("a failed report shows its errorMessage and no download link (T207)", async () => {
    vi.spyOn(reportService, "listReports").mockResolvedValue({
      reports: [report({ status: "failed", errorMessage: "Widget data unavailable." })],
      nextCursor: null,
    })
    render(<ReportHistoryPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("Widget data unavailable.")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull()
  })

  it("format filter narrows the visible list client-side (T202)", async () => {
    vi.spyOn(reportService, "listReports").mockResolvedValue({
      reports: [report({ id: "r1", format: "csv" }), report({ id: "r2", format: "pdf" })],
      nextCursor: null,
    })
    render(<ReportHistoryPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByRole("list")).toBeTruthy())
    const list = screen.getByRole("list")
    expect(within(list).getAllByText(/^(csv|pdf)$/)).toHaveLength(2)

    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "pdf" } })

    expect(within(list).getAllByText(/^(csv|pdf)$/)).toHaveLength(1)
    expect(within(list).getByText("pdf")).toBeTruthy()
  })

  it("shows an empty state when there are no reports", async () => {
    vi.spyOn(reportService, "listReports").mockResolvedValue({ reports: [], nextCursor: null })
    render(<ReportHistoryPanel projectId="p1" />, { wrapper: wrapper() })

    await waitFor(() => expect(screen.getByText("No reports yet.")).toBeTruthy())
  })
})
