import { WGS84_CODE } from "@/shared/contracts/crs.schema"
import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import type { ColumnMapping } from "@/shared/contracts/importJob.schema"
import type { NormalizedFeature, ParseFile, ParsedImport } from "../../types/importExport.types"
import { importIssueMessages } from "../../utils/importErrors"
import { sanitizeAttributes } from "../../utils/sanitizeAttributes"

/**
 * CSV parser (specs/005-import-export, T079 + Phase 11; FR-028–FR-033).
 *
 * The only parser that **builds** geometry rather than reading it: each row
 * becomes a Point from its latitude and longitude columns (FR-031). It is
 * therefore the one format that cannot share `normalizeFeatures`' geometry path,
 * though it applies the identical attribute sanitization.
 *
 * `sourcePosition` is a **1-based line number**, not a 0-based index, for this
 * format alone (FR-033). A user looking for row 41 opens the file in a
 * spreadsheet and goes to line 41; reporting index 40 would send them to the
 * wrong row.
 */

/** Column-name candidates recognized when guessing the coordinate columns (FR-029). */
const LATITUDE_HINTS = ["latitude", "lat", "y", "northing", "ycoord", "y_coord", "lat_dd"]
const LONGITUDE_HINTS = ["longitude", "lon", "lng", "long", "x", "easting", "xcoord", "x_coord", "lon_dd"]

/** Normalizes a header for hint matching: lower-cased, non-alphanumerics removed. */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * Guesses which columns hold the coordinates, so the mapper opens pre-filled
 * (FR-029). Exact hint matches are preferred over substring matches, so a file
 * with both `lat` and `latitude_source` picks `lat` rather than whichever came
 * first.
 *
 * A guess is only ever a default — `CsvColumnMapper` always shows it and lets
 * the user change it (FR-030).
 */
export function guessCoordinateColumns(headers: string[]): {
  latitudeColumn?: string
  longitudeColumn?: string
} {
  const find = (hints: string[]): string | undefined => {
    const normalized = headers.map((header) => ({ header, key: normalizeHeader(header) }))
    for (const hint of hints) {
      const exact = normalized.find((entry) => entry.key === hint)
      if (exact) return exact.header
    }
    for (const hint of hints) {
      const partial = normalized.find((entry) => entry.key.includes(hint))
      if (partial) return partial.header
    }
    return undefined
  }

  return { latitudeColumn: find(LATITUDE_HINTS), longitudeColumn: find(LONGITUDE_HINTS) }
}

/**
 * Parses one coordinate cell.
 *
 * Handles the comma decimal separator used across most of Europe (`51,5074`),
 * because a European CSV is a routine input and rejecting every row of one as
 * "not a number" would be a confusing failure. A value containing both a comma
 * and a period is left alone — that is thousands-separated, and guessing would
 * corrupt it.
 */
function toCoordinate(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
  if (typeof raw !== "string") return null

  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  const candidate = trimmed.includes(",") && !trimmed.includes(".") ? trimmed.replace(",", ".") : trimmed
  const value = Number(candidate)
  return Number.isFinite(value) ? value : null
}

/** Resolves papaparse's CommonJS/ESM interop shapes. */
async function loadPapaparse() {
  const imported = await import("papaparse")
  const candidate = (imported as unknown as { default?: unknown }).default ?? imported
  return candidate as typeof import("papaparse")
}

/**
 * Reads a CSV's headers and first rows without parsing the whole file, so
 * `CsvColumnMapper` and `ImportPreviewTable` can be populated before the user
 * commits to anything (FR-029, FR-031).
 */
export async function previewCsv(
  file: File,
  options: { delimiter?: string; hasHeaderRow?: boolean; previewRows?: number } = {},
): Promise<{ headers: string[]; rows: Record<string, string>[]; delimiter: string }> {
  const Papa = await loadPapaparse()
  const hasHeaderRow = options.hasHeaderRow ?? true
  const previewRows = options.previewRows ?? 10

  const text = await file.slice(0, 64 * 1024).text()
  const result = Papa.parse<Record<string, string>>(text, {
    header: hasHeaderRow,
    delimiter: options.delimiter ?? "",
    skipEmptyLines: true,
    preview: previewRows + 1,
  })

  const delimiter = result.meta.delimiter || options.delimiter || ","

  if (hasHeaderRow) {
    return {
      headers: result.meta.fields ?? [],
      rows: (result.data as Record<string, string>[]).slice(0, previewRows),
      delimiter,
    }
  }

  // Without a header row, columns are addressed positionally as `column_1`,
  // `column_2`, … so the mapper has stable names to offer (FR-030).
  const arrays = result.data as unknown as string[][]
  const width = arrays.reduce((max, row) => Math.max(max, row.length), 0)
  const headers = Array.from({ length: width }, (_, index) => `column_${index + 1}`)
  return {
    headers,
    rows: arrays.slice(0, previewRows).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))),
    delimiter,
  }
}

