"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { reportService } from "../services/reportService"
import { queryKeys } from "../services/queryKeys"
import type { CreateScheduledReportRequestInput, UpdateScheduledReportRequestInput } from "../types/dashboard.types"

/** A dashboard's scheduled reports (US5/FR-017). */
export function useScheduledReports(dashboardId: string) {
  return useQuery({
    queryKey: queryKeys.scheduledReports(dashboardId),
    queryFn: () => reportService.listScheduledReports(dashboardId),
    enabled: Boolean(dashboardId),
  })
}

/** Creates a schedule; rejects `format: "pdf"` server-side (research.md Decision 10). */
export function useCreateScheduledReport(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateScheduledReportRequestInput) => reportService.createScheduledReport(dashboardId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports(dashboardId) })
    },
  })
}

/** Updates a schedule's `recurrence`/`isActive` (pause/resume). */
export function useUpdateScheduledReport(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ scheduledReportId, input }: { scheduledReportId: string; input: UpdateScheduledReportRequestInput }) =>
      reportService.updateScheduledReport(scheduledReportId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports(dashboardId) })
    },
  })
}

/** Deletes a schedule. */
export function useDeleteScheduledReport(dashboardId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (scheduledReportId: string) => reportService.deleteScheduledReport(scheduledReportId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scheduledReports(dashboardId) })
    },
  })
}
