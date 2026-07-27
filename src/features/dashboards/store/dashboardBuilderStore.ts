import { create } from "zustand"
import { resolveBreakpoint, type DashboardBreakpoint } from "../services/breakpoint"

interface DashboardBuilderState {
  /** Which widget's config panel is open — `null` when none is (covers the roadmap outline's "WidgetStore" concern). */
  selectedWidgetId: string | null
  /** In-progress widget configuration before save (covers "WidgetStore"). */
  draftWidgetConfig: Record<string, unknown> | null
  /** Toggles between "viewing" and "arranging/configuring" — a read-only-shared viewer never sees this as `true` regardless of client state, since the server independently rejects any write (FR-026). */
  isEditMode: boolean
  /** Which `WidgetLayout` breakpoint tier is currently being edited/previewed (covers "LayoutStore"); defaults from the detected viewport (T114), but the user can preview a different tier explicitly (US3). */
  activeBreakpoint: DashboardBreakpoint
  /** Same safe-to-display convention as `analysisStore.lastError`. */
  lastError: string | null

  /** Opens a widget's config panel, seeding the draft from its current `config` (T113 — mirrors `analysisStore.setSelectedOperationType`'s clear-before-set precedent: switching widgets discards any unsaved draft from the previous selection). */
  selectWidget: (widgetId: string, currentConfig: Record<string, unknown>) => void
  clearSelectedWidget: () => void
  setDraftWidgetConfig: (config: Record<string, unknown> | null) => void
  toggleEditMode: () => void
  setActiveBreakpoint: (breakpoint: DashboardBreakpoint) => void
  setLastError: (message: string | null) => void
  clearLastError: () => void
}

/**
 * Client-only in-progress dashboard-editing state (mirrors `analysisStore`'s
 * role in 007) — deliberately session-only, no `persist` middleware (T115):
 * every durable concern (layout, saved filters, favorites, `isCollapsed`,
 * `groupId`) is server-persisted (Phases 2–4) and read via React Query
 * (T121), not shadow-cached here. In-progress drag/resize coordinates while
 * a widget is actively being moved belong to `react-grid-layout`'s own
 * component state, never this store (T120) — only the saved, post-drop
 * layout reaches `useSaveLayout`.
 */
export const useDashboardBuilderStore = create<DashboardBuilderState>((set) => ({
  selectedWidgetId: null,
  draftWidgetConfig: null,
  isEditMode: false,
  activeBreakpoint: typeof window === "undefined" ? "desktop" : resolveBreakpoint(window.innerWidth),
  lastError: null,

  selectWidget: (widgetId, currentConfig) => set({ selectedWidgetId: widgetId, draftWidgetConfig: currentConfig }),

  clearSelectedWidget: () => set({ selectedWidgetId: null, draftWidgetConfig: null }),

  setDraftWidgetConfig: (config) => set({ draftWidgetConfig: config }),

  toggleEditMode: () => set((state) => ({ isEditMode: !state.isEditMode })),

  setActiveBreakpoint: (breakpoint) => set({ activeBreakpoint: breakpoint }),

  setLastError: (message) => set({ lastError: message }),

  clearLastError: () => set({ lastError: null }),
}))
