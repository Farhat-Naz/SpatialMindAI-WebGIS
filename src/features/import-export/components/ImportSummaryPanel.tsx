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
import type { ImportSummary } from "../types/importExport.types"

/**
 * Final import summary (specs/005-import-export, T122; FR-010, FR-072, SC-006).
 *
 * The four counts are laid out so the **balance** is visible, not merely the
 * totals: imported + rejected + duplicate must equal total read, and showing
 * them together is what lets a user confirm no source feature went silently
 * unaccounted for (SC-006). `repaired` sits apart because a repaired feature was
 * still imported — it is a note about *how*, not a fourth outcome.
 */

interface ImportSummaryPanelProps {
  summary: ImportSummary
  /** Present only while rollback is still available. */
  onUndo?: (jobId: string) => Promise<unknown> | void
  /** A message explaining a non-standard outcome — a Strict-mode rollback, say. */
  notice?: string | null
  onDone?: () => void
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return "—"
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} m ${Math.round(seconds % 60)} s`
}

export function ImportSummaryPanel({ summary, onUndo, notice, onDone }: ImportSummaryPanelProps) {
  const [confirmingUndo, setConfirmingUndo] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [undoneCount, setUndoneCount] = useState<number | null>(null)

  const accounted = summary.imported + summary.rejected + summary.duplicate
  // Surfaced rather than hidden: a mismatch means the counts do not describe the
  // file, and silently showing them would misrepresent what happened.
  const isBalanced = accounted === summary.totalRead

  async function handleUndo(): Promise<void> {
    if (!onUndo) return
    setIsUndoing(true)
    try {
      const deleted = await onUndo(summary.jobId)
      setUndoneCount(typeof deleted === "number" ? deleted : summary.imported)
    } finally {
      setIsUndoing(false)
      setConfirmingUndo(false)
    }
  }

  const rows: { label: string; value: number; muted?: boolean }[] = [
    { label: "Features read", value: summary.totalRead },
    { label: "Imported", value: summary.imported },
    { label: "Rejected", value: summary.rejected },
    { label: "Skipped as duplicate", value: summary.duplicate },
    { label: "Geometry repaired", value: summary.repaired, muted: true },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div role="status" aria-live="polite" className="space-y-1">
        <h3 className="text-sm font-semibold">
          {undoneCount === null ? "Import complete" : "Import undone"}
        </h3>
        {undoneCount !== null && (
          <p className="text-sm text-muted-foreground">
            {undoneCount.toLocaleString()} feature{undoneCount === 1 ? "" : "s"} removed. The layer is
            back to how it was before this import.
          </p>
        )}
      </div>

      {notice && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {notice}
        </p>
      )}

      <dl className="divide-y rounded-md border text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-3 py-2">
            <dt className={row.muted ? "text-muted-foreground" : ""}>{row.label}</dt>
            <dd className="tabular-nums font-medium">{row.value.toLocaleString()}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-2">
          <dt className="text-muted-foreground">Elapsed</dt>
          <dd className="tabular-nums text-muted-foreground">{formatElapsed(summary.elapsedMs)}</dd>
        </div>
      </dl>

      {!isBalanced && (
        <p role="alert" className="text-xs text-destructive">
          These counts do not add up to the number of features read
          ({accounted.toLocaleString()} of {summary.totalRead.toLocaleString()}). Please report this.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        {onUndo && undoneCount === null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUndoing}
            onClick={() => setConfirmingUndo(true)}
          >
            {isUndoing ? "Undoing…" : "Undo this import"}
          </Button>
        ) : (
          <span />
        )}

        {onDone && (
          <Button type="button" size="sm" onClick={onDone}>
            Done
          </Button>
        )}
      </div>

      <AlertDialog open={confirmingUndo} onOpenChange={(open) => !open && setConfirmingUndo(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {summary.imported.toLocaleString()} imported feature
              {summary.imported === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes only the features this import added. Anything else in the layer —
              including features other people added while it was running — is left untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUndo()}>Undo import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
