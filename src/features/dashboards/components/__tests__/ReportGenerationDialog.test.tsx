import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reportService } from "../../services/reportService"
import { ReportGenerationDialog } from "../ReportGenerationDialog"

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  vi.spyOn(reportService, "generatePdfReport").mockResolvedValue({ report: { id: "r1" } as never })
  vi.spyOn(reportService, "generateExcelReport").mockResolvedValue({ report: { id: "r2" } as never })
  vi.spyOn(reportService, "generateCsvReport").mockResolvedValue({ report: { id: "r3" } as never })
  vi.spyOn(reportService, "generateHtmlReport").mockResolvedValue({ report: { id: "r4" } as never })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ReportGenerationDialog", () => {
  it("PDF path: captures dashboardElement via generatePdfReport (T196)", async () => {
    const element = document.createElement("div")
    render(<ReportGenerationDialog projectId="p1" dashboardId="d1" dashboardElement={element} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(reportService.generatePdfReport).toHaveBeenCalledWith("d1", element))
  })

  it("Excel path: calls generateExcelReport (T198)", async () => {
    render(<ReportGenerationDialog projectId="p1" dashboardId="d1" dashboardElement={null} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    fireEvent.click(screen.getByRole("radio", { name: "Excel" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(reportService.generateExcelReport).toHaveBeenCalledWith("d1"))
  })

  it("CSV path: calls generateCsvReport (T199)", async () => {
    render(<ReportGenerationDialog projectId="p1" dashboardId="d1" dashboardElement={null} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    fireEvent.click(screen.getByRole("radio", { name: "CSV" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(reportService.generateCsvReport).toHaveBeenCalledWith("d1"))
  })

  it("HTML path: calls generateHtmlReport (T200)", async () => {
    render(<ReportGenerationDialog projectId="p1" dashboardId="d1" dashboardElement={null} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    fireEvent.click(screen.getByRole("radio", { name: "HTML" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(reportService.generateHtmlReport).toHaveBeenCalledWith("d1"))
  })

  it("closes the dialog on success (persists immediately, T197)", async () => {
    render(<ReportGenerationDialog projectId="p1" dashboardId="d1" dashboardElement={null} />, { wrapper: wrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }))
    fireEvent.click(screen.getByRole("radio", { name: "CSV" }))
    fireEvent.click(screen.getByRole("button", { name: "Generate" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})
