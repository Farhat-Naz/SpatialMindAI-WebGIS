import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDownloadReport, useGenerateReport, useReports } from "../useReports"
import {
  useCreateScheduledReport,
  useDeleteScheduledReport,
  useScheduledReports,
  useUpdateScheduledReport,
} from "../useScheduledReports"
import { reportService } from "../../services/reportService"

vi.mock("../../services/reportService", () => ({
  reportService: {
    generatePdfReport: vi.fn(),
    generateExcelReport: vi.fn(),
    generateCsvReport: vi.fn(),
    generateHtmlReport: vi.fn(),
    listReports: vi.fn(),
    downloadReport: vi.fn(),
    listScheduledReports: vi.fn(),
    createScheduledReport: vi.fn(),
    updateScheduledReport: vi.fn(),
    deleteScheduledReport: vi.fn(),
  },
}))

const mockedService = vi.mocked(reportService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

describe("useGenerateReport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not retry on failure (a retry would duplicate the Report row)", async () => {
    mockedService.generateCsvReport.mockRejectedValue(new Error("boom"))
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useGenerateReport("d1", "p1"), { wrapper: Wrapper })

    result.current.mutate({ format: "csv" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockedService.generateCsvReport).toHaveBeenCalledTimes(1)
  })

  it("dispatches to generateCsvReport/generateExcelReport/generateHtmlReport by format", async () => {
    mockedService.generateExcelReport.mockResolvedValue({ report: {} as never })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useGenerateReport("d1", "p1"), { wrapper: Wrapper })

    result.current.mutate({ format: "excel" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.generateExcelReport).toHaveBeenCalledWith("d1")
  })

  it("pdf format requires a dashboardElement", async () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useGenerateReport("d1", "p1"), { wrapper: Wrapper })

    result.current.mutate({ format: "pdf" })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockedService.generatePdfReport).not.toHaveBeenCalled()
  })

  it("invalidates the project's report list on success", async () => {
    mockedService.generateCsvReport.mockResolvedValue({ report: {} as never })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useGenerateReport("d1", "p1"), { wrapper: Wrapper })

    result.current.mutate({ format: "csv" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "reports"] })
  })
})

describe("useReports", () => {
  it("lists reports for a project", async () => {
    mockedService.listReports.mockResolvedValue({ reports: [], nextCursor: null })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useReports("p1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe("useDownloadReport", () => {
  it("triggers a download via the service", async () => {
    mockedService.downloadReport.mockResolvedValue(undefined)
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useDownloadReport(), { wrapper: Wrapper })

    result.current.mutate("report-1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.downloadReport).toHaveBeenCalledWith("report-1")
  })
})

describe("useScheduledReports hooks", () => {
  it("useScheduledReports lists a dashboard's schedules", async () => {
    mockedService.listScheduledReports.mockResolvedValue({ scheduledReports: [] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useScheduledReports("d1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it("useCreateScheduledReport invalidates the dashboard's schedule list", async () => {
    mockedService.createScheduledReport.mockResolvedValue({ scheduledReport: {} as never })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useCreateScheduledReport("d1"), { wrapper: Wrapper })

    result.current.mutate({ format: "csv", recurrence: "daily" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1", "scheduledReports"] })
  })

  it("useUpdateScheduledReport invalidates the dashboard's schedule list", async () => {
    mockedService.updateScheduledReport.mockResolvedValue({ scheduledReport: {} as never })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useUpdateScheduledReport("d1"), { wrapper: Wrapper })

    result.current.mutate({ scheduledReportId: "s1", input: { isActive: false } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1", "scheduledReports"] })
  })

  it("useDeleteScheduledReport invalidates the dashboard's schedule list", async () => {
    mockedService.deleteScheduledReport.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteScheduledReport("d1"), { wrapper: Wrapper })

    result.current.mutate("s1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["dashboards", "d1", "scheduledReports"] })
  })
})
