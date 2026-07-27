/**
 * Public barrel for the import/export feature (specs/005-import-export).
 *
 * Exports services, hooks, store selectors, and components other features may
 * consume. Server-only code (repositories, Route Handlers) lives outside
 * `src/features/` entirely — nothing in this module imports `@prisma/client`
 * (Constitution Principle I).
 *
 * **Cross-feature imports inside this module are always deep**, never through
 * another feature's barrel: `@/features/database`'s barrel re-exports
 * `LayerTree`, `MapEditingLayer`, and `FeatureLayer`, which pull Leaflet and
 * leaflet-geoman into anything that touches it.
 * `features/analysis/services/exportService.ts` documents this hazard in its
 * own header; this module follows the same rule.
 */

// Types & constants
export type {
  ColumnMapping,
  CrsEntry,
  ExportFormat,
  ExportOptions,
  ExportResult,
  ExportScope,
  ExportSource,
  ImportIssue,
  ImportIssueCategory,
  ImportIssueDraft,
  ImportJobRecordDto,
  ImportMode,
  ImportProgressState,
  ImportSourceFormat,
  ImportStatus,
  ImportSummary,
  NormalizedFeature,
  ParsedImport,
  ParseFile,
  ParseOptions,
  PreflightResult,
  PrintLayout,
} from "./types/importExport.types"

export {
  ABANDONED_JOB_THRESHOLD_MS,
  IMPORT_CHUNK_SIZE,
  IMPORT_INLINE_ISSUE_LIMIT,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_PERSISTED_ISSUES,
  IMPORT_PROGRESS_POLL_MS,
  IMPORT_WORKER_THRESHOLD,
} from "./types/importExport.constants"

export {
  CSV_FORMULA_PREFIXES,
  EXPORT_FILE_EXTENSIONS,
  EXPORT_MIME_TYPES,
  LARGE_EXPORT_FEATURE_THRESHOLD,
  PAGE_SIZES,
} from "./types/exportConstants"

// Services
export { queryKeys } from "./services/queryKeys"
export { importService } from "./services/importService"
export {
  chunkFeatures,
  commitChunkWithRetry,
  formatProgress,
  previewForCrs,
  runPreflight,
  toPersistableIssues,
  toProgress,
  type PreflightOptions,
} from "./services/importPipeline"
export {
  CRS_CATALOG,
  findCrs,
  isBboxPlausible,
  parseCustomCrs,
  previewTransform,
  transformCoordinates,
  transformFromWgs84,
  transformToWgs84,
} from "./services/crsCatalog"
export {
  inspectShapeClasses,
  neutralizeCsvFormula,
  writeCsv,
  writeGeoJson,
  writeKml,
  writeProjectArchive,
  writeShapefile,
} from "./services/exportWriters"
export { downloadBlob, toDownloadFilename } from "./services/downloadBlob"
export {
  canRasterize,
  chooseScaleBar,
  exportMapAsPdf,
  pageDimensions,
  type LegendEntry,
  type PrintContext,
} from "./services/pdfExport"

// Components
//
// Exported for other features to mount. Note that importing anything from this
// barrel pulls the dialogs in, and with them their parser/writer entry points —
// so `features/database`'s launcher imports the two dialogs by deep path instead
// (see `ImportExportControls`).
export { ImportDialog } from "./components/ImportDialog"
export { ExportDialog } from "./components/ExportDialog"
export { PrintDialog } from "./components/PrintDialog"
export { ImportHistoryPanel } from "./components/ImportHistoryPanel"
export { ValidationReport } from "./components/ValidationReport"
export { CrsSelector } from "./components/CrsSelector"
export { CrsPreview } from "./components/CrsPreview"
export { CsvColumnMapper } from "./components/CsvColumnMapper"
export { ImportPreviewTable } from "./components/ImportPreviewTable"
export { ImportProgress } from "./components/ImportProgress"
export { ImportSummaryPanel } from "./components/ImportSummaryPanel"
export { FileDropZone } from "./components/FileDropZone"
export { ScaleBar } from "./components/ScaleBar"
export { MapLegend } from "./components/MapLegend"
export { PrintPreview } from "./components/PrintPreview"

// Hooks
export {
  useExport,
  useImport,
  useImportHistory,
  useImportIssues,
  useImportProgress,
  usePrintExport,
  type ExportOutcome,
  type ExportRequest,
  type ImportHistoryParams,
  type PrintExportRequest,
} from "./hooks"

// Stores
export {
  selectActiveJobId,
  selectCrs,
  selectImportError,
  selectIsRunning,
  selectMode,
  selectNeedsCrsConfirmation,
  selectPreflight,
  selectProgress,
  selectProgressPercent,
  selectStep,
  selectSummary,
  useImportStore,
  type CrsSelectionState,
  type ImportStep,
} from "./store/importStore"

export {
  DEFAULT_PRINT_LAYOUT,
  selectExportError,
  selectFormat,
  selectHasMixedGeometryWarning,
  selectIsExportDialogOpen,
  selectIsPrintDialogOpen,
  selectOutputCrs,
  selectPrintLayout,
  selectScope,
  selectShapeClasses,
  useExportStore,
} from "./store/exportStore"

// Utilities
export {
  assertArchiveEntryPath,
  assertExpansionRatio,
  assertFileSize,
  detectFormat,
  formatBytes,
  hashFile,
} from "./utils/fileGuards"
export { repairGeometry } from "./utils/repairGeometry"
export { DuplicateTracker, toContentKey } from "./utils/duplicateHash"
export { sanitizeAttributes, type AttributeTransformation } from "./utils/sanitizeAttributes"
export {
  DUPLICATE_CATEGORIES,
  importIssueCategoryLabels,
  importIssueMessages,
  REJECTION_CATEGORIES,
} from "./utils/importErrors"
export { exportErrorMessages } from "./utils/exportErrors"
