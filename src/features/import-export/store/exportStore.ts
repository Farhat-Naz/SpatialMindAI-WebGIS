import { create } from "zustand"
import { WGS84_CODE } from "@/shared/contracts/crs.schema"
import type { ExportFormat, ExportScope, PrintLayout } from "../types/importExport.types"

/**
 * Export and print dialog session state (specs/005-import-export, T102, T106, T107).
 *
 * ## What is deliberately NOT here
 *
 * **The selection itself is not stored here.** `scope: "selection"` records the
 * user's *choice of scope*; which features are selected is read from Map
 * Editing's existing selection store at export time (contracts/client-api.md).
 * Duplicating the selection would mean two lists that disagree the moment the
 * user clicks the map with the dialog open — and the dialog is explicitly meant
 * to stay usable while the selection changes.
 *
 * **No export history is held here** either; that is server state owned by 007's
 * `useExportHistory`.
 *
 * Not persisted, for the same reason as `importStore`: a stale export
 * configuration surviving a reload is confusing rather than helpful, and there is
 * nothing expensive to recompute.
 */

/** Sensible starting print layout: A4 landscape suits a map better than portrait. */
export const DEFAULT_PRINT_LAYOUT: PrintLayout = {
  pageSize: "A4",
  orientation: "landscape",
  showNorthArrow: true,
  showScaleBar: true,
  showLegend: true,
}

interface ExportState {
  scope: ExportScope
  format: ExportFormat
  /** Authority code for output coordinates (FR-041). WGS84 unless changed. */
  outputCrs: string
  printLayout: PrintLayout
  isDialogOpen: boolean
  isPrintDialogOpen: boolean
  /**
   * Geometry classes the current source contains, when more than one — drives
   * the mixed-geometry Shapefile warning shown *before* the download (FR-038).
   */
  shapeClasses: string[] | null
  /** The most recent user-facing export failure (FR-042, FR-090). */
  error: string | null

  setScope: (scope: ExportScope) => void
  setFormat: (format: ExportFormat) => void
  setOutputCrs: (outputCrs: string) => void
  setPrintLayout: (layout: Partial<PrintLayout>) => void
  resetPrintLayout: () => void
  openDialog: () => void
  closeDialog: () => void
  openPrintDialog: () => void
  closePrintDialog: () => void
  setShapeClasses: (classes: string[] | null) => void
  setError: (message: string | null) => void
  reset: () => void
}

const INITIAL_STATE = {
  scope: "layer" as ExportScope,
  format: "geojson" as ExportFormat,
  outputCrs: WGS84_CODE,
  printLayout: DEFAULT_PRINT_LAYOUT,
  isDialogOpen: false,
  isPrintDialogOpen: false,
  shapeClasses: null,
  error: null,
}

export const useExportStore = create<ExportState>((set) => ({
  ...INITIAL_STATE,

  setScope: (scope) =>
    // A scope change invalidates the geometry-class inspection, which was
    // computed against the previous source.
    set({ scope, shapeClasses: null, error: null }),

  setFormat: (format) => set({ format, error: null }),

  setOutputCrs: (outputCrs) => set({ outputCrs }),

  /** Merges a partial layout change, so a toggle need not restate every field. */
  setPrintLayout: (layout) =>
    set((state) => ({ printLayout: { ...state.printLayout, ...layout } })),

  resetPrintLayout: () => set({ printLayout: DEFAULT_PRINT_LAYOUT }),

  openDialog: () => set({ isDialogOpen: true, error: null }),

  closeDialog: () => set({ isDialogOpen: false, shapeClasses: null, error: null }),

  openPrintDialog: () => set({ isPrintDialogOpen: true, error: null }),

  /**
   * Closes the print dialog without producing anything (FR-050).
   *
   * The layout is deliberately **not** reset: reopening the dialog after an
   * accidental close should not discard the page setup the user just configured.
   * `resetPrintLayout` exists for when they actually want that.
   */
  closePrintDialog: () => set({ isPrintDialogOpen: false, error: null }),

  setShapeClasses: (shapeClasses) => set({ shapeClasses }),

  setError: (error) => set({ error }),

  reset: () => set({ ...INITIAL_STATE }),
}))

// ---------------------------------------------------------------------------
// Narrow selectors (T106)
// ---------------------------------------------------------------------------

export const selectScope = (state: ExportState): ExportScope => state.scope
export const selectFormat = (state: ExportState): ExportFormat => state.format
export const selectOutputCrs = (state: ExportState): string => state.outputCrs
export const selectPrintLayout = (state: ExportState): PrintLayout => state.printLayout
export const selectIsExportDialogOpen = (state: ExportState): boolean => state.isDialogOpen
export const selectIsPrintDialogOpen = (state: ExportState): boolean => state.isPrintDialogOpen
export const selectShapeClasses = (state: ExportState): string[] | null => state.shapeClasses
export const selectExportError = (state: ExportState): string | null => state.error

/**
 * Whether the chosen format cannot represent the source's mixed geometry in one
 * component set, so the dialog must warn before downloading (FR-038).
 */
export const selectHasMixedGeometryWarning = (state: ExportState): boolean =>
  state.format === "shapefile" && (state.shapeClasses?.length ?? 0) > 1

export type { ExportState }