/**
 * Parses a CSV into point features.
 *
 * Requires a `columnMapping`: which columns are latitude and longitude cannot be
 * inferred reliably enough to persist without the user confirming it, and
 * getting it backwards is the wrong-hemisphere failure this feature works hard
 * to prevent (FR-030, FR-065).
 *
 * A row whose coordinate cells are empty or non-numeric becomes a
 * `missing_coordinate` issue and is skipped, rather than failing the file
 * (FR-032, FR-006's lenient default).
 */
export const parseCsv: ParseFile = async (file, options) => {
  const mapping = options.columnMapping
  if (!mapping) {
    throw new Error("A CSV import needs its latitude and longitude columns chosen before it can be read.")
  }

  const Papa = await loadPapaparse()
  const text = await file.text()
  options.signal?.throwIfAborted()

  const hasHeaderRow = mapping.hasHeaderRow
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: hasHeaderRow,
    delimiter: mapping.delimiter || "",
    skipEmptyLines: true,
  })

  const warnings: ImportIssueDraft[] = []
  const features: NormalizedFeature[] = []

  // Rows are addressed by name with a header row and positionally without one.
  let rows: Record<string, unknown>[]
  let headers: string[]
  if (hasHeaderRow) {
    rows = parsed.data as Record<string, unknown>[]
    headers = parsed.meta.fields ?? []
  } else {
    const arrays = parsed.data as unknown as string[][]
    const width = arrays.reduce((max, row) => Math.max(max, row.length), 0)
    headers = Array.from({ length: width }, (_, index) => `column_${index + 1}`)
    rows = arrays.map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ""])))
  }

  for (const error of parsed.errors.slice(0, 50)) {
    warnings.push({
      sourcePosition: (error.row ?? 0) + (hasHeaderRow ? 2 : 1),
      category: "invalid_geometry",
      message: importIssueMessages.invalidGeometry(error.message),
    })
  }

  // Which columns become attributes: the user's explicit choice when given,
  // otherwise everything except the two coordinate columns (FR-031).
  const attributeColumns =
    mapping.attributeColumns.length > 0
      ? mapping.attributeColumns
      : headers.filter(
          (header) => header !== mapping.latitudeColumn && header !== mapping.longitudeColumn,
        )

  for (let index = 0; index < rows.length; index += 1) {
    if (index % 5000 === 0) options.signal?.throwIfAborted()

    const row = rows[index]
    // 1-based line number the user can find in a spreadsheet: +1 for 1-based
    // counting, +1 more when a header occupies line 1 (FR-033).
    const sourcePosition = index + (hasHeaderRow ? 2 : 1)

    const latitude = toCoordinate(row[mapping.latitudeColumn])
    const longitude = toCoordinate(row[mapping.longitudeColumn])

    if (latitude === null || longitude === null) {
      warnings.push({
        sourcePosition,
        category: "missing_coordinate",
        message: importIssueMessages.missingCoordinate(
          latitude === null ? mapping.latitudeColumn : mapping.longitudeColumn,
        ),
      })
      continue
    }

    const attributes: Record<string, unknown> = {}
    for (const column of attributeColumns) attributes[column] = row[column]

    const { properties, transformations } = sanitizeAttributes(attributes)
    for (const transformation of transformations) {
      warnings.push({ sourcePosition, category: transformation.category, message: transformation.message })
    }

    features.push({
      sourcePosition,
      // GeoJSON position order is [x, y] — longitude first. Building it here
      // from named columns is what makes the classic lat/lng swap impossible to
      // introduce silently downstream.
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties,
    })
  }

  const result: ParsedImport = {
    features,
    // A CSV carries no projection metadata, so the user must confirm the CRS.
    // WGS84 is offered as the default because decimal degrees are overwhelmingly
    // what a lat/lng CSV holds, but the bbox-plausibility check (FR-065) is what
    // actually catches a projected file mislabelled as degrees.
    detectedCrs: options.sourceCrs ?? WGS84_CODE,
    columns: headers,
    warnings,
  }
  return result
}

/** Re-exported so `CsvColumnMapper` can build a complete mapping from a preview. */
export type { ColumnMapping }
