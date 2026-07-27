import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"
import type { SourceGeometry } from "@/shared/contracts/importChunk.schema"
import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import type { PageSize } from "./exportConstants"

/**
 * Shared types for the import/export feature (specs/005-import-export, T003).
 *
 * Wire-facing shapes are **re-exported from `src/shared/contracts/`**, never
 * restated: a Zod schema with `z.infer` is the single source of truth for
 * every request/response shape, imported by both the Route Handler and the
 * client service (Constitution Principle II).
 */

export type {
  ColumnMapping,
  CompleteImportJobInput,
  CreateImportJobInput,
  ImportHistoryPage,
  ImportJobRecordDto,
  ImportMode,
  ImportSourceFormat,
  ImportStatus,
  PreflightCounts,
} from "@/shared/contracts/importJob.schema"

export type {
  ChunkFeature,
  CommitImportChunkInput,
  ImportChunkResult,
  SourceGeometry,
} from "@/shared/contracts/importChunk.schema"

export type {
  ImportIssue,
  ImportIssueCategory,
  ImportIssueDraft,
  ImportIssuePage,
} from "@/shared/contracts/importIssue.schema"

export type { CrsCode, CrsSelection } from "@/shared/contracts/crs.schema"

export type { GeoJSONGeometry }

// ---------------------------------------------------------------------------
// Client-only types — never crossing the API boundary
// ---------------------------------------------------------------------------

/** A [longitude, latitude] pair, or an [easting, northing] pair in a projected source CRS. */
export type Position = [number, number]

/** `[minX, minY, maxX, maxY]` in whatever CRS produced it. */
export type BBox = [number, number, number, number]

/**
 * One feature after parsing and normalization, **still in the source CRS**.
 * The persisted transform is `ST_Transform`, server-side (research.md
 * Decision 4), so nothing on the client ever holds a transformed-and-destined-
 * for-storage coordinate.
 */
export interface NormalizedFeature {
  /** Zero-based feature index, or 1-based CSV line number (FR-033). */
  sourcePosition: number
  geometry: SourceGeometry
  properties: Record<string, string>
}

/** What every parser returns, so the pipeline is format-agnostic downstream. */
export interface ParsedImport {
  features: NormalizedFeature[]
  /** From a Shapefile `.prj` or a KML default; null means the user must choose (FR-062). */
  detectedCrs: string | null
  /**
   * The raw projection definition when one was found but carries no EPSG
   * authority code — a Shapefile `.prj` holding bare WKT, which is common for
   * organization-specific grids. Paired with `detectedCrs: "CUSTOM"` so the
   * transform can proceed without a `spatial_ref_sys` entry (FR-063).
   */
  detectedCrsDefinition?: string
  /** CSV only — the column names offered to `CsvColumnMapper` (FR-029). */
  columns?: string[]
  /** Shapefile only — every shapefile found in the archive, when it held more than one (FR-021). */
  availableLayers?: string[]
  /** Non-fatal findings: dropped altitude, skipped overlays, sanitized attributes. */
  warnings: ImportIssueDraft[]
}

/** Options a parser needs beyond the file itself. */
export interface ParseOptions {
  sourceCrs?: string
  columnMapping?: import("@/shared/contracts/importJob.schema").ColumnMapping
  /** Shapefile only — the encoding chosen when the archive declares none (FR-020). */
  encoding?: string
  /** Shapefile only — which shapefile to read when the archive holds several (FR-021). */
  shapefileName?: string
  signal?: AbortSignal
}

/** The uniform parser signature (contracts/client-api.md). */
export type ParseFile = (file: File, options: ParseOptions) => Promise<ParsedImport>

/**
 * The complete preflight outcome, held in `importStore`. Its `issues` list is
 * **uncapped** — this is the client-computed artifact that makes FR-058's
 * in-session full-report download possible, even though only the first
 * `IMPORT_MAX_PERSISTED_ISSUES` are persisted (research.md Decision 16).
 */
export interface PreflightResult {
  features: NormalizedFeature[]
  totalFeatures: number
  issues: ImportIssueDraft[]
  counts: { rejected: number; duplicate: number; repaired: number }
  /**
   * Source positions of in-file duplicates. `features` still contains them —
   * whether they commit is decided at confirm time by the FR-056 opt-in.
   */
  duplicatePositions: number[]
  detectedCrs: string | null
  /**
   * The detected projection definition, when `detectedCrs` is `"CUSTOM"` — proj4
   * text or the WKT a Shapefile `.prj` carries, whichever the source supplied.
   * Validated by `parseCustomCrs` before it is set, so a definition that cannot
   * transform never reaches the server.
   */
  detectedCrsDefinition?: string
  columns?: string[]
  /** Shapefile only — every shapefile the archive held, when more than one (FR-021). */
  availableLayers?: string[]
  /** Bounding box after a sample transform, for the FR-064 preview. */
  previewBbox: BBox | null
}

/** Progress readout — a percentage plus the honest processed-of-total pair (FR-009). */
export interface ImportProgressState {
  processed: number
  total: number
}

/** The final counts shown after an import completes (FR-010). */
export interface ImportSummary {
  totalRead: number
  imported: number
  rejected: number
  duplicate: number
  repaired: number
  elapsedMs: number
  jobId: string
}

/** The five export formats (FR-034). */
export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml" | "pdf"

/** The three export scopes (FR-035). */
export type ExportScope = "selection" | "layer" | "project"

/** What an export reads from. Resolved to pages by `exportWriters`. */
export type ExportSource =
  | { kind: "layer"; layerId: string; layerName: string }
  | { kind: "selection"; featureIds: string[]; layerId: string; layerName: string }
  | { kind: "project"; projectId: string; projectName: string }

/** Options every writer accepts. */
export interface ExportOptions {
  /** Authority code to transform output coordinates to. Omitted means WGS84 (FR-041). */
  outputCrs?: string
  onProgress?: (pagesLoaded: number, totalPages: number) => void
  signal?: AbortSignal
}

/** An assembled export: the file plus what the history record needs (FR-043). */
export interface ExportResult {
  blob: Blob
  featureCount: number
  /** Project scope only — how many layers the archive contains (FR-037). */
  layerCount?: number
}

/** One print/PDF page configuration (FR-044–FR-046). */
export interface PrintLayout {
  pageSize: PageSize
  orientation: "portrait" | "landscape"
  title?: string
  showNorthArrow: boolean
  showScaleBar: boolean
  showLegend: boolean
}

/** One selectable coordinate system in the catalog (FR-060). */
export interface CrsEntry {
  code: string
  name: string
  proj4: string
}

/** Cursor-paged query parameters, matching the platform's existing listing convention. */
export interface PagedParams {
  cursor?: string
  limit?: number
}
