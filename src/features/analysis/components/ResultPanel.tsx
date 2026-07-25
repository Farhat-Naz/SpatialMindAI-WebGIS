"use client"

import { Button } from "@/shared/components/ui/button"
import { useAnalysisStore } from "../store/analysisStore"
import { useAnalysisRun, useDiscardAnalysisResult } from "../hooks/useAnalysis"

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
 */
export function ResultPanel({ projectId }: ResultPanelProps) {
  const activeRunId = useAnalysisStore((state) => state.activeRunId)
  const clearActiveRunId = useAnalysisStore((state) => state.clearActiveRunId)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const { data } = useAnalysisRun(activeRunId ?? "", { poll: false })
  const discardResult = useDiscardAnalysisResult(projectId)

  const run = data?.run
  if (!activeRunId || !run || run.status !== "succeeded") {
    return null
  }

  return (
    <section aria-label="Analysis result" className="flex flex-col gap-3 border-t p-3">
      <h3 className="text-sm font-semibold">Result</h3>

      {run.resultLayerId && (
        <p className="text-sm text-muted-foreground">A new layer was added to your project.</p>
      )}
      {run.resultData != null && (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
          {JSON.stringify(run.resultData, null, 2)}
        </pre>
      )}

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
