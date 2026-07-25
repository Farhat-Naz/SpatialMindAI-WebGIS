import { create } from "zustand"
import type { OperationType } from "@/shared/contracts/analysis.schema"
import type { LatLng } from "@/shared/types/common.types"
import type { AnalysisPresetRecord } from "../types/analysis.types"
import type { MeasurementDraftType } from "../services/measurementService"

/** US2's in-progress Select-by-Location relationship configuration ("Selection Store", research.md's one-store consolidation). */
export type SpatialQueryPredicate = "intersects" | "within" | "contains" | "touches" | "crosses" | "overlaps" | "nearest"

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

  applyPreset: (preset) =>
    set({
      selectedPresetId: preset.id,
      selectedOperationType: preset.operationType as OperationType,
      draftParameters: preset.parameters as Record<string, unknown>,
    }),

  clearPreset: () => set({ selectedPresetId: null }),
}))
