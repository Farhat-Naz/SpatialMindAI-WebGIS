"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { useFeatures } from "@/features/database"
import { useAnalysisStore } from "../store/analysisStore"
import { useAnalysisRun, useDiscardAnalysisResult } from "../hooks/useAnalysis"
import { ANALYSIS_OPERATION_CATALOG } from "../types/analysisOperations.constants"
import { StatisticsCards, type StatisticsResult } from "./StatisticsCards"
import { useExportHistory, useExportResult } from "../hooks/useExportHistory"
import {
  EXPORT_FILE_EXTENSIONS,
  LARGE_EXPORT_FEATURE_THRESHOLD,
  type ExportFormat,
} from "../services/exportService"
import type { AnalysisRunRecord } from "../types/analysis.types"

/** Derived from the catalog so a statistics operation added later is picked up without touching this file. */
const STATISTICS_OPERATIONS: ReadonlySet<string> = new Set(
  ANALYSIS_OPERATION_CATALOG.filter((entry) => entry.category === "statistics" && entry.operationType).map(
    (entry) => entry.operationType as string,
  ),
)

interface ResultPanelProps {
  projectId: string
}

/**
 * Shows the active run's outcome once it reaches a terminal status —
 * Add to Project / Export / Discard actions (US1 T129; extended per
 * operation category in later phases). "Add to Project" needs no network
 * call of its own: the result layer is already part of the project the
 * moment the run succeeds (`createAnalysisRun` creates it inline), and
 * `useRunAnalysis`'s own cache invalidation already makes it visible in the
 * Layers panel — the button simply acknowledges the result and closes it.
 *
 * T176 (US4): when the result layer's features carry attributes — Clip/
 * Erase/Identity preserve the input layer's own attributes, Union/
 * Intersection/Difference/Symmetrical Difference do not (they produce a
 * genuinely new combined shape with no natural per-feature attribute
 * mapping, a documented Phase 3 scope decision) — this surfaces the
 * attribute keys found on the first result feature as a visible signal
 * that they survived the operation, not just the geometry.
 */
export function ResultPanel({ projectId }: ResultPanelProps) {
  const activeRunId = useAnalysisStore((state) => state.activeRunId)
  const clearActiveRunId = useAnalysisStore((state) => state.clearActiveRunId)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const { data } = useAnalysisRun(activeRunId ?? "", { poll: false })
  const discardResult = useDiscardAnalysisResult(projectId)
  const run = data?.run
  const { data: resultFeatures } = useFeatures(run?.resultLayerId ?? "")

  if (!activeRunId || !run || run.status !== "succeeded") {
    return null
  }

  const attributeKeys = [
    ...new Set(resultFeatures?.features.flatMap((feature) => feature.attributes.map((a) => a.key)) ?? []),
  ]

  // Statistics runs (US6) report numbers rather than producing a layer, so
  // their payload gets labelled cards instead of the raw-JSON fallback.
  const isStatisticsRun =
    run.resultData != null && typeof run.resultData === "object" && STATISTICS_OPERATIONS.has(run.operationType)

  return (
    <section aria-label="Analysis result" className="flex flex-col gap-3 border-t p-3">
      <h3 className="text-sm font-semibold">Result</h3>

      {run.resultLayerId && (
        <p className="text-sm text-muted-foreground">A new layer was added to your project.</p>
      )}
      {run.resultLayerId && attributeKeys.length > 0 && (
        <p className="text-sm text-muted-foreground">Attributes preserved: {attributeKeys.join(", ")}</p>
      )}
      {isStatisticsRun ? (
        <StatisticsCards result={run.resultData as StatisticsResult} />
      ) : (
        run.resultData != null && (
          <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
            {JSON.stringify(run.resultData, null, 2)}
          </pre>
        )
      )}

      <ExportControls projectId={projectId} run={run} featureCount={resultFeatures?.features.length ?? 0} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => clearActiveRunId()}>
          Add to Project
        </Button>
        {run.resultLayerId && (
          <Button
            variant="destructive"
            size="sm"
            disabled={discardResult.isPending}
            onClick={() =>
              discardResult.mutate(run.id, {
                onSuccess: () => clearActiveRunId(),
                onError: (error) => {
                  setLastError(error instanceof Error ? error.message : "Failed to discard the result.")
                },
              })
            }
          >
            Discard
          </Button>
        )}
      </div>
    </section>
  )
}

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "geojson", label: "GeoJSON" },
  { value: "shapefile", label: "Shapefile" },
  { value: "csv", label: "CSV" },
  { value: "kml", label: "KML" },
]

/**
 * Export controls for a completed run (US9, T232/T234) — format picker,
 * progress, the oversized-export warning, and this project's export
 * history.
 *
 * The warning (FR-022's "clearly inform the user") is shown *before* the
 * export is attempted and does not block it: the requirement is that a
 * large export is never silently truncated or silently slow, not that it
 * be forbidden.
 */
function ExportControls({
  projectId,
  run,
  featureCount,
}: {
  projectId: string
  run: AnalysisRunRecord
  featureCount: number
}) {
  const [format, setFormat] = useState<ExportFormat>("geojson")
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const exportResult = useExportResult(projectId, run.id)
  const { data: exportHistory } = useExportHistory(projectId)

  const isLarge = featureCount >= LARGE_EXPORT_FEATURE_THRESHOLD

  function handleExport() {
    setProgress({ loaded: 0, total: 1 })
    exportResult.mutate(
      {
        run,
        format,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      },
      {
        onSuccess: (blob) => {
          setProgress(null)
          // A Blob is only useful to the user as a file, so trigger the
          // download here rather than leaving it to the caller.
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement("a")
          anchor.href = url
          anchor.download = `${run.operationType}-${run.id}.${EXPORT_FILE_EXTENSIONS[format]}`
          anchor.click()
          URL.revokeObjectURL(url)
        },
        onError: (error) => {
          setProgress(null)
          setLastError(error instanceof Error ? error.message : "Export failed.")
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="export-format" className="text-sm text-muted-foreground">
            Export format
          </label>
          <select
            id="export-format"
            value={format}
            onChange={(event) => setFormat(event.target.value as ExportFormat)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
          >
            {EXPORT_FORMATS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" size="sm" disabled={exportResult.isPending} onClick={handleExport}>
          {exportResult.isPending ? "Exporting…" : "Export"}
        </Button>
      </div>

      {isLarge && (
        <p className="text-xs text-destructive">
          This result has {featureCount.toLocaleString()} features. A single-file export of this size may take a
          while and use significant memory — it will not be truncated.
        </p>
      )}

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {progress ? `Exporting: ${progress.loaded} of ${progress.total} pages loaded` : ""}
      </p>

      {exportHistory?.exports && exportHistory.exports.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Export history</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {exportHistory.exports.map((job) => (
              <li key={job.id} className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{job.format}</span>
                <span>{job.featureCount ?? 0} features</span>
                <span>{job.status}</span>
                <span>{new Date(job.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
