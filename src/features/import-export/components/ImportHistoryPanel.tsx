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
import type { ImportJobRecordDto, ImportStatus } from "@/shared/contracts/importJob.schema"
// 007's existing hook, consumed by deep import rather than re-implemented
// (T233; FR-076, Constitution: never duplicate code). Deep because the analysis
// barrel pulls map components into any consumer.
import { useExportHistory } from "@/features/analysis/hooks/useExportHistory"
import { useImportHistory } from "../hooks/useImportHistory"
import { useImportIssues } from "../hooks/useImportIssues"
import { formatBytes } from "../utils/fileGuards"
import { ValidationReport } from "./ValidationReport"

/**
 * Import history (specs/005-import-export, Phase 15; FR-075, FR-077–FR-080).
 *
 * `ImportJob` rows *are* the history — there is no separate history table
 * (research.md Decision 15). Reading this panel is also what triggers the
 * abandoned-job sweep server-side, so a job whose tab was closed reaches a
 * terminal state here rather than showing "running" forever (FR-074).
 *
 * A view-only member can read every entry but sees no rollback action (FR-080).
 * The gate is enforced at the API regardless — hiding the button is courtesy, not
 * security.
 */

export interface ImportHistoryPanelProps {
  projectId: string
  /** Whether the viewer may roll back an import (project `Editor` or above). */
  canModify?: boolean
  onRollback?: (jobId: string) => Promise<number | void>
}

const STATUS_LABELS: Record<ImportStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  rolled_back: "Undone",
}

