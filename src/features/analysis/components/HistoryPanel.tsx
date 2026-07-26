"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog"
import { useAnalysisRuns, useDeleteAnalysisRun, useRerunAnalysis } from "../hooks/useAnalysis"
import { useSelectHistoryRun } from "../hooks/useAnalysisPanel"
import { useAnalysisStore } from "../store/analysisStore"
import type { AnalysisJobStatus, AnalysisRunRecord } from "../types/analysis.types"

/** Every status a run can reach, for the filter control (T217). */
const STATUSES: AnalysisJobStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"]

interface HistoryPanelProps {
  projectId: string
}

/** Renders a run's parameters compactly; an operation with none says so rather than showing an empty object. */
function describeParameters(parameters: unknown): string {
  if (parameters == null || typeof parameters !== "object") return "No parameters"
  const entries = Object.entries(parameters as Record<string, unknown>)
  if (entries.length === 0) return "No parameters"
  return entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ")
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}

function formatDuration(executionTimeMs: number | null): string {
  if (executionTimeMs == null) return "—"
  return executionTimeMs < 1000 ? `${executionTimeMs} ms` : `${(executionTimeMs / 1000).toFixed(2)} s`
}

/**
 * Analysis History (US8, FR-019/FR-020/FR-025/FR-026) — every run's
 * operation, parameters, timing, and user, with Re-run, Re-run with
 * changes, View Result, and Delete.
 *
 * Deleting a history entry deliberately leaves its result layer alone
 * (FR-026, unchanged 005 behaviour): the layer is a real part of the
 * project once created, so removing the audit record of how it was made
 * must not silently remove the data itself.
 */
export function HistoryPanel({ projectId }: HistoryPanelProps) {
  const [statusFilter, setStatusFilter] = useState<AnalysisJobStatus[]>([])
  const { data, isPending } = useAnalysisRuns(projectId, statusFilter.length > 0 ? { status: statusFilter } : {})
  const rerunAnalysis = useRerunAnalysis()
  const deleteRun = useDeleteAnalysisRun(projectId)
  const selectHistoryRun = useSelectHistoryRun()
  const setSelectedOperationType = useAnalysisStore((state) => state.setSelectedOperationType)
  const setDraftParameters = useAnalysisStore((state) => state.setDraftParameters)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const setActiveRunId = useAnalysisStore((state) => state.setActiveRunId)

  const [pendingDelete, setPendingDelete] = useState<AnalysisRunRecord | null>(null)

  const runs = data?.runs ?? []

  function toggleStatus(status: AnalysisJobStatus) {
    setStatusFilter((current) =>
      current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status],
    )
  }

  /**
   * T218/T219 — loads a past run's configuration back into the form.
   * `setSelectedOperationType` clears any existing draft, so the draft
   * must be set after it or the parameters would be wiped immediately.
   */
  function loadIntoForm(run: AnalysisRunRecord) {
    setSelectedOperationType(run.operationType as never)
    setDraftParameters((run.parameters ?? null) as Record<string, unknown> | null)
  }

  return (
    <section aria-label="Analysis history" className="flex flex-col gap-3 p-3">
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs uppercase tracking-wide text-muted-foreground">Filter by status</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={statusFilter.includes(status)}
                onChange={() => toggleStatus(status)}
                className="h-4 w-4 rounded border-input"
              />
              {status}
            </label>
          ))}
        </div>
      </fieldset>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {statusFilter.length > 0 ? "No runs match this filter." : "No analysis has been run in this project yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((run) => (
            <li key={run.id} className="rounded-md border border-input p-2">
              <button
                type="button"
                onClick={() => selectHistoryRun(run.id)}
                className="w-full text-left"
                aria-label={`Show details for ${run.operationType}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{run.operationType}</span>
                  <span className="text-xs text-muted-foreground">{run.status}</span>
                </div>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{describeParameters(run.parameters)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatTimestamp(run.createdAt)} · {formatDuration(run.executionTimeMs)} · {run.userId}
                </p>
              </button>

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rerunAnalysis.isPending}
                  onClick={() =>
                    rerunAnalysis.mutate(run.id, {
                      onSuccess: ({ run: created }) => setActiveRunId(created.id),
                      onError: (error) =>
                        setLastError(error instanceof Error ? error.message : "Failed to re-run this analysis."),
                    })
                  }
                >
                  Re-run
                </Button>

                <Button variant="outline" size="sm" onClick={() => loadIntoForm(run)}>
                  Re-run with changes
                </Button>

                {run.resultLayerId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveRunId(run.id)
                      loadIntoForm(run)
                    }}
                  >
                    View Result
                  </Button>
                )}

                <Button variant="destructive" size="sm" onClick={() => setPendingDelete(run)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this history entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record of the {pendingDelete?.operationType} run. Any layer it produced stays in your
              project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return
                deleteRun.mutate(pendingDelete.id, {
                  onError: (error) =>
                    setLastError(error instanceof Error ? error.message : "Failed to delete this history entry."),
                })
                setPendingDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
