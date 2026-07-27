import { CUSTOM_CRS_CODE } from "@/shared/contracts/crs.schema"
import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import type { ParseFile, ParsedImport } from "../../types/importExport.types"
import { assertArchiveEntryPath, assertExpansionRatio } from "../../utils/fileGuards"
import { importIssueMessages } from "../../utils/importErrors"
import { normalizeFeatures } from "./normalizeFeatures"

/**
 * Shapefile parser (specs/005-import-export, T077 + Phase 9; FR-017–FR-021).
 *
 * Reads a **single ZIP archive** — the form users actually have. This replaces
 * `features/database/services/shapefileImport.ts`, which required the user to
 * multi-select the component files individually because the `shapefile`
 * dependency has no archive awareness at all (research.md Decision 9).
 *
 * ## Why the low-level `shpjs` API, not `shp(buffer)`
 *
 * `shpjs`'s convenience entry point reads the `.prj` and **reprojects the
 * geometry to WGS84 with proj4 before returning it**. That is precisely the
 * behaviour research.md Decision 4 moved *off* the persisted path: the
 * authoritative transform for anything that gets stored is PostGIS
 * `ST_Transform`, run inside the chunk-commit statement, which also buys the
 * full ~9,000-entry EPSG catalog rather than proj4's built-in handful.
 *
 * So this parser calls `parseShp(buffer)` **without** a `.prj` argument, which
 * suppresses the reprojection, and reports the detected CRS separately for the
 * server to apply. Coordinates leave here in the source CRS, exactly like the
 * other three parsers.
 *
 * Handling the archive directly also delivers what FR-017–FR-021 ask for and
 * the convenience API does not expose: nested directories, explicit `.cpg`
 * encoding, a named choice among several shapefiles, and a clear message when a
 * component is missing.
 */

/** The component extensions this parser looks for, lower-cased. */
type ComponentExtension = "shp" | "dbf" | "prj" | "cpg"

/**
 * Extracts an EPSG authority code from a `.prj`'s WKT.
 *
 * Almost every `.prj` written by ArcGIS, QGIS, or GDAL ends with
 * `AUTHORITY["EPSG","27700"]`, and the **last** such entry is the one describing
 * the coordinate system as a whole rather than an inner datum or spheroid —
 * hence the search from the end. When no authority is present the WKT is used
 * verbatim as a custom definition instead (FR-063), which PostGIS accepts
 * directly without a `spatial_ref_sys` row.
 */
function epsgFromWkt(wkt: string): string | null {
  const matches = [...wkt.matchAll(/AUTHORITY\s*\[\s*"EPSG"\s*,\s*"?(\d{4,6})"?\s*\]/gi)]
  const last = matches.at(-1)
  return last ? `EPSG:${last[1]}` : null
}

/**
 * Copies a `Uint8Array` view into a standalone `ArrayBuffer`.
 *
 * `view.buffer` is not interchangeable with the view: JSZip returns views into a
 * larger pooled buffer, so handing `.buffer` straight to `shpjs` would give it
 * the whole pool starting at offset zero rather than this component's bytes.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    ? (view.buffer as ArrayBuffer)
    : (view.slice().buffer as ArrayBuffer)
}

/**
 * Loads `shpjs`'s low-level readers.
 *
 * They are **named exports on the module namespace**, not properties of the
 * default export: `shpjs`'s default is the convenience function, and it carries
 * no `parseShp`/`parseDbf` of its own once bundled through ESM interop. Reaching
 * for `default.parseShp` — the shape its `@types` package describes — silently
 * yields `undefined`.
 */
async function loadShpReaders(): Promise<{
  parseShp: (shp: ArrayBuffer, prj?: string) => unknown[]
  parseDbf: (dbf: ArrayBuffer, cpg?: ArrayBuffer) => Record<string, unknown>[]
}> {
  const imported = (await import("shpjs")) as unknown as {
    parseShp?: (shp: ArrayBuffer, prj?: string) => unknown[]
    parseDbf?: (dbf: ArrayBuffer, cpg?: ArrayBuffer) => Record<string, unknown>[]
    default?: {
      parseShp?: (shp: ArrayBuffer, prj?: string) => unknown[]
      parseDbf?: (dbf: ArrayBuffer, cpg?: ArrayBuffer) => Record<string, unknown>[]
    }
  }

  const parseShp = imported.parseShp ?? imported.default?.parseShp
  const parseDbf = imported.parseDbf ?? imported.default?.parseDbf

  if (!parseShp || !parseDbf) {
    throw new Error("The Shapefile reader could not be loaded.")
  }
  return { parseShp, parseDbf }
}

/**
 * Parses a zipped Shapefile.
 *
 * Every entry name is checked for zip-slip and the cumulative expansion ratio is
 * checked as entries are enumerated, **before** any entry is decompressed
 * (FR-082, FR-083). A malicious archive costs a rejected import, not a crashed
 * tab.
 */
