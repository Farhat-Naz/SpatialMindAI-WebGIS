"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import {
  useCreateScheduledReport,
  useDeleteScheduledReport,
  useScheduledReports,
  useUpdateScheduledReport,
} from "../hooks/useScheduledReports"
import type { ScheduledReportRecord } from "../types/dashboard.types"

/** Scheduled formats deliberately exclude `"pdf"` (research.md Decision 10 — no browser is present when a schedule fires) at the type level, not just server-side validation. */
const SCHEDULED_FORMATS = ["excel", "csv", "html"] as const
const RECURRENCES = ["daily", "weekly", "monthly"] as const

/** Recurring report schedules (US5/FR-017) — the format picker structurally excludes PDF (T203); deleting a schedule leaves its past `Report` rows intact (FR: `scheduledReportId` set-null, unchanged server behavior). */
export function ScheduledReportsPanel({ dashboardId }: { dashboardId: string }) {
  const { data } = useScheduledReports(dashboardId)
  const createSchedule = useCreateScheduledReport(dashboardId)
  const updateSchedule = useUpdateScheduledReport(dashboardId)
  const deleteSchedule = useDeleteScheduledReport(dashboardId)

  const [format, setFormat] = useState<(typeof SCHEDULED_FORMATS)[number]>("csv")
  const [recurrence, setRecurrence] = useState<(typeof RECURRENCES)[number]>("weekly")

  const schedules = data?.scheduledReports ?? []

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="schedule-format" className="text-sm font-medium">
            Format
          </label>
          <select
            id="schedule-format"
            value={format}
            onChange={(event) => setFormat(event.target.value as (typeof SCHEDULED_FORMATS)[number])}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          >
            {SCHEDULED_FORMATS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="schedule-recurrence" className="text-sm font-medium">
            Recurrence
          </label>
          <select
            id="schedule-recurrence"
            value={recurrence}
            onChange={(event) => setRecurrence(event.target.value as (typeof RECURRENCES)[number])}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          >
            {RECURRENCES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={() => createSchedule.mutate({ format, recurrence })}>
          Add schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scheduled reports.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {schedules.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              onToggleActive={() => updateSchedule.mutate({ scheduledReportId: schedule.id, input: { isActive: !schedule.isActive } })}
              onDelete={() => deleteSchedule.mutate(schedule.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ScheduleRow({
  schedule,
  onToggleActive,
  onDelete,
}: {
  schedule: ScheduledReportRecord
  onToggleActive: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className="flex flex-col">
        <span className="font-medium">
          {schedule.format.toUpperCase()} · {schedule.recurrence}
        </span>
        <span className="text-xs text-muted-foreground">Next run: {new Date(schedule.nextRunAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={onToggleActive}>
          {schedule.isActive ? "Pause" : "Resume"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </li>
  )
}
