// Imported from their own modules rather than the `@/features/database`
// barrel: the barrel re-exports map components, which pull in Leaflet and
// leaflet-geoman, and a plain data service must not drag a map runtime into
// every consumer that only wanted to page features. This is the same hazard
// `features/analysis/services/exportService.ts` documents in its own header.
import { featureService } from "@/features/database/services/featureService"
import { layerService } from "@/features/database/services/layerService"
import {
  CSV_FORMULA_PREFIXES,
  EXPORT_MIME_TYPES,
  PROJECT_EXPORT_MANIFEST_FILENAME,
} from "../types/exportConstants"
import type { ExportOptions, ExportResult, ExportSource } from "../types/importExport.types"
import { findCrs, transformCoordinates, transformFromWgs84 } from "./crsCatalog"

/**
 * The five export writers (specs/005-import-export, T072;
 * contracts/client-api.md "services/exportWriters.ts").
 *
 * Moved here from `features/analysis/services/exportService.ts`, which now
 * re-exports them so 007's Result Panel and `useExportResult` compile and
 * behave identically with no edit (research.md Decision 21). The writers exist
 * in exactly one place — moving rather than copying is the whole point of the
 * task.
 *
 * Carried over from 007 unchanged:
 *
 * - **Page-streamed reads** via `featureService.list`, so a large layer is never
 *   fully materialized when the format does not require it.
 * - The honest `(pagesLoaded, pagesLoaded + 1)` progress heuristic: the total
 *   page count is genuinely unknown until a page returns a null cursor, so
 *   progress reports "at least this far" rather than a fabricated total that
 *   would later jump backwards.
 * - **Buffered CSV rows.** A CSV header must list every column *before* the
 *   first row is written, and the full attribute key set is only known after
 *   the last page. Emitting a header built from the first page alone would
 *   silently drop columns that appear later, which is worse than the memory
 *   cost of holding the rows.
 * - **Buffered Shapefile.** A shapefile's header records the geometry type and
 *   bounding box of the entire file, so `@mapbox/shp-write` takes one complete
 *   FeatureCollection.
 *
 * Added by this feature: `ExportSource` (three scopes), `outputCrs`
 * transformation applied per page as it streams, CSV formula neutralization,
 * mixed-geometry Shapefile partitioning, and the project archive.
 *
 * Every export runs **entirely client-side**. There is no server-side export
 * endpoint and none is added — `POST /api/projects/:id/exports` logs a finished
 * attempt and never drives one (007 research Decision 10, preserved).
 */

export interface ExportProgressCallback {
  (pagesLoaded: number, totalPages: number): void
}

interface PagedFeature {
  geometry: unknown
  properties: Record<string, string>
}

// ---------------------------------------------------------------------------
// Output CRS transformation (FR-041)
// ---------------------------------------------------------------------------

/**
 * Transforms a geometry's coordinates out of WGS84 into `outputCrs`.
 *
 * Runs with proj4 **on the client**, which is Constitution Principle IV
 * compliant: an exported file is neither persisted platform state nor an
 * authoritative server query result, so it falls outside the PostGIS mandate
 * (research.md Decision 4). The persisted direction — import — uses
 * `ST_Transform` server-side instead.
 *
 * Applied per page as it streams, so this costs no additional memory beyond the
 * page already in hand.
 */
function transformGeometry(geometry: unknown, outputCrs: string): unknown {
  // An unresolvable target CRS leaves coordinates untouched rather than
  // throwing: the caller has already validated the selection, and silently
  // emitting WGS84 is a recoverable surprise where losing the whole export is
  // not. `findCrs` is consulted first so an unknown code short-circuits before
  // walking every coordinate.
  if (!findCrs(outputCrs) || !geometry || typeof geometry !== "object") return geometry

  const { coordinates } = geometry as { coordinates?: unknown }
  if (coordinates === undefined) return geometry

  return {
    ...(geometry as object),
    coordinates: transformCoordinates(coordinates, (position) =>
      transformFromWgs84(position, outputCrs),
    ),
  }
}

// ---------------------------------------------------------------------------
// Source resolution — the three export scopes (FR-035)
// ---------------------------------------------------------------------------

/**
 * Pages through an export source, handing each page to `onPage` as it arrives
 * rather than returning one array, and reporting how many features were seen.
 *
 * A `selection` source pages the same layer endpoint and filters client-side.
 * That is deliberate: `GET /api/layers/:layerId/features` is **not modified by
 * this feature** (contracts/api-contracts.md §10), so Map Editing's read path
 * stays bit-for-bit untouched. A selection is bounded by what a user can select
 * on a map, so the filtering cost is not a concern at that scale.
 */
