"use client"

import { useMemo } from "react"
import { ANALYSIS_OPERATION_CATALOG, type AnalysisOperationCatalogEntry } from "../types/analysisOperations.constants"
import type { AnalysisOperationCategory } from "../types/analysisConfig.constants"
import { useAnalysisStore } from "../store/analysisStore"
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
 * shown but disabled; every other entry opens `OperationConfigForm`,
 * whether or not that operation's form has landed yet (an operation whose
 * form isn't built shows a graceful "not yet available" state rather than
 * being hidden — matches research.md Decision 9's "visibly present"
 * precedent for raster, applied here to the toolbox generally during
 * phased rollout).
 */
export function AnalysisToolbox() {
  const selectedOperationType = useAnalysisStore((state) => state.selectedOperationType)
  const setSelectedOperationType = useAnalysisStore((state) => state.setSelectedOperationType)

  const grouped = useMemo(() => groupByCategory(ANALYSIS_OPERATION_CATALOG), [])

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
              {entries.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    disabled={!entry.operationType}
                    aria-pressed={Boolean(entry.operationType) && selectedOperationType === entry.operationType}
                    onClick={() => entry.operationType && setSelectedOperationType(entry.operationType)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                      entry.operationType &&
                        selectedOperationType === entry.operationType &&
                        "bg-accent font-medium",
                    )}
                  >
                    {entry.label}
                    {!entry.implemented && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(coming soon)</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
