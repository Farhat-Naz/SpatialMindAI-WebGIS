"use client"

import { useMemo } from "react"
import { ANALYSIS_OPERATION_CATALOG, type AnalysisOperationCatalogEntry } from "../types/analysisOperations.constants"
import type { AnalysisOperationCategory } from "../types/analysisConfig.constants"
import { useAnalysisStore } from "../store/analysisStore"
import { useRunAnalysis } from "../hooks/useAnalysis"
import type { AnalysisRequestInput } from "@/shared/contracts/analysis.schema"
import { cn } from "@/shared/lib/utils"

const CATEGORY_LABELS: Record<AnalysisOperationCategory, string> = {
  buffer: "Buffer",
  query: "Spatial Query",
  measurement: "Measurement",
  overlay: "Overlay Analysis",
  geometry: "Geometry Processing",
  statistics: "Spatial Statistics",
  raster: "Raster-Ready",
}

/** Fixed display order for the Toolbox's category groups (FR-023). */
const CATEGORY_ORDER: AnalysisOperationCategory[] = [
  "buffer",
  "query",
  "measurement",
  "overlay",
  "geometry",
  "statistics",
  "raster",
]

function groupByCategory(entries: readonly AnalysisOperationCatalogEntry[]) {
  const groups = new Map<AnalysisOperationCategory, AnalysisOperationCatalogEntry[]>()
  for (const entry of entries) {
    const list = groups.get(entry.category) ?? []
    list.push(entry)
    groups.set(entry.category, list)
  }
  return groups
}

/**
 * Categorized Toolbox of every analysis operation (US10/FR-023) — the
 * single source `ANALYSIS_OPERATION_CATALOG` renders from. Measurement
 * tools and not-yet-reachable raster placeholders (no `operationType`) are
 * shown but disabled, and the two are annotated differently so a disabled
 * entry always explains itself: shipped Measurement tools point at the
 * Measure toolbar they actually live on (research.md Decision 8 — they are
 * computed client-side and never hit the analysis endpoint), while raster
 * placeholders read "(coming soon)". Every other entry opens
 * `OperationConfigForm`,
 * whether or not that operation's form has landed yet (an operation whose
 * form isn't built shows a graceful "not yet available" state rather than
 * being hidden — matches research.md Decision 9's "visibly present"
 * precedent for raster, applied here to the toolbox generally during
 * phased rollout).
 */
interface AnalysisToolboxProps {
  /**
   * Enables the run-on-select behaviour for operations that need no
   * configuration (currently only Summarize, T201). Optional so the
   * Toolbox stays a pure selector wherever a project context is not
   * available; without it, Summarize opens its confirm form like any
   * other operation instead of running.
   */
  projectId?: string
}

/** Operations that carry no parameters at all, so selecting one in the Toolbox is already the whole request (spec.md US6.1: "choose Summarize, expect the statistics displayed"). */
const RUN_ON_SELECT: ReadonlySet<string> = new Set(["summarize"])

export function AnalysisToolbox({ projectId }: AnalysisToolboxProps = {}) {
  const selectedOperationType = useAnalysisStore((state) => state.selectedOperationType)
  const setSelectedOperationType = useAnalysisStore((state) => state.setSelectedOperationType)
  const stagedInputLayerIds = useAnalysisStore((state) => state.stagedInputLayerIds)
  const setLastError = useAnalysisStore((state) => state.setLastError)
  const toggleHeatmap = useAnalysisStore((state) => state.toggleHeatmap)
  const heatmapLayerId = useAnalysisStore((state) => state.heatmapLayerId)
  const runAnalysis = useRunAnalysis(projectId ?? "")

  const grouped = useMemo(() => groupByCategory(ANALYSIS_OPERATION_CATALOG), [])

  function handleSelect(entry: AnalysisOperationCatalogEntry) {
    // Heatmap (US7/FR-018) is the one entry with no `operationType` that is
    // still actionable: it renders client-side from the staged layer and
    // creates no AnalysisRun (research.md Decision 9).
    if (entry.key === "heatmap") {
      const [layerId] = stagedInputLayerIds
      if (!layerId) {
        setLastError("Select a layer before rendering a Heatmap.")
        return
      }
      toggleHeatmap(layerId)
      return
    }

    if (!entry.operationType) return
    setSelectedOperationType(entry.operationType)

    if (!projectId || !RUN_ON_SELECT.has(entry.operationType)) return

    const [layerId] = stagedInputLayerIds
    if (!layerId) {
      // The confirm form this selection just opened states the same thing,
      // so the user is not left without a next step.
      setLastError("Select a layer before running Summarize.")
      return
    }
    runAnalysis.mutate(
      { operationType: entry.operationType, inputLayerIds: [layerId], parameters: undefined } as AnalysisRequestInput,
      { onError: (error) => setLastError(error instanceof Error ? error.message : "Failed to run Summarize.") },
    )
  }

  return (
    <nav aria-label="Analysis toolbox" className="flex flex-col gap-4 overflow-y-auto p-3">
      {CATEGORY_ORDER.map((category) => {
        const entries = grouped.get(category)
        if (!entries?.length) return null
        return (
          <div key={category}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABELS[category]}
            </h3>
            <ul className="flex flex-col gap-1">
              {entries.map((entry) => {
                const isHeatmap = entry.key === "heatmap"
                const isActionable = Boolean(entry.operationType) || isHeatmap
                const isPressed = isHeatmap
                  ? heatmapLayerId !== null
                  : Boolean(entry.operationType) && selectedOperationType === entry.operationType
                return (
                <li key={entry.key}>
                  <button
                    type="button"
                    disabled={!isActionable}
                    aria-pressed={isPressed}
                    onClick={() => handleSelect(entry)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                      isPressed && "bg-accent font-medium",
                    )}
                  >
                    {entry.label}
                    {!entry.implemented && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(coming soon)</span>
                    )}
                    {entry.implemented && !entry.operationType && entry.category === "measurement" && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(Measure toolbar)</span>
                    )}
                    {isHeatmap && isPressed && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(showing)</span>
                    )}
                  </button>
                </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
