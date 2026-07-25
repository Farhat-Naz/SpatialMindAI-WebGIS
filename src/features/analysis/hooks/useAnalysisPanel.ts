"use client"

import { useAnalysisPanelStore } from "../store/analysisPanelStore"

/**
 * Thin named selector hooks over `analysisPanelStore` — no component reads
 * the raw store with an inline selector (Constitution Principle I). Every
 * field on the store has at least one corresponding selector hook here.
 */
export function useAnalysisPanelOpen(): boolean {
  return useAnalysisPanelStore((state) => state.isPanelOpen)
}

export function useAnalysisDockPosition() {
  return useAnalysisPanelStore((state) => state.dockPosition)
}

export function useAnalysisPanelWidth(): number {
  return useAnalysisPanelStore((state) => state.panelWidth)
}

export function useAnalysisActiveTab() {
  return useAnalysisPanelStore((state) => state.activeTab)
}

export function useSelectedHistoryRunId(): string | null {
  return useAnalysisPanelStore((state) => state.selectedHistoryRunId)
}

// Actions are each their own tiny selector (not bundled into one
// object-returning hook) so a component that only calls, say,
// `openPanel()` does not re-render on every unrelated store update — an
// object literal selector would return a new reference every call and
// defeat Zustand's reference-equality check.
export function useOpenAnalysisPanel() {
  return useAnalysisPanelStore((state) => state.openPanel)
}

export function useCloseAnalysisPanel() {
  return useAnalysisPanelStore((state) => state.closePanel)
}

export function useToggleAnalysisPanel() {
  return useAnalysisPanelStore((state) => state.togglePanel)
}

export function useSetAnalysisDockPosition() {
  return useAnalysisPanelStore((state) => state.setDockPosition)
}

export function useSetAnalysisPanelWidth() {
  return useAnalysisPanelStore((state) => state.setPanelWidth)
}

export function useSetAnalysisActiveTab() {
  return useAnalysisPanelStore((state) => state.setActiveTab)
}

export function useSelectHistoryRun() {
  return useAnalysisPanelStore((state) => state.selectHistoryRun)
}
