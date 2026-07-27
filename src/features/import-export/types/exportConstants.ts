import type { ExportFormat } from "./importExport.types"

/**
 * Export configuration (specs/005-import-export, T002).
 *
 * **This module is the canonical declaration** of the MIME types, file
 * extensions, and large-export threshold for all five export formats.
 * `features/analysis/services/exportService.ts` re-exports the four-format
 * subset from here, so the values exist in exactly one place (Constitution:
 * never duplicate code).
 *
 * The direction of that dependency is deliberate and was reversed during
 * implementation. T002 originally had this module re-export *from* 007's
 * export service. Once T072 moved the format writers into
 * `services/exportWriters.ts` — which needs these MIME types — that direction
 * became a cycle:
 *
 *   exportConstants → analysis/exportService → exportWriters → exportConstants
 *
 * Declaring the maps here and having 007 re-export them breaks the cycle while
 * preserving the no-duplication requirement. 007's public surface is unchanged:
 * its `EXPORT_MIME_TYPES` still types as `Record<ExportFormat4, string>`, and a
 * five-key object satisfies a four-key record.
 */

/** MIME type per export format, so a downloaded file opens in the right tool (FR-034). */
export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  geojson: "application/geo+json",
  shapefile: "application/zip",
  csv: "text/csv",
  kml: "application/vnd.google-earth.kml+xml",
  pdf: "application/pdf",
}

/** File extension per export format (FR-034). */
export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  geojson: "geojson",
  shapefile: "zip",
  csv: "csv",
  kml: "kml",
  pdf: "pdf",
}

/**
 * Beyond this many features a single-file export is worth warning about before
 * it is attempted (spec.md US5 Edge Cases). One value, shared by 007's Result
 * Panel and this feature's Export dialog, so the two cannot disagree about what
 * "large" means.
 */
export const LARGE_EXPORT_FEATURE_THRESHOLD = 50_000

/**
 * Leading characters that make a spreadsheet treat a CSV cell as a formula.
 * Neutralized on export by prefixing an apostrophe — the value is preserved,
 * its executability is not (FR-040).
 */
export const CSV_FORMULA_PREFIXES = ["=", "+", "-", "@"] as const

/** Page dimensions in millimetres, portrait orientation (FR-045). */
export const PAGE_SIZES = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Letter: { width: 215.9, height: 279.4 },
} as const

export type PageSize = keyof typeof PAGE_SIZES

/**
 * Device pixel ratio used when rasterizing the map pane for PDF output, so the
 * map is rendered at print-appropriate resolution rather than upscaled screen
 * pixels (FR-049).
 */
export const PDF_RASTER_SCALE = 2

/** Filename used for the layer manifest inside a project-scope export archive (FR-037). */
export const PROJECT_EXPORT_MANIFEST_FILENAME = "manifest.json"
