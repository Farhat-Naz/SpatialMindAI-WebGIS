"use client"

import { useCallback, useEffect, useRef } from "react"
import { Button } from "@/shared/components/ui/button"
import { ErrorBoundary } from "@/shared/components/ErrorBoundary"
import { cn } from "@/shared/lib/utils"
import { useDatabaseStore } from "@/features/database/store/databaseStore"
import {
  useAnalysisActiveTab,
  useAnalysisDockPosition,
  useAnalysisPanelOpen,
  useAnalysisPanelWidth,
  useCloseAnalysisPanel,
  useSetAnalysisActiveTab,
  useSetAnalysisDockPosition,
  useSetAnalysisPanelWidth,
  useToggleAnalysisPanel,
} from "../hooks/useAnalysisPanel"
import { useAnalysisStore } from "../store/analysisStore"
import type { AnalysisDockPosition, AnalysisPanelTab } from "../store/analysisPanelStore"
import { AnalysisToolbox } from "./AnalysisToolbox"
import { OperationConfigForm } from "./OperationConfigForm"
import { ResultPanel } from "./ResultPanel"
import { HistoryPanel } from "./HistoryPanel"
import { PropertyPanel } from "./PropertyPanel"
import { AnalysisSummary } from "./AnalysisSummary"
import { MeasurementControls } from "./MeasureToolbar"
import { ProgressDialog } from "./ProgressDialog"

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 720

/**
 * The panel's tabs. `measurement` and `summary` are panel-only views on
 * top of `analysisPanelStore`'s four persisted tab values, so the store's
 * union is widened here rather than in the store — they carry no state a
 * reload needs to restore.
 */
const TABS: { value: AnalysisPanelTab; label: string }[] = [
  { value: "toolbox", label: "Toolbox" },
  { value: "result", label: "Result" },
  { value: "history", label: "History" },
  { value: "properties", label: "Properties" },
]

const DOCK_POSITIONS: { value: AnalysisDockPosition; label: string }[] = [
  { value: "left", label: "Dock left" },
  { value: "right", label: "Dock right" },
  { value: "floating", label: "Float" },
]

interface AnalysisPanelProps {
  projectId: string
}

/**
 * The dockable Analysis workspace (US10, FR-023/FR-025) — every component
 * built across Phases 8–15 assembled behind one shell, with dock
 * position, resize, and collapse driven by `analysisPanelStore`.
 *
 * Mounted as a sibling of the map rather than an overlay on it: the map
 * must stay fully interactive with the panel open (FR-023), and a grid
 * sibling cannot occlude it the way a floating overlay would. "Floating"
 * is the one exception, and even then the panel is pointer-isolated so
 * only its own surface takes events.
 */
