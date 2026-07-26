"use client"

import { useAnalysisRun } from "../hooks/useAnalysis"
import { useSelectedHistoryRunId } from "../hooks/useAnalysisPanel"

/** Every field of an `AnalysisRunRecord`, in the order they matter when inspecting a run. */
const FIELD_LABELS: { key: string; label: string }[] = [
  { key: "operationType", label: "Operation" },
  { key: "status", label: "Status" },
  { key: "progress", label: "Progress" },
  { key: "userId", label: "Run by" },
  { key: "createdAt", label: "Created" },
  { key: "startedAt", label: "Started" },
  { key: "completedAt", label: "Completed" },
  { key: "executionTimeMs", label: "Duration (ms)" },
  { key: "inputLayerIds", label: "Input layers" },
  { key: "resultLayerId", label: "Result layer" },
  { key: "parameters", label: "Parameters" },
  { key: "resultData", label: "Result data" },
  { key: "errorMessage", label: "Error" },
  { key: "batchId", label: "Batch" },
  { key: "presetId", label: "Preset" },
  { key: "cancelRequestedAt", label: "Cancellation requested" },
  { key: "id", label: "Run id" },
]

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

/**
 * Property Panel (US8/US10, T221) — the full detail of whichever run is
 * selected in the History list, driven by
 * `analysisPanelStore.selectedHistoryRunId`.
 *
 * Every field of the run is listed rather than a curated subset: this is
 * the "why did that run do that" view, and the field that explains a
 * surprising result is exactly the one a curated list would have dropped.
 */
export function PropertyPanel() {
  const selectedHistoryRunId = useSelectedHistoryRunId()
  const { data, isPending } = useAnalysisRun(selectedHistoryRunId ?? "", { poll: false })

  if (!selectedHistoryRunId) {
    return <p className="p-3 text-sm text-muted-foreground">Select a run from the History list to see its details.</p>
  }

  if (isPending || !data?.run) {
    return <p className="p-3 text-sm text-muted-foreground">Loading run details…</p>
  }

  const run = data.run as unknown as Record<string, unknown>

  return (
    <dl aria-label="Run details" className="flex flex-col gap-1.5 p-3">
      {FIELD_LABELS.map(({ key, label }) => (
        <div key={key} className="flex gap-2 text-sm">
          <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words font-medium">{formatValue(run[key])}</dd>
        </div>
      ))}
    </dl>
  )
}
