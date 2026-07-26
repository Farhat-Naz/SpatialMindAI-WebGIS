"use client"

import { useEffect, useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog"
import { useAnalysisStore } from "../store/analysisStore"
import { useAnalysisRun, useCancelAnalysis } from "../hooks/useAnalysis"

const NON_TERMINAL_STATUSES = new Set(["queued", "running"])

/**
 * Seconds since a run started, ticking once a second (T246, FR-024).
 * Derived from the server's own `startedAt` rather than from when the
 * dialog mounted, so reopening the dialog mid-run shows the true elapsed
 * time instead of restarting from zero. Returns `null` when there is
 * nothing to time, which stops the interval as well as the display.
 */
function useElapsedSeconds(startedAt: string | null): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null)

  useEffect(() => {
    if (!startedAt) {
      setElapsed(null)
      return
    }
    const start = new Date(startedAt).getTime()
    if (Number.isNaN(start)) {
      setElapsed(null)
      return
    }

    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return elapsed
}

/**
 * Live progress for the active run (FR-024/FR-027), including Cancel
 * (FR-028) — subscribes to `useAnalysisRun(activeRunId, { poll: true })`,
 * research.md Decision 5's polling contract. Renders nothing once the run
 * reaches a terminal status (`ResultPanel` takes over) or for a fast
 * operation that never observably passes through `queued`/`running`.
 */
export function ProgressDialog() {
  const activeRunId = useAnalysisStore((state) => state.activeRunId)
  const clearActiveRunId = useAnalysisStore((state) => state.clearActiveRunId)
  const { data } = useAnalysisRun(activeRunId ?? "", { poll: true })
  const cancelAnalysis = useCancelAnalysis()

  const run = data?.run
  const isOpen = Boolean(activeRunId && run && NON_TERMINAL_STATUSES.has(run.status))
  const elapsedSeconds = useElapsedSeconds(isOpen ? run?.startedAt ?? null : null)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && clearActiveRunId()}>
      <DialogContent aria-label="Analysis progress">
        <DialogHeader>
          <DialogTitle>Running {run?.operationType ?? "analysis"}&hellip;</DialogTitle>
          <DialogDescription>
            {run?.progress != null ? `${run.progress}% complete` : "Starting…"}
            {elapsedSeconds != null && ` · ${elapsedSeconds}s elapsed`}
          </DialogDescription>
        </DialogHeader>

        <div
          role="progressbar"
          aria-valuenow={run?.progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Analysis progress"
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${run?.progress ?? 0}%` }}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={!run || cancelAnalysis.isPending}
            onClick={() => run && cancelAnalysis.mutate(run.id)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
