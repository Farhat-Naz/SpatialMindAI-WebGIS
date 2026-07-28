import { create } from "zustand"

interface WidgetPerformanceEntry {
  durationMs: number
  measuredAt: number
}

interface WidgetPerformanceState {
  /**
   * T287/FR-037 — the most recent data-fetch duration per widget, recorded
   * by `useWidgetData` on every successful resolve. Deliberately
   * session-only, in-memory, no `persist` middleware and no server table:
   * this schema has no widget-performance-history storage, and "basic"
   * per-widget performance information (spec.md's own wording) is
   * satisfied by what the current session has actually observed, not a
   * historical record. `DashboardAdminPanel`'s Performance tab reads this
   * directly — it only shows widgets loaded at least once in this browser
   * tab's session, which it documents in its own empty state.
   */
  durationsByWidgetId: Record<string, WidgetPerformanceEntry>
  recordDuration: (widgetId: string, durationMs: number) => void
}

export const useWidgetPerformanceStore = create<WidgetPerformanceState>((set) => ({
  durationsByWidgetId: {},
  recordDuration: (widgetId, durationMs) =>
    set((state) => ({
      durationsByWidgetId: { ...state.durationsByWidgetId, [widgetId]: { durationMs, measuredAt: Date.now() } },
    })),
}))
