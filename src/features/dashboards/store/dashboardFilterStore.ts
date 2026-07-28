import { create } from "zustand"
import type { DashboardFilterRecord } from "../types/dashboard.types"

interface DashboardFilterState {
  /** Client-side working copy before "Save filters" persists it via `useCreateFilter` (T103) — deliberately separate from `dashboardBuilderStore` since a read-only viewer can still change filters without "edit mode" (US6). */
  activeGlobalFilters: DashboardFilterRecord[]
  hasUnsavedFilterChanges: boolean
  /** T254 — whether `MapWidget`'s "Draw filter area" affordance has put the shared map (research.md Decision 4) into Geoman polygon-draw mode. Read by `DashboardSpatialFilterControl`, the one component mounted inside `MapCore`'s Leaflet context that can call `useMap()`. */
  spatialDrawActive: boolean

  /** Sets (or replaces) the working global filter of a given `filterType` — at most one active global filter per type. */
  setGlobalFilter: (filterType: DashboardFilterRecord["filterType"], config: unknown) => void
  clearGlobalFilter: (filterType: DashboardFilterRecord["filterType"]) => void
  /** Repopulates the working copy from the server-persisted rows (T116) — called on dashboard load (via `useDashboardFilters`, FR-021/SC-005: reloading shows the last-saved filters, not an empty state) and on an explicit "discard changes" action. */
  resetToSaved: (savedFilters: DashboardFilterRecord[]) => void
  activateSpatialDraw: () => void
  deactivateSpatialDraw: () => void
}

/**
 * Client-only in-progress global-filter-bar state (US6) — session-only, no
 * `persist` middleware (T115): the durable copy is the server-persisted
 * `DashboardFilter` rows (Phase 3/4), reloaded into this store via
 * `resetToSaved` rather than trusted from a stale client cache.
 */
export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  activeGlobalFilters: [],
  hasUnsavedFilterChanges: false,
  spatialDrawActive: false,

  setGlobalFilter: (filterType, config) =>
    set((state) => {
      const withoutType = state.activeGlobalFilters.filter((filter) => filter.filterType !== filterType)
      const placeholder: DashboardFilterRecord = {
        id: `draft-${filterType}`,
        dashboardId: "",
        widgetId: null,
        filterType,
        config,
        createdAt: "",
        updatedAt: "",
      }
      return { activeGlobalFilters: [...withoutType, placeholder], hasUnsavedFilterChanges: true }
    }),

  clearGlobalFilter: (filterType) =>
    set((state) => ({
      activeGlobalFilters: state.activeGlobalFilters.filter((filter) => filter.filterType !== filterType),
      hasUnsavedFilterChanges: true,
    })),

  resetToSaved: (savedFilters) =>
    set({ activeGlobalFilters: savedFilters.filter((filter) => filter.widgetId === null), hasUnsavedFilterChanges: false }),

  activateSpatialDraw: () => set({ spatialDrawActive: true }),
  deactivateSpatialDraw: () => set({ spatialDrawActive: false }),
}))
