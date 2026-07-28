import type {
  CreateScheduledReportRequestInput,
  UpdateScheduledReportRequestInput,
} from "@/shared/contracts/report.schema"
import type { ReportRecord, ScheduledReportRecord } from "../types/dashboard.types"
import { apiFetch } from "./apiFetch"
import { buildPdfFromImages, captureElementAsPng, downloadBlob } from "./captureUtils"

/**
 * Client access to report generation/listing/download and scheduling
 * (contracts/client-api.md `reportService.ts`) — the one service permitted
 * real logic beyond request shaping (research.md Decision 9), matching
 * `exportService.ts`'s carve-out in 007.
 */

/** Converts a `Blob` to a base64 string for the JSON request body — `createReportRequestSchema.fileContent`. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** Client access to report generation/listing/download and scheduling (contracts/client-api.md `reportService.ts`). */
export const reportService = {
  /** Captures the rendered dashboard DOM via `html2canvas`, embeds it in a `jsPDF` document, then logs it (research.md Decision 9 — always client-side; never a server-side PDF-rendering endpoint). */
  async generatePdfReport(dashboardId: string, dashboardElement: HTMLElement): Promise<{ report: ReportRecord }> {
    const image = await captureElementAsPng(dashboardElement)
    const pdfBlob = await buildPdfFromImages([image])
    const fileContent = await blobToBase64(pdfBlob)
    return reportService.logReport(dashboardId, "pdf", fileContent)
  },

  /** Lets the server generate the Excel file from the dashboard's current data (api-contracts.md — `fileContent` omitted). */
  generateExcelReport(dashboardId: string): Promise<{ report: ReportRecord }> {
    return reportService.logReport(dashboardId, "excel")
  },

  generateCsvReport(dashboardId: string): Promise<{ report: ReportRecord }> {
    return reportService.logReport(dashboardId, "csv")
  },

  generateHtmlReport(dashboardId: string): Promise<{ report: ReportRecord }> {
    return reportService.logReport(dashboardId, "html")
  },

  logReport(
    dashboardId: string,
    format: "pdf" | "excel" | "csv" | "html",
    fileContent?: string,
  ): Promise<{ report: ReportRecord }> {
    return apiFetch(`/api/dashboards/${dashboardId}/reports`, {
      method: "POST",
      body: JSON.stringify({ format, fileContent }),
    })
  },

  listReports(
    projectId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<{ reports: ReportRecord[]; nextCursor: string | null }> {
    const search = new URLSearchParams()
    if (params?.cursor) search.set("cursor", params.cursor)
    if (params?.limit !== undefined) search.set("limit", String(params.limit))
    const query = search.toString()
    return apiFetch(`/api/projects/${projectId}/reports${query ? `?${query}` : ""}`)
  },

  /** Fetches the report file and triggers a browser download. */
  async downloadReport(reportId: string): Promise<void> {
    const response = await fetch(`/api/reports/${reportId}/download`)
    if (!response.ok) {
      throw new Error(`Failed to download report ${reportId}: ${response.status}`)
    }
    const blob = await response.blob()
    const disposition = response.headers.get("content-disposition") ?? ""
    const match = /filename="(.+)"/.exec(disposition)
    const filename = match?.[1] ?? `report-${reportId}`
    downloadBlob(blob, filename)
  },

  listScheduledReports(dashboardId: string): Promise<{ scheduledReports: ScheduledReportRecord[] }> {
    return apiFetch(`/api/dashboards/${dashboardId}/scheduled-reports`)
  },

  createScheduledReport(
    dashboardId: string,
    input: CreateScheduledReportRequestInput,
  ): Promise<{ scheduledReport: ScheduledReportRecord }> {
    return apiFetch(`/api/dashboards/${dashboardId}/scheduled-reports`, { method: "POST", body: JSON.stringify(input) })
  },

  updateScheduledReport(
    scheduledReportId: string,
    input: UpdateScheduledReportRequestInput,
  ): Promise<{ scheduledReport: ScheduledReportRecord }> {
    return apiFetch(`/api/scheduled-reports/${scheduledReportId}`, { method: "PATCH", body: JSON.stringify(input) })
  },

  deleteScheduledReport(scheduledReportId: string): Promise<void> {
    return apiFetch(`/api/scheduled-reports/${scheduledReportId}`, { method: "DELETE" })
  },
}
