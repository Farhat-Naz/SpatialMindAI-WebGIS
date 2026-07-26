import { create } from "zustand"
import type { OperationType } from "@/shared/contracts/analysis.schema"
import type { LatLng } from "@/shared/types/common.types"
import type { AnalysisPresetRecord } from "../types/analysis.types"
import type { MeasurementDraftType } from "../services/measurementService"

/** US2's in-progress Select-by-Location relationship configuration ("Selection Store", research.md's one-store consolidation). */
export type SpatialQueryPredicate = "intersects" | "within" | "contains" | "touches" | "crosses" | "overlaps" | "nearest"

/** The measurement tools a user can have active. Declared here rather than in `MeasureToolbar` so both that component and the panel's copy of the controls read one definition. */
export type MeasurementMode = "distance" | "area" | "radius" | "coordinates"

/** The Measure tool's in-progress live reading ("Measurement Store" — this field, not a separate store). */
export interface MeasurementDraft {
  type: MeasurementDraftType
  points: LatLng[]
}

interface AnalysisState {
  selectedOperationType: OperationType | null
  draftParameters: Record<string, unknown> | null
  stagedInputLayerIds: string[]
  isHistoryPanelOpen: boolean
  lastError: string | null
  selectedPresetId: string | null
  /** The run currently shown in the Progress Dialog/Result Panel ("Job Store" — this field, not a separate store). */
  activeRunId: string | null
  spatialQueryPredicate: SpatialQueryPredicate | null
  measurementDraft: MeasurementDraft | null
  /**
   * The layer currently rendered as a point-density Heatmap (US7/FR-018),
   * or `null` when none is. Heatmap is the one Raster-category entry that
   * actually works, and it is drawn entirely client-side — it creates no
   * `AnalysisRun` (research.md Decision 9), so its "am I on" state lives
   * here rather than being derived from a run.
   */
  heatmapLayerId: string | null
  /**
   * The active measurement tool, shared rather than local to the map
   * toolbar so the same selection drives both mount points (T245): the
   * always-available map overlay and the Analysis panel's Toolbox tab.
   * Point collection itself stays on the map, which is the only place a
   * click has a coordinate.
   */
  measurementMode: MeasurementMode | null

  /** Activates an operation type; clears any in-progress draft/preset from a previous selection (mirrors `editingStore.setTool`). */
  setSelectedOperationType: (operationType: OperationType | null) => void
  setDraftParameters: (parameters: Record<string, unknown> | null) => void
  stageInputLayer: (layerId: string) => void
  unstageInputLayer: (layerId: string) => void
  clearStagedInputLayers: () => void
  toggleHistoryPanel: () => void
  setLastError: (message: string | null) => void
  clearLastError: () => void
  setActiveRunId: (runId: string | null) => void
  clearActiveRunId: () => void
  setSpatialQueryPredicate: (predicate: SpatialQueryPredicate | null) => void
  setMeasurementDraft: (draft: MeasurementDraft | null) => void
  clearMeasurementDraft: () => void
  /** Turns the Heatmap on for a layer, or off when it is already showing that layer. */
  toggleHeatmap: (layerId: string | null) => void
  /** Switches the measurement tool; clears any half-collected draft, since points gathered for one mode are meaningless in another. */
  setMeasurementMode: (mode: MeasurementMode | null) => void
  /** Applies a saved preset's parameters as the current draft, clearing any previously staged draft first (same clear-before-set precedent as `setSelectedOperationType`). */
  applyPreset: (preset: Pick<AnalysisPresetRecord, "id" | "operationType" | "parameters">) => void
  clearPreset: () => void
}

/**
 * Client-only analysis-configuration-in-progress state — deliberately
 * separate from `analysisPanelStore` (dockable-panel chrome), mirroring
 * `editingStore`/`databaseStore`'s existing split (contracts/client-api.md).
 * Session-only: no `persist` middleware wraps this store (T116) — a stale
 * draft surviving a reload would be confusing, not helpful.
 */
export const useAnalysisStore = create<AnalysisState>((set) => ({
  selectedOperationType: null,
  draftParameters: null,
  stagedInputLayerIds: [],
  isHistoryPanelOpen: false,
  lastError: null,
  selectedPresetId: null,
  activeRunId: null,
  spatialQueryPredicate: null,
  measurementDraft: null,
  heatmapLayerId: null,
  measurementMode: null,

  setSelectedOperationType: (operationType) =>
    set({ selectedOperationType: operationType, draftParameters: null, selectedPresetId: null }),

  setDraftParameters: (parameters) => set({ draftParameters: parameters }),

  stageInputLayer: (layerId) =>
    set((state) =>
      state.stagedInputLayerIds.includes(layerId)
        ? state
        : { stagedInputLayerIds: [...state.stagedInputLayerIds, layerId] },
    ),

  unstageInputLayer: (layerId) =>
    set((state) => ({ stagedInputLayerIds: state.stagedInputLayerIds.filter((id) => id !== layerId) })),

  clearStagedInputLayers: () => set({ stagedInputLayerIds: [] }),

  toggleHistoryPanel: () => set((state) => ({ isHistoryPanelOpen: !state.isHistoryPanelOpen })),

  setLastError: (message) => set({ lastError: message }),

  clearLastError: () => set({ lastError: null }),

  setActiveRunId: (runId) => set({ activeRunId: runId }),

  clearActiveRunId: () => set({ activeRunId: null }),

  setSpatialQueryPredicate: (predicate) => set({ spatialQueryPredicate: predicate }),

  setMeasurementDraft: (draft) => set({ measurementDraft: draft }),

  clearMeasurementDraft: () => set({ measurementDraft: null }),

  toggleHeatmap: (layerId) =>
    set((state) => ({ heatmapLayerId: state.heatmapLayerId === layerId ? null : layerId })),

  setMeasurementMode: (mode) => set({ measurementMode: mode, measurementDraft: null }),

  applyPreset: (preset) =>
    set({
      selectedPresetId: preset.id,
      selectedOperationType: preset.operationType as OperationType,
      draftParameters: preset.parameters as Record<string, unknown>,
    }),

  clearPreset: () => set({ selectedPresetId: null }),
}))
