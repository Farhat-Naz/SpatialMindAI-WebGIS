import type { ExportFormat, ExportScope } from "../types/importExport.types"

/**
 * User-safe messages for the export failure paths (specs/005-import-export,
 * T011; FR-038, FR-042, FR-086).
 *
 * As with import (`importErrors.ts`), **no new `ApiErrorCode` is introduced**.
 * Export runs entirely in the browser (research.md Decision 21), so most of
 * these never involve a server call at all; the ones that do —
 * `POST /api/projects/:id/exports` — map onto the existing codes unchanged
 * (research.md Decision 19).
 */

const SCOPE_LABELS: Record<ExportScope, string> = {
  selection: "selection",
  layer: "layer",
  project: "project",
}

export const exportErrorMessages = {
  /**
   * FR-042 — an empty scope must produce a clear message and **no file**,
   * never an empty or malformed download.
   */
  nothingToExport: (scope: ExportScope) =>
    `There is nothing to export — the ${SCOPE_LABELS[scope]} contains no features.`,

  /**
   * FR-038 — surfaced **before** the download begins, not after. The
   * Shapefile format records a single geometry type in its header, so a mixed
   * layer necessarily becomes several component sets.
   */
  mixedGeometryWarning: (types: string[]) =>
    `This ${SCOPE_LABELS.layer} contains ${types.length} geometry types (${types.join(", ")}). ` +
    "The Shapefile format holds one geometry type per file, so the archive will contain " +
    "one shapefile per type.",

  /** A single layer failing inside a project export must not lose the others (spec.md Edge Cases). */
  layerSerializationFailed: (layerName: string) =>
    `The layer "${layerName}" could not be written and was omitted from the archive.`,

  /** FR-041 — an output CRS that cannot be resolved is refused before any file is produced. */
  unusableOutputCrs: (code: string) =>
    `The output coordinate system "${code}" could not be applied. Choose a different system and try again.`,

  /**
   * research.md Decision 11 — surfaced when `html2canvas` cannot read the map
   * canvas, typically because basemap tiles were cached before the tile layer
   * carried its CORS attribute. The failure is stated, never silent, and the
   * dialog falls back to the browser's own print dialog.
   */
  pdfRasterizationFailed: () =>
    "The map could not be captured for PDF export. Opening your browser's print dialog instead — " +
    "choose \"Save as PDF\" there. A page reload usually resolves this.",

  /** A generic wrapper used when a writer throws; keeps internal detail out of the message (FR-086). */
  writerFailed: (format: ExportFormat) =>
    `The ${format.toUpperCase()} export could not be completed. Please try again.`,

  /** FR-050 — cancellation is an outcome, not an error, but still needs a message. */
  cancelled: () => "The export was cancelled. No file was downloaded.",

  /**
   * A PDF is rendered from the **live map element**, not from feature pages, so
   * it is produced by `usePrintExport` against the map rather than by `useExport`
   * against a layer. Guarding with a message rather than silently returning
   * nothing means a caller wiring the format to the wrong hook finds out
   * immediately (research.md Decision 11).
   */
  pdfHandledByPrintDialog: () =>
    "PDF output is produced from the map view. Use Print / Export PDF rather than the file export dialog.",
} satisfies Record<string, (...args: never[]) => string>
