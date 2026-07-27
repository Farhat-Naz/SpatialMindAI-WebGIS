"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { reportService } from "../services/reportService"
import { queryKeys } from "../services/queryKeys"

/** Generates+logs a report; `retry: false` (T086) — a retried generation would duplicate the `Report` row. */
export function useGenerateReport(dashboardId: string, projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { format: "pdf" | "excel" | "csv" | "html"; dashboardElement?: HTMLElement }) => {
      if (input.format === "pdf") {
        if (!input.dashboardElement) {
          throw new Error("A PDF report requires the dashboard's rendered DOM element.")
        }
        return reportService.generatePdfReport(dashboardId, input.dashboardElement)
      }
      if (input.format === "excel") return reportService.generateExcelReport(dashboardId)
      if (input.format === "csv") return reportService.generateCsvReport(dashboardId)
      return reportService.generateHtmlReport(dashboardId)
    },
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reportsList(projectId) })
    },
  })
}

/** Cursor-paginated Generated Reports list (FR-018/FR-033). */
export function useReports(projectId: string, params?: { cursor?: string; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.reports(projectId, params),
    queryFn: () => reportService.listReports(projectId, params),
    enabled: Boolean(projectId),
  })
}

/** Triggers a browser download of a report file — mirrors 007's `useExportResult` mutation-shaped wrapper pattern. */
export function useDownloadReport() {
  return useMutation({
    mutationFn: (reportId: string) => reportService.downloadReport(reportId),
  })
}