async function forEachFeaturePage(
  source: ExportSource,
  onPage: (features: PagedFeature[]) => void,
  options: ExportOptions = {},
): Promise<number> {
  if (source.kind === "project") {
    throw new Error("A project-scope source must be assembled by writeProjectArchive.")
  }

  const layerId = source.layerId
  const selected = source.kind === "selection" ? new Set(source.featureIds) : null

  let cursor: string | undefined
  let pagesLoaded = 0
  let featureCount = 0

  do {
    options.signal?.throwIfAborted()
    const page = await featureService.list(layerId, cursor ? { cursor } : undefined)

    const mapped: PagedFeature[] = page.features
      .filter((feature) => !selected || selected.has(feature.id))
      .map((feature) => ({
        geometry: options.outputCrs
          ? transformGeometry(feature.geometry as unknown, options.outputCrs)
          : (feature.geometry as unknown),
        properties: Object.fromEntries(
          feature.attributes.map((attribute) => [attribute.key, attribute.value]),
        ),
      }))

    featureCount += mapped.length
    onPage(mapped)

    pagesLoaded += 1
    cursor = page.nextCursor ?? undefined
    options.onProgress?.(pagesLoaded, cursor ? pagesLoaded + 1 : pagesLoaded)
  } while (cursor)

  return featureCount
}

// ---------------------------------------------------------------------------
// GeoJSON (FR-036)
// ---------------------------------------------------------------------------

/** GeoJSON export — page-streamed, so nothing beyond the assembled document is held. */
export async function writeGeoJson(
  source: ExportSource,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const features: unknown[] = []
  const featureCount = await forEachFeaturePage(
    source,
    (page) => {
      for (const feature of page) {
        features.push({ type: "Feature", geometry: feature.geometry, properties: feature.properties })
      }
    },
    options,
  )

  const collection = { type: "FeatureCollection", features }
  return {
    blob: new Blob([JSON.stringify(collection)], { type: EXPORT_MIME_TYPES.geojson }),
    featureCount,
  }
}

// ---------------------------------------------------------------------------
// CSV (FR-039, FR-040)
// ---------------------------------------------------------------------------

/** Escapes one CSV field per RFC 4180 — quotes doubled, and any field containing a comma, quote, or newline wrapped. */
export function toCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Neutralizes a CSV formula-injection payload (FR-040).
 *
 * A cell beginning `=`, `+`, `-`, or `@` is executed as a formula by Excel,
 * LibreOffice, and Google Sheets — `=HYPERLINK(...)` and `=cmd|...` are the
 * classic exfiltration and command-execution vectors. Prefixing an apostrophe
 * makes the spreadsheet treat the cell as literal text: **the value is
 * preserved exactly, only its executability is removed**, which is why this is
 * done rather than stripping or rejecting the character.
 *
 * Applied before `toCsvField`, so the apostrophe is inside any quoting the
 * field needs. This is a genuine gap in 007's writer, closed here.
 */
export function neutralizeCsvFormula(value: string): string {
  const first = value.charAt(0)
  return (CSV_FORMULA_PREFIXES as readonly string[]).includes(first) ? `'${value}` : value
}

/** One CSV cell: formula-neutralized, then RFC 4180 escaped. */
function toSafeCsvField(value: string): string {
  return toCsvField(neutralizeCsvFormula(value))
}

/**
 * CSV export (FR-039) — one row per feature, attributes flattened to columns,
 * plus a `geometry` column holding the feature's GeoJSON.
 *
 * Rows are buffered rather than streamed into Blob parts because a CSV's header
 * must list every column *before* any row is written, and the full set of
 * attribute keys is only known once the last page has arrived (see the module
 * header).
 */
export async function writeCsv(
  source: ExportSource,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const rows: Record<string, string>[] = []
  const columns = new Set<string>()

  const featureCount = await forEachFeaturePage(
    source,
    (features) => {
      for (const feature of features) {
        for (const key of Object.keys(feature.properties)) columns.add(key)
        rows.push({ ...feature.properties, geometry: JSON.stringify(feature.geometry) })
      }
    },
    options,
  )

  const header = [...columns].sort()
  header.push("geometry")

  const lines = [header.map(toCsvField).join(",")]
  for (const row of rows) {
    lines.push(header.map((column) => toSafeCsvField(row[column] ?? "")).join(","))
  }

  return { blob: new Blob([lines.join("\r\n")], { type: EXPORT_MIME_TYPES.csv }), featureCount }
}

// ---------------------------------------------------------------------------
// KML (FR-036)
// ---------------------------------------------------------------------------

