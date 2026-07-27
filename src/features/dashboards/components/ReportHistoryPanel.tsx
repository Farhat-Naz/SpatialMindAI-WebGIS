"use client"

import { useMemo, useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { useDownloadReport, useReports } from "../hooks/useReports"
import type { ReportRecord } from "../types/dashboard.types"

const FORMAT_FILTERS = ["all", "pdf", "excel", "csv", "html"] as const

/** Stable reference so `data?.reports ?? EMPTY_REPORTS` never destabilizes `useMemo`'s dependency array across renders where `data` is still loading. */
const EMPTY_REPORTS: ReportRecord[] = []

/**
 * Generated Reports list (US5/FR-018/FR-033) — cursor-paginated, with a
 * client-side format filter over the loaded page (T202, SC-007's "locate a
 * report in under 15 seconds"). A `status: "failed"` report shows its
 * `errorMessage` and offers no download link (T207, spec Edge Cases).
 */
export function ReportHistoryPanel({ projectId }: { projectId: string }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [formatFilter, setFormatFilter] = useState<(typeof FORMAT_FILTERS)[number]>("all")
  const { data, isLoading } = useReports(projectId, { cursor })
  const downloadReport = useDownloadReport()

  const reports = data?.reports ?? EMPTY_REPORTS
  const filtered = useMemo(
    () => (formatFilter === "all" ? reports : reports.filter((report) => report.format === formatFilter)),
    [reports, formatFilter],
  )

  if (isLoading) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Loading reports…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <label htmlFor="report-format-filter" className="text-sm font-medium">
          Format
        </label>
        <select
          id="report-format-filter"
          value={formatFilter}
          onChange={(event) => setFormatFilter(event.target.value as (typeof FORMAT_FILTERS)[number])}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          {FORMAT_FILTERS.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All formats" : option}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {filtered.map((report) => (
            <ReportRow key={report.id} report={report} onDownload={() => downloadReport.mutate(report.id)} />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!data?.nextCursor} onClick={() => setCursor(data?.nextCursor ?? undefined)}>
          Next page
        </Button>
      </div>
    </div>
  )
}

function ReportRow({ report, onDownload }: { report: ReportRecord; onDownload: () => void }) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="flex flex-col">
        <span className="font-medium uppercase">{report.format}</span>
        <span className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString()}</span>
        {report.status === "failed" && (
          <span role="alert" className="text-xs text-destructive">
            {report.errorMessage ?? "Report generation failed."}
          </span>
        )}
      </div>
      {report.status === "succeeded" ? (
        <Button type="button" variant="outline" size="sm" onClick={onDownload}>
          Download
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Unavailable</span>
      )}
    </li>
  )
}