const STATUS_CLASSES: Record<ImportStatus, string> = {
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  succeeded: "bg-green-500/10 text-green-700 dark:text-green-300",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  rolled_back: "bg-muted text-muted-foreground",
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export function ImportHistoryPanel({
  projectId,
  canModify = false,
  onRollback,
}: ImportHistoryPanelProps) {
  const [statusFilter, setStatusFilter] = useState<ImportStatus | "">("")
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [confirmingJobId, setConfirmingJobId] = useState<string | null>(null)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)

  const { data, isPending, isError, error } = useImportHistory(projectId, {
    ...(cursor ? { cursor } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  })

  const confirming = data?.imports.find((entry) => entry.id === confirmingJobId) ?? null

  async function handleRollback(jobId: string): Promise<void> {
    if (!onRollback) return
    setBusyJobId(jobId)
    try {
      await onRollback(jobId)
    } finally {
      setBusyJobId(null)
      setConfirmingJobId(null)
    }
  }

  /** Rollback is reachable from every terminal state except an already-undone one (FR-072). */
  function canRollback(entry: ImportJobRecordDto): boolean {
    return (
      canModify &&
      onRollback !== undefined &&
      entry.importedCount > 0 &&
      ["succeeded", "failed", "cancelled"].includes(entry.status)
    )
  }

  return (
    <section aria-label="Import history" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Import history</h2>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Status</span>
          <select
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={statusFilter}
            aria-label="Filter import history by status"
            onChange={(event) => {
              setStatusFilter(event.target.value as ImportStatus | "")
              // A filter change invalidates the cursor — page two of "all" is not
              // page two of "failed".
              setCursor(undefined)
            }}
          >
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading import history…
        </p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Import history could not be loaded."}
        </p>
      )}

      {data && data.imports.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {statusFilter
            ? `No ${STATUS_LABELS[statusFilter].toLowerCase()} imports in this project.`
            : "Nothing has been imported into this project yet."}
        </p>
      )}

      {data && data.imports.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.imports.map((entry) => (
            <li key={entry.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-medium">{entry.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {/* The layer name is a snapshot, so it stays readable after
                        the layer itself is deleted (FR-079). */}
                    into {entry.targetLayerName}
                    {entry.targetLayerId === null && (
                      <span className="ml-1 italic">(layer since deleted)</span>
                    )}{" "}
                    · {entry.sourceFormat.toUpperCase()} · {formatBytes(entry.fileSizeBytes)} ·{" "}
                    {entry.sourceCrs} · {formatWhen(entry.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_CLASSES[entry.status]}`}
                >
                  {STATUS_LABELS[entry.status]}
                </span>
              </div>

              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <dt>Read</dt>
                  <dd className="tabular-nums font-medium text-foreground">
                    {(entry.totalFeatures ?? 0).toLocaleString()}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Imported</dt>
                  <dd className="tabular-nums font-medium text-foreground">
                    {entry.importedCount.toLocaleString()}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Rejected</dt>
                  <dd className="tabular-nums">{entry.rejectedCount.toLocaleString()}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Duplicates</dt>
                  <dd className="tabular-nums">{entry.duplicateCount.toLocaleString()}</dd>
                </div>
              </dl>

              {entry.errorMessage && (
                <p className="mt-2 text-xs text-destructive">{entry.errorMessage}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-expanded={expandedJobId === entry.id}
                  onClick={() => setExpandedJobId(expandedJobId === entry.id ? null : entry.id)}
                >
                  {expandedJobId === entry.id ? "Hide issues" : "View issues"}
                </Button>

                {canRollback(entry) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyJobId === entry.id}
                    onClick={() => setConfirmingJobId(entry.id)}
                  >
                    {busyJobId === entry.id ? "Undoing…" : "Undo this import"}
                  </Button>
                )}
              </div>

              {expandedJobId === entry.id && <JobIssues jobId={entry.id} fileName={entry.fileName} />}
            </li>
          ))}
        </ul>
      )}

      {data?.nextCursor && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => setCursor(data.nextCursor!)}>
            Load older imports
          </Button>
        </div>
      )}

      <ExportHistorySection projectId={projectId} />

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirmingJobId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {(confirming?.importedCount ?? 0).toLocaleString()} feature
              {confirming?.importedCount === 1 ? "" : "s"} from “{confirming?.targetLayerName}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes only the features “{confirming?.fileName}” added. Anything else in the
              layer — including features other people added since — is left untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && void handleRollback(confirming.id)}>
              Undo import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

const EXPORT_STATUS_CLASSES: Record<string, string> = {
  succeeded: "bg-green-500/10 text-green-700 dark:text-green-300",
  failed: "bg-destructive/10 text-destructive",
}

/**
 * Export history for the same project, in the same view (T233; FR-076).
 *
 * Reads 007's `useExportHistory` — the shared query key means an export logged
 * from either this feature's Export dialog or the Analysis panel refreshes both
 * surfaces. Exports are log entries with no drill-in or undo: a downloaded file
 * cannot be recalled, so the honest affordance is a record, not actions.
 */
function ExportHistorySection({ projectId }: { projectId: string }) {
  const { data, isPending, isError } = useExportHistory(projectId)

  return (
    <section aria-label="Export history" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Export history</h2>

      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading export history…
        </p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          Export history could not be loaded.
        </p>
      )}

      {data && data.exports.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing has been exported from this project yet.</p>
      )}

      {data && data.exports.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.exports.map((entry) => (
            <li key={entry.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium uppercase">{entry.format}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.scope} scope
                    {entry.outputCrs ? ` · ${entry.outputCrs}` : ""}
                    {entry.featureCount !== null
                      ? ` · ${entry.featureCount.toLocaleString()} features`
                      : ""}
                    {entry.layerCount !== null ? ` · ${entry.layerCount} layers` : ""} ·{" "}
                    {formatWhen(String(entry.createdAt))} · {entry.userId}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    EXPORT_STATUS_CLASSES[entry.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {entry.status === "succeeded" ? "Succeeded" : "Failed"}
                </span>
              </div>
              {entry.errorMessage && (
                <p className="mt-2 text-xs text-destructive">{entry.errorMessage}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * One job's persisted issues, loaded only when the entry is expanded.
 *
 * Lazily fetched rather than eagerly with the list: a history page of twenty
 * entries would otherwise issue twenty issue queries for information nobody has
 * asked to see.
 */
function JobIssues({ jobId, fileName }: { jobId: string; fileName: string }) {
  const { data, isPending, isError } = useImportIssues(jobId)

  if (isPending) {
    return (
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        Loading issues…
      </p>
    )
  }
  if (isError || !data) {
    return (
      <p role="alert" className="mt-2 text-xs text-destructive">
        Issues could not be loaded for this import.
      </p>
    )
  }
  if (data.issues.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        This import recorded no validation issues.
      </p>
    )
  }

  return (
    <div className="mt-3">
      <ValidationReport
        issues={data.issues}
        truncated={data.truncated}
        fileName={`${fileName}-issues`}
      />
    </div>
  )
}
