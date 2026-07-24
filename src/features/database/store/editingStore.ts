import { create } from "zustand"
import type {
  ActiveTool,
  Clipboard,
  ImportResult,
  MeasurementResult,
  UndoSnapshot,
} from "@/features/database/types/editing.types"
import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"

interface LayerDisplayState {
  visible: boolean
  opacity: number
}

const DEFAULT_LAYER_DISPLAY: LayerDisplayState = { visible: true, opacity: 1 }

/**
 * A pending right-click on a feature or Layer Tree row, carrying the
 * screen position needed to re-dispatch a native `contextmenu` event onto
 * `FeatureContextMenu`/`LayerContextMenu`'s invisible Radix trigger — both
 * targets are rendered imperatively (Leaflet geometry, drag-and-drop rows),
 * so there's no React element a Radix `ContextMenuTrigger` could wrap
 * directly (Research Decision 14).
 */
export interface ContextMenuTarget {
  kind: "feature" | "layer"
  id: string
  clientX: number
  clientY: number
}

interface EditingState {
  tool: ActiveTool
  draftGeometry: GeoJSONGeometry | null
  targetLayerId: string | null
  targetFeatureId: string | null
  undoSnapshot: UndoSnapshot | null
  measurementResult: MeasurementResult | null
  importResult: ImportResult | null
  lockedLayerIds: Set<string>
  layerDisplay: Record<string, LayerDisplayState>
  clipboard: Clipboard
  /** The most recent editing-related error message (draw/edit/delete/import), safe to display as-is. */
  lastError: string | null
  contextMenuTarget: ContextMenuTarget | null

  /** Activates a tool; clears any in-progress draft/measurement from a previous tool. */
  setTool: (tool: ActiveTool) => void
  setDraftGeometry: (geometry: GeoJSONGeometry | null, layerId?: string | null, featureId?: string | null) => void
  /** Discards the in-progress draft with no API call (FR-027b). */
  cancelDraft: () => void
  setUndoSnapshot: (snapshot: UndoSnapshot | null) => void
  clearUndoSnapshot: () => void
  setMeasurementResult: (result: MeasurementResult | null) => void
  setImportResult: (result: ImportResult | null) => void
  clearImportResult: () => void
  lockLayer: (layerId: string) => void
  unlockLayer: (layerId: string) => void
  isLayerLocked: (layerId: string) => boolean
  setLayerVisibility: (layerId: string, visible: boolean) => void
  setLayerOpacity: (layerId: string, opacity: number) => void
  getLayerDisplay: (layerId: string) => LayerDisplayState
  copyFeature: (snapshot: Clipboard) => void
  setLastError: (message: string | null) => void
  clearLastError: () => void
  setContextMenuTarget: (target: ContextMenuTarget | null) => void
  clearContextMenuTarget: () => void
}

/**
 * Client-only state for active map editing/drawing/measurement/lock/
 * clipboard — a sibling to the existing `databaseStore`, which continues to
 * own only project/layer/feature selection (Constitution: one centralized
 * place per client-only concept).
 */
export const useEditingStore = create<EditingState>((set, get) => ({
  tool: null,
  draftGeometry: null,
  targetLayerId: null,
  targetFeatureId: null,
  undoSnapshot: null,
  measurementResult: null,
  importResult: null,
  lockedLayerIds: new Set(),
  layerDisplay: {},
  clipboard: null,
  lastError: null,
  contextMenuTarget: null,

  setTool: (tool) =>
    set({ tool, draftGeometry: null, measurementResult: null }),

  setDraftGeometry: (geometry, layerId = null, featureId = null) =>
    set({ draftGeometry: geometry, targetLayerId: layerId, targetFeatureId: featureId }),

  cancelDraft: () =>
    set({ draftGeometry: null, targetLayerId: null, targetFeatureId: null, tool: null }),

  setUndoSnapshot: (snapshot) => set({ undoSnapshot: snapshot }),

  clearUndoSnapshot: () => set({ undoSnapshot: null }),

  setMeasurementResult: (result) => set({ measurementResult: result }),

  setImportResult: (result) => set({ importResult: result }),

  clearImportResult: () => set({ importResult: null }),

  lockLayer: (layerId) =>
    set((state) => ({ lockedLayerIds: new Set(state.lockedLayerIds).add(layerId) })),

  unlockLayer: (layerId) =>
    set((state) => {
      const next = new Set(state.lockedLayerIds)
      next.delete(layerId)
      return { lockedLayerIds: next }
    }),

  isLayerLocked: (layerId) => get().lockedLayerIds.has(layerId),

  setLayerVisibility: (layerId, visible) =>
    set((state) => ({
      layerDisplay: {
        ...state.layerDisplay,
        [layerId]: { ...(state.layerDisplay[layerId] ?? DEFAULT_LAYER_DISPLAY), visible },
      },
    })),

  setLayerOpacity: (layerId, opacity) =>
    set((state) => ({
      layerDisplay: {
        ...state.layerDisplay,
        [layerId]: { ...(state.layerDisplay[layerId] ?? DEFAULT_LAYER_DISPLAY), opacity },
      },
    })),

  getLayerDisplay: (layerId) => get().layerDisplay[layerId] ?? DEFAULT_LAYER_DISPLAY,

  copyFeature: (snapshot) => set({ clipboard: snapshot }),

  setLastError: (message) => set({ lastError: message }),

  clearLastError: () => set({ lastError: null }),

  setContextMenuTarget: (target) => set({ contextMenuTarget: target }),

  clearContextMenuTarget: () => set({ contextMenuTarget: null }),
}))