/** Escapes text for XML character data. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function toKmlCoordinates(position: number[]): string {
  return position.join(",")
}

function toKmlLineString(coordinates: number[][]): string {
  return `<LineString><coordinates>${coordinates.map(toKmlCoordinates).join(" ")}</coordinates></LineString>`
}

function toKmlPolygon(rings: number[][][]): string {
  const [outer, ...inner] = rings
  const outerXml = `<outerBoundaryIs><LinearRing><coordinates>${(outer ?? [])
    .map(toKmlCoordinates)
    .join(" ")}</coordinates></LinearRing></outerBoundaryIs>`
  const innerXml = inner
    .map(
      (ring) =>
        `<innerBoundaryIs><LinearRing><coordinates>${ring
          .map(toKmlCoordinates)
          .join(" ")}</coordinates></LinearRing></innerBoundaryIs>`,
    )
    .join("")
  return `<Polygon>${outerXml}${innerXml}</Polygon>`
}

/**
 * GeoJSON geometry to KML, hand-rolled rather than adding a dependency
 * (research.md Decision 10). Multi-part geometries become `<MultiGeometry>`,
 * KML's own representation, so a multipolygon survives as one placemark rather
 * than being split into several.
 */
export function toKmlGeometry(geometry: unknown): string {
  if (!geometry || typeof geometry !== "object") return ""
  const { type, coordinates, geometries } = geometry as {
    type?: string
    coordinates?: unknown
    geometries?: unknown[]
  }

  switch (type) {
    case "Point":
      return `<Point><coordinates>${toKmlCoordinates(coordinates as number[])}</coordinates></Point>`
    case "LineString":
      return toKmlLineString(coordinates as number[][])
    case "Polygon":
      return toKmlPolygon(coordinates as number[][][])
    case "MultiPoint":
      return `<MultiGeometry>${(coordinates as number[][])
        .map((position) => `<Point><coordinates>${toKmlCoordinates(position)}</coordinates></Point>`)
        .join("")}</MultiGeometry>`
    case "MultiLineString":
      return `<MultiGeometry>${(coordinates as number[][][]).map(toKmlLineString).join("")}</MultiGeometry>`
    case "MultiPolygon":
      return `<MultiGeometry>${(coordinates as number[][][][]).map(toKmlPolygon).join("")}</MultiGeometry>`
    case "GeometryCollection":
      return `<MultiGeometry>${(geometries ?? []).map(toKmlGeometry).join("")}</MultiGeometry>`
    default:
      return ""
  }
}

/**
 * KML export (FR-036) — one `<Placemark>` per feature, attributes carried as
 * `<ExtendedData>` so they survive into Google Earth or QGIS.
 *
 * Assembled into Blob parts page by page: unlike CSV, KML needs no whole-file
 * knowledge before its first record.
 */
export async function writeKml(
  source: ExportSource,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n',
  ]

  const featureCount = await forEachFeaturePage(
    source,
    (features) => {
      for (const feature of features) {
        const name = feature.properties.name ?? feature.properties.Name ?? ""
        const data = Object.entries(feature.properties)
          .map(([key, value]) => `<Data name="${escapeXml(key)}"><value>${escapeXml(value)}</value></Data>`)
          .join("")
        parts.push(
          `<Placemark>${name ? `<name>${escapeXml(name)}</name>` : ""}` +
            `${data ? `<ExtendedData>${data}</ExtendedData>` : ""}` +
            `${toKmlGeometry(feature.geometry)}</Placemark>\n`,
        )
      }
    },
    options,
  )

  parts.push("</Document>\n</kml>\n")
  return { blob: new Blob(parts, { type: EXPORT_MIME_TYPES.kml }), featureCount }
}

// ---------------------------------------------------------------------------
// Shapefile (FR-036, FR-038)
// ---------------------------------------------------------------------------

/** The shapefile geometry class a GeoJSON type maps onto. */
type ShapeClass = "point" | "line" | "polygon"

function toShapeClass(geometry: unknown): ShapeClass | null {
  const type = (geometry as { type?: string } | null)?.type
  switch (type) {
    case "Point":
    case "MultiPoint":
      return "point"
    case "LineString":
    case "MultiLineString":
      return "line"
    case "Polygon":
    case "MultiPolygon":
      return "polygon"
    default:
      return null
  }
}

/**
 * Reports which shapefile geometry classes a source contains, so the Export
 * dialog can warn **before** the download starts (FR-038).
 *
 * A shapefile cannot hold mixed geometry types — its header records one type
 * for the whole file — so a layer with points and polygons necessarily becomes
 * more than one component set. The user is told that rather than discovering it
 * when the archive is opened.
 */
export async function inspectShapeClasses(
  source: ExportSource,
  options: ExportOptions = {},
): Promise<ShapeClass[]> {
  const classes = new Set<ShapeClass>()
  await forEachFeaturePage(
    source,
    (features) => {
      for (const feature of features) {
        const shapeClass = toShapeClass(feature.geometry)
        if (shapeClass) classes.add(shapeClass)
      }
    },
    options,
  )
  return [...classes]
}

