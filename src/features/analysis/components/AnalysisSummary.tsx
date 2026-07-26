"use client"

import { useAnalysisRuns } from "../hooks/useAnalysis"
import { StatisticsCards, type StatisticsResult } from "./StatisticsCards"

/**
 * Analysis Summary (US6/US10, T210) — two things the workspace needs to
 * answer "what has happened in this project":
 *
 * 1. The active run's own Summarize output, rendered through
 *    `StatisticsCards`.
 * 2. A project-wide tally of runs by status and by operation type.
 *
 * Built in Phase 13 because it consumes Statistics-category data first;
 * Phase 16 wires it into the workspace shell.
 */
interface AnalysisSummaryProps {
  projectId: string
  /** The active run's `resultData`, when that run was a Summarize/Statistics operation. */
  statistics?: StatisticsResult
}

/** Tally of a list of runs keyed by one of its string fields, ordered most-frequent first. */
function tallyBy(runs: { status: string; operationType: string }[], field: "status" | "operationType") {
  const counts = new Map<string, number>()
  for (const run of runs) {
    counts.set(run[field], (counts.get(run[field]) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export function AnalysisSummary({ projectId, statistics }: AnalysisSummaryProps) {
  const { data, isPending } = useAnalysisRuns(projectId)
  const runs = data?.runs ?? []

  return (
    <section aria-label="Analysis summary" className="flex flex-col gap-3">
      {statistics && (
        <div>
          <h3 className="px-3 pt-3 text-sm font-semibold">Layer statistics</h3>
          <StatisticsCards result={statistics} />
        </div>
      )}

      <div className="px-3 pb-3">
        <h3 className="mb-2 text-sm font-semibold">Runs in this project</h3>

        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading run history…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No analysis has been run in this project yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{runs.length} total</p>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">By status</h4>
              <ul className="mt-1 flex flex-col gap-0.5">
                {tallyBy(runs, "status").map(([status, count]) => (
                  <li key={status} className="flex justify-between text-sm">
                    <span>{status}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground">By operation</h4>
              <ul className="mt-1 flex flex-col gap-0.5">
                {tallyBy(runs, "operationType").map(([operationType, count]) => (
                  <li key={operationType} className="flex justify-between text-sm">
                    <span>{operationType}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