export const parseShapefile: ParseFile = async (file, options) => {
  const { default: JSZip } = await import("jszip")
  const archive = await JSZip.loadAsync(await file.arrayBuffer())
  options.signal?.throwIfAborted()

  // ---- Enumerate and guard, before reading anything -----------------------
  // One base path per shapefile: `data/parcels` for `data/parcels.shp` and its
  // sibling `.dbf` / `.prj` / `.cpg`. Nested directories therefore work with no
  // special handling — the base simply carries its directory prefix (FR-018).
  const shpBases = new Set<string>()
  let uncompressedTotal = 0

  for (const [entryName, entry] of Object.entries(archive.files)) {
    if (entry.dir) continue

    const pathGuard = assertArchiveEntryPath(entryName)
    if (!pathGuard.ok) throw new Error(pathGuard.message)

    // `_data.uncompressedSize` is JSZip's own bookkeeping, read from the central
    // directory rather than by decompressing — which is what makes checking the
    // ratio *before* extraction possible.
    const declared = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
    uncompressedTotal += typeof declared === "number" ? declared : 0
    const ratioGuard = assertExpansionRatio(file.size, uncompressedTotal)
    if (!ratioGuard.ok) throw new Error(ratioGuard.message)

    // macOS archives carry a parallel `__MACOSX/._name` resource fork for every
    // file; counting those as components yields a spurious second "shapefile".
    if (/(^|\/)__MACOSX\//.test(entryName) || /(^|\/)\._/.test(entryName)) continue

    const match = /^(.*)\.shp$/i.exec(entryName)
    if (match) shpBases.add(match[1])
  }

  // ---- Choose which shapefile to read (FR-021) ---------------------------
  const bases = [...shpBases].sort()
  if (bases.length === 0) {
    throw new Error("This archive contains no .shp file, so there is no shapefile to import.")
  }

  const chosen = options.shapefileName
    ? bases.find((base) => base === options.shapefileName || base.endsWith(`/${options.shapefileName}`))
    : bases[0]

  if (!chosen) {
    throw new Error(
      `This archive has no shapefile named "${options.shapefileName}". ` +
        `It contains: ${bases.join(", ")}.`,
    )
  }

  // ---- Read only the chosen shapefile's components ------------------------
  const readBinary = async (extension: ComponentExtension): Promise<Uint8Array | undefined> => {
    const entry = archive.file(`${chosen}.${extension}`) ?? archive.file(`${chosen}.${extension.toUpperCase()}`)
    return entry ? entry.async("uint8array") : undefined
  }
  const readText = async (extension: ComponentExtension): Promise<string | undefined> => {
    const entry = archive.file(`${chosen}.${extension}`) ?? archive.file(`${chosen}.${extension.toUpperCase()}`)
    return entry ? entry.async("text") : undefined
  }

  const shp = await readBinary("shp")
  if (!shp) {
    throw new Error(
      `"${chosen}.shp" is missing from this archive. A shapefile needs at least its .shp and .dbf files.`,
    )
  }
  const dbf = await readBinary("dbf")
  const prj = await readText("prj")
  const cpg = await readText("cpg")
  options.signal?.throwIfAborted()

  const warnings: ImportIssueDraft[] = []

  // ---- Parse geometry and attributes separately --------------------------
  const { parseShp, parseDbf } = await loadShpReaders()

  // No `.prj` is passed: that is what keeps shpjs from reprojecting, so the
  // coordinates stay in the source CRS for ST_Transform to handle (see header).
  const geometries = parseShp(toArrayBuffer(shp))

  let properties: Record<string, unknown>[] = []
  if (dbf) {
    // The `.cpg` names the DBF's code page (FR-020). Without one, shpjs falls
    // back to its own default; an explicit encoding is honoured when supplied
    // by the user, which is the FR-020 override.
    const encoding = options.encoding ?? cpg?.trim()
    const cpgBuffer = encoding
      ? toArrayBuffer(new TextEncoder().encode(encoding))
      : undefined
    properties = (parseDbf(toArrayBuffer(dbf), cpgBuffer) ?? []) as Record<string, unknown>[]
  } else {
    warnings.push({
      sourcePosition: 0,
      category: "unsupported_content",
      message: importIssueMessages.unsupportedContent(
        "The archive has no .dbf file, so attribute values",
      ),
    })
  }

  if (dbf && properties.length !== geometries.length) {
    warnings.push({
      sourcePosition: 0,
      category: "unsupported_content",
      message: importIssueMessages.unsupportedContent(
        `The .shp holds ${geometries.length} shapes but the .dbf holds ${properties.length} records, ` +
          "so some attribute rows",
      ),
    })
  }

  const rawFeatures = geometries.map((geometry: unknown, index: number) => ({
    geometry,
    properties: properties[index] ?? {},
  }))

  const { features, warnings: normalizeWarnings } = normalizeFeatures(rawFeatures, {
    signal: options.signal,
  })

  // ---- Report the detected CRS (FR-019) ----------------------------------
  const epsg = prj ? epsgFromWkt(prj) : null

  if (!prj) {
    // A null `detectedCrs` is what forces `CrsSelector` to require a choice
    // (FR-062); the warning explains why it is being asked.
    warnings.push({
      sourcePosition: 0,
      category: "unsupported_content",
      message:
        "This archive has no .prj file, so its coordinate system could not be detected — please choose one.",
    })
  }

  const result: ParsedImport = {
    features,
    detectedCrs: prj ? (epsg ?? CUSTOM_CRS_CODE) : null,
    warnings: [...warnings, ...normalizeWarnings],
  }
  if (prj && !epsg) result.detectedCrsDefinition = prj.trim()
  if (bases.length > 1) result.availableLayers = bases

  return result
}

/**
 * Lists the shapefiles inside an archive without parsing any of them, so the
 * import dialog can ask which one to use before doing the work (FR-021).
 */
export async function listShapefilesInArchive(file: File): Promise<string[]> {
  const { default: JSZip } = await import("jszip")
  const archive = await JSZip.loadAsync(await file.arrayBuffer())

  const bases = new Set<string>()
  for (const [entryName, entry] of Object.entries(archive.files)) {
    if (entry.dir) continue
    if (/(^|\/)__MACOSX\//.test(entryName) || /(^|\/)\._/.test(entryName)) continue
    const guard = assertArchiveEntryPath(entryName)
    if (!guard.ok) throw new Error(guard.message)
    const match = /^(.*)\.shp$/i.exec(entryName)
    if (match) bases.add(match[1])
  }
  return [...bases].sort()
}