/**
 * Shapefile export (FR-036, FR-038) — a zipped `.shp`/`.shx`/`.dbf`/`.prj` set
 * via `@mapbox/shp-write`.
 *
 * Cannot be assembled progressively: a shapefile's header records the geometry
 * type and bounding box of the entire file, so the writer takes one complete
 * FeatureCollection. Imported lazily so the zip/writer code is not pulled into
 * the bundle for users who never export a shapefile (Constitution Principle V).
 *
 * **Mixed geometry (FR-038)**: features are partitioned by geometry class and
 * each class written as its own component set inside the one archive.
 * `@mapbox/shp-write` already does this partitioning internally when handed a
 * mixed collection — it emits `points`/`lines`/`polygons` component sets — so
 * this writer's job is to *report* the classes for the pre-download warning
 * rather than to re-partition what the library already handles correctly.
 */
export async function writeShapefile(
  source: ExportSource,
  options: ExportOptions = {},
): Promise<ExportResult & { shapeClasses: ShapeClass[] }> {
  const features: PagedFeature[] = []
  const featureCount = await forEachFeaturePage(source, (page) => features.push(...page), options)

  const shapeClasses = [...new Set(features.map(toShapeClass).filter((value): value is ShapeClass => value !== null))]

  const { zip } = await import("@mapbox/shp-write")
  const collection = {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      geometry: feature.geometry,
      properties: feature.properties,
    })),
  }

  const blob = (await zip(collection as never, { compression: "DEFLATE", outputType: "blob" })) as Blob
  return { blob, featureCount, shapeClasses }
}

// ---------------------------------------------------------------------------
// Project archive (FR-037)
// ---------------------------------------------------------------------------

/** One entry in a project archive's manifest. */
interface ManifestLayer {
  layerId: string
  layerName: string
  fileName: string
  featureCount: number
}

/**
 * Project-scope export (FR-037) — every layer as its own GeoJSON file inside one
 * ZIP, plus a `manifest.json` recording layer names, feature counts, and the
 * export timestamp.
 *
 * The manifest exists because filenames alone lose information: two layers may
 * sanitize to the same filename, and a reader needs the original names and
 * counts to verify the archive is complete.
 *
 * A layer that fails to serialize is recorded in the manifest with its error
 * and skipped, rather than failing the whole archive — a single unreadable
 * layer should not cost the user every other layer in the project.
 */
export async function writeProjectArchive(
  projectId: string,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const { layers } = await layerService.list(projectId)

  const { default: JSZip } = await import("jszip")
  const archive = new JSZip()

  const manifest: ManifestLayer[] = []
  const failures: { layerName: string; message: string }[] = []
  let totalFeatures = 0
  let processed = 0

  for (const layer of layers) {
    options.signal?.throwIfAborted()

    // Filenames are sanitized and de-duplicated: a layer named `../etc` or one
    // colliding with another layer's sanitized name must not overwrite an
    // existing entry inside the archive. The fallback tests for a word
    // character, not merely non-emptiness — a name of only separators collapses
    // to `"_"`, which is non-empty but not a usable filename.
    const sanitized = layer.name.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "")
    const base = /[a-zA-Z0-9]/.test(sanitized) ? sanitized : "layer"
    let fileName = `${base}.geojson`
    let suffix = 2
    while (manifest.some((entry) => entry.fileName === fileName)) {
      fileName = `${base}_${suffix}.geojson`
      suffix += 1
    }

    try {
      const result = await writeGeoJson(
        { kind: "layer", layerId: layer.id, layerName: layer.name },
        { outputCrs: options.outputCrs, signal: options.signal },
      )
      archive.file(fileName, await result.blob.text())
      manifest.push({
        layerId: layer.id,
        layerName: layer.name,
        fileName,
        featureCount: result.featureCount,
      })
      totalFeatures += result.featureCount
    } catch (error) {
      failures.push({
        layerName: layer.name,
        message: error instanceof Error ? error.message : "Unknown error.",
      })
    }

    processed += 1
    options.onProgress?.(processed, layers.length)
  }

  archive.file(
    PROJECT_EXPORT_MANIFEST_FILENAME,
    JSON.stringify(
      {
        projectId,
        exportedAt: new Date().toISOString(),
        outputCrs: options.outputCrs ?? "EPSG:4326",
        layerCount: manifest.length,
        featureCount: totalFeatures,
        layers: manifest,
        ...(failures.length > 0 ? { skippedLayers: failures } : {}),
      },
      null,
      2,
    ),
  )

  const blob = await archive.generateAsync({ type: "blob", compression: "DEFLATE" })
  return { blob, featureCount: totalFeatures, layerCount: manifest.length }
}
