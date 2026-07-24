import { create } from "zustand"

interface DatabaseState {
  selectedProjectId: string | null
  selectedLayerId: string | null
  selectedFeatureId: string | null
  /** Full multi-selection set within the current layer (US5). Additive — see Research Decision 13. */
  selectedFeatureIds: string[]
  /** Selects a project; clears the (now-stale) layer/feature selection. */
  selectProject: (projectId: string | null) => void
  /** Selects a layer within the current project; clears the (now-stale) feature selection. */
  selectLayer: (layerId: string | null) => void
  /** Selects a feature within the current layer. */
  selectFeature: (featureId: string | null) => void
  /** Clears the entire project/layer/feature selection. */
  clearSelection: () => void
  /** Adds/removes a single feature from the multi-selection (Shift-click). */
  toggleFeatureSelection: (featureId: string) => void
  /** Replaces the multi-selection with an explicit set (box/drag-select). */
  selectFeatureRange: (featureIds: string[]) => void
  /** Clears only the multi-selection, leaving project/layer selection intact. */
  clearFeatureSelection: () => void
}

/**
 * Client-only selection state for the database feature — no server data is
 * ever stored here (Constitution Principle V / Additional Engineering
 * Standards: State Management). Selecting a different project clears the
 * dependent layer/feature selection, since they belong to the previous
 * project's hierarchy. `selectedFeatureId` is kept in sync as "the most
 * recently selected id" whenever `selectedFeatureIds` changes, so existing
 * single-selection consumers (popup, zoom-to-feature, Attribute Form)
 * continue to work unmodified.
 */
export const useDatabaseStore = create<DatabaseState>((set) => ({
  selectedProjectId: null,
  selectedLayerId: null,
  selectedFeatureId: null,
  selectedFeatureIds: [],
  selectProject: (projectId) =>
    set({
      selectedProjectId: projectId,
      selectedLayerId: null,
      selectedFeatureId: null,
      selectedFeatureIds: [],
    }),
  selectLayer: (layerId) =>
    set({ selectedLayerId: layerId, selectedFeatureId: null, selectedFeatureIds: [] }),
  selectFeature: (featureId) =>
    set({
      selectedFeatureId: featureId,
      selectedFeatureIds: featureId ? [featureId] : [],
    }),
  clearSelection: () =>
    set({
      selectedProjectId: null,
      selectedLayerId: null,
      selectedFeatureId: null,
      selectedFeatureIds: [],
    }),
  toggleFeatureSelection: (featureId) =>
    set((state) => {
      const isSelected = state.selectedFeatureIds.includes(featureId)
      const nextIds = isSelected
        ? state.selectedFeatureIds.filter((id) => id !== featureId)
        : [...state.selectedFeatureIds, featureId]
      return {
        selectedFeatureIds: nextIds,
        selectedFeatureId: nextIds[nextIds.length - 1] ?? null,
      }
    }),
  selectFeatureRange: (featureIds) =>
    set({
      selectedFeatureIds: featureIds,
      selectedFeatureId: featureIds[featureIds.length - 1] ?? null,
    }),
  clearFeatureSelection: () => set({ selectedFeatureIds: [], selectedFeatureId: null }),
}))
