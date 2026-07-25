import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type AnalysisDockPosition = "left" | "right" | "floating"
export type AnalysisPanelTab = "toolbox" | "result" | "history" | "properties"

const DEFAULT_PANEL_WIDTH = 360

interface AnalysisPanelState {
  isPanelOpen: boolean
  dockPosition: AnalysisDockPosition
  panelWidth: number
  activeTab: AnalysisPanelTab
  /** Drives the Property Panel when a history row is selected ("History Store" — this field, not a separate store). */
  selectedHistoryRunId: string | null

  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  setDockPosition: (position: AnalysisDockPosition) => void
  setPanelWidth: (px: number) => void
  setActiveTab: (tab: AnalysisPanelTab) => void
  selectHistoryRun: (runId: string | null) => void
}

/**
 * Dockable-workspace UI chrome only (US10) — deliberately separate from
 * `analysisStore` (which owns analysis *configuration*), mirroring
 * `dashboard`'s existing `useSidebar`/`dashboardStore` precedent for
 * panel-open state. Has no knowledge of `operationType`/`parameters`/any
 * analysis-domain concept. Only `dockPosition`/`panelWidth` persist across
 * reloads (T115) — matching `dashboardStore`'s existing persisted-store
 * pattern, the first precedent in this codebase for a feature store.
 */
export const useAnalysisPanelStore = create<AnalysisPanelState>()(
  persist(
    (set) => ({
      isPanelOpen: false,
      dockPosition: "right",
      panelWidth: DEFAULT_PANEL_WIDTH,
      activeTab: "toolbox",
      selectedHistoryRunId: null,

      openPanel: () => set({ isPanelOpen: true }),
      closePanel: () => set({ isPanelOpen: false }),
      togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
      setDockPosition: (position) => set({ dockPosition: position }),
      setPanelWidth: (px) => set({ panelWidth: px }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      selectHistoryRun: (runId) => set({ selectedHistoryRunId: runId }),
    }),
    {
      name: "spatialMind:analysisPanel",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ dockPosition: state.dockPosition, panelWidth: state.panelWidth }),
    },
  ),
)