export function AnalysisPanel({ projectId }: AnalysisPanelProps) {
  const isOpen = useAnalysisPanelOpen()
  const dockPosition = useAnalysisDockPosition()
  const panelWidth = useAnalysisPanelWidth()
  const activeTab = useAnalysisActiveTab()
  const setActiveTab = useSetAnalysisActiveTab()
  const setDockPosition = useSetAnalysisDockPosition()
  const setPanelWidth = useSetAnalysisPanelWidth()
  const closePanel = useCloseAnalysisPanel()
  const togglePanel = useToggleAnalysisPanel()

  const lastError = useAnalysisStore((state) => state.lastError)
  const clearLastError = useAnalysisStore((state) => state.clearLastError)

  if (!isOpen) {
    return (
      <div className="flex items-start p-2">
        <Button variant="outline" size="sm" onClick={togglePanel}>
          Analysis
        </Button>
      </div>
    )
  }

  return (
    <aside
      aria-label="Analysis panel"
      style={{ width: dockPosition === "floating" ? undefined : panelWidth }}
      className={cn(
        "flex min-h-0 flex-col border-l bg-background",
        dockPosition === "left" && "order-first border-l-0 border-r",
        dockPosition === "floating" &&
          "absolute right-4 top-4 z-1000 max-h-[80vh] w-[360px] rounded-md border shadow-lg",
      )}
    >
      <header className="flex items-center gap-1 border-b p-2">
        <h2 className="flex-1 text-sm font-semibold">Analysis</h2>

        <label htmlFor="analysis-dock" className="sr-only">
          Dock position
        </label>
        <select
          id="analysis-dock"
          value={dockPosition}
          onChange={(event) => setDockPosition(event.target.value as AnalysisDockPosition)}
          className="h-7 rounded-md border border-input bg-background px-1 text-xs"
        >
          {DOCK_POSITIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button variant="ghost" size="sm" onClick={closePanel} aria-label="Collapse analysis panel">
          Collapse
        </Button>
      </header>

      {lastError && (
        <div role="alert" className="flex items-start gap-2 border-b bg-destructive/10 p-2 text-sm text-destructive">
          <span className="flex-1">{lastError}</span>
          <button type="button" onClick={clearLastError} aria-label="Dismiss error" className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      <nav aria-label="Analysis panel tabs" className="flex gap-1 border-b p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent",
              activeTab === tab.value && "bg-accent font-medium",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/*
        Constitution — Error Handling: every top-level feature mounted in
        the dashboard shell is wrapped, so a render error inside any
        analysis component degrades to this message instead of blanking
        the whole dashboard.
      */}
      <ErrorBoundary
        fallback={
          <div role="alert" className="p-3 text-sm text-destructive">
            The analysis panel hit an unexpected error. Close and reopen it to try again — your project is unaffected.
          </div>
        }
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === "toolbox" && (
            <>
              <AnalysisToolbox projectId={projectId} />
              <OperationConfigForm projectId={projectId} />
              {/* T245 — the tool picker and readouts, not the map-bound
                  click collector: arming a tool here drives the same map
                  overlay the Measure toolbar uses. */}
              <MeasurementControls projectId={projectId} />
            </>
          )}
          {activeTab === "result" && (
            <>
              <ResultPanel projectId={projectId} />
              <AnalysisSummary projectId={projectId} />
            </>
          )}
          {activeTab === "history" && <HistoryPanel projectId={projectId} />}
          {activeTab === "properties" && <PropertyPanel />}
        </div>
      </ErrorBoundary>

      {dockPosition !== "floating" && <ResizeHandle width={panelWidth} dockPosition={dockPosition} onResize={setPanelWidth} />}

      <ProgressDialog />
    </aside>
  )
}

/**
 * Drag-to-resize edge (T240). Implemented with pointer events on
 * `window` rather than on the handle itself: a fast drag outruns the
 * handle's own hit area, and without window-level listeners the resize
 * would stick partway. Also operable from the keyboard, since a
 * drag-only control is unusable without a pointer.
 */
function ResizeHandle({
  width,
  dockPosition,
  onResize,
}: {
  width: number
  dockPosition: AnalysisDockPosition
  onResize: (px: number) => void
}) {
  const draggingRef = useRef(false)

  const clamp = useCallback((px: number) => Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, px)), [])

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!draggingRef.current) return
      // Dragging the left-docked panel's right edge grows it; the
      // right-docked panel's left edge grows it in the opposite direction.
      const next = dockPosition === "left" ? event.clientX : window.innerWidth - event.clientX
      onResize(clamp(next))
    }
    function handleUp() {
      draggingRef.current = false
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [clamp, dockPosition, onResize])

  return (
    <div
      role="separator"
      aria-label="Resize analysis panel"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={MAX_PANEL_WIDTH}
      tabIndex={0}
      onPointerDown={() => {
        draggingRef.current = true
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(clamp(width - 16))
        if (event.key === "ArrowRight") onResize(clamp(width + 16))
      }}
      className={cn(
        "absolute inset-y-0 w-1 cursor-col-resize bg-transparent hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        dockPosition === "left" ? "right-0" : "left-0",
      )}
    />
  )
}

/** Mount point for the dashboard shell — reads the active project so the panel's children never need it passed down from the layout. */
export function AnalysisPanelMount() {
  const selectedProjectId = useDatabaseStore((state) => state.selectedProjectId)

  if (!selectedProjectId) {
    return null
  }
  return <AnalysisPanel projectId={selectedProjectId} />
}
