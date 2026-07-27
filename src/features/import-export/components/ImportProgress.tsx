"use client"

import { Button } from "@/shared/components/ui/button"
import { formatProgress, toProgress } from "../services/importPipeline"
import type { ImportProgressState } from "../types/importExport.types"

/**
 * Import progress readout (specs/005-import-export, T121; FR-009, FR-069,
 * FR-088, FR-089).
 *
 * ## Why a native `<progress>`
 *
 * FR-089 requires that progress never be conveyed by width or colour alone. A
 * native `<progress>` carries `value` and `max` in the accessibility tree for
 * free, so a screen reader reads a real percentage rather than inferring one
 * from a styled `<div>`. The visible percentage and the
 * "N of M features" text are the sighted equivalents of the same information —
 * three redundant channels, which is the requirement.
 *
 * The live region is `polite` and `aria-atomic`, and **focus is never moved**
 * (FR-088): stealing focus mid-import would eject a keyboard user from whatever
 * they were doing, and the point of SC-002's "interactive throughout" is that
 * they can keep doing it.
 */

interface ImportProgressProps {
  progress: ImportProgressState
  onCancel?: () => void
  isCancelling?: boolean
}

export function ImportProgress({ progress, onCancel, isCancelling = false }: ImportProgressProps) {
  const { processed, total, percent } = toProgress(progress.processed, progress.total)
  const readout = formatProgress(progress)

  // A parse that has not yet established a denominator reports indeterminate
  // progress rather than a fake 0%: omitting `value` is how a native
  // `<progress>` expresses "working, total unknown".
  const isIndeterminate = total === 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">
          {isIndeterminate ? "Reading file…" : "Importing features…"}
        </span>
        {!isIndeterminate && (
          <span className="text-sm tabular-nums text-muted-foreground">{percent}%</span>
        )}
      </div>

      <progress
        className="h-2 w-full"
        // Omitted entirely when indeterminate, which is what the element expects.
        value={isIndeterminate ? undefined : processed}
        max={isIndeterminate ? undefined : total}
        aria-valuenow={isIndeterminate ? undefined : processed}
        aria-valuemin={0}
        aria-valuemax={isIndeterminate ? undefined : total}
        aria-label="Import progress"
      >
        {/* Fallback text for a browser that cannot render the element. */}
        {isIndeterminate ? "Reading file" : `${percent}%`}
      </progress>

      {/*
        The text alternative to the bar. `aria-live="polite"` announces each
        update without interrupting, and `aria-atomic` makes the reader speak the
        whole readout rather than only the digits that changed.
      */}
      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-muted-foreground">
        {isIndeterminate ? `Read ${processed.toLocaleString()} features so far…` : readout}
      </p>

      {onCancel && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isCancelling}>
            {isCancelling ? "Cancelling…" : "Cancel import"}
          </Button>
        </div>
      )}
    </div>
  )
}
