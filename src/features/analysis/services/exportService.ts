export { exportLayerAsGeoJson, type ExportedFeatureCollection } from "@/features/database/services/exportLayer"

// Imported from their own modules rather than the `@/features/database`
// barrel: the barrel re-exports map components, which pull in Leaflet and
// leaflet-geoman, and a plain data service must not drag a map runtime
// into every consumer that only wanted to page features.
import { featureService } from "@/features/database/services/featureService"
import { exportLayerAsGeoJson, type ExportedFeatureCollection } from "@/features/database/services/exportLayer"

export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml"

export interface ExportProgressCallback {
  (pagesLoaded: number, totalPages: number): void
}

/** An assembled export: the file itself plus how many features went into it, which the export log records (US9, T233/T234). */
export interface ExportResult {
  blob: Blob
  featureCount: number
}

/** Beyond this many features a single-file export is worth warning about before it is attempted (T232, spec.md US9 Edge Cases). */
export const LARGE_EXPORT_FEATURE_THRESHOLD = 50_000

/** MIME type per format, so a downloaded file opens in the right tool. */
export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  geojson: "application/geo+json",
  shapefile: "application/zip",
  csv: "text/csv",
  kml: "application/vnd.google-earth.kml+xml",
}

export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = {
  geojson: "geojson",
  shapefile: "zip",
  csv: "csv",
  kml: "kml",
}

interface PagedFeature {
  geometry: unknown
  properties: Record<string, string>
}

/**
 * Pages through a layer's features, handing each page to `onPage` as it
 * arrives rather than returning one array (T231), and reporting how many
 * features were seen in total.
 *
 * `totalPages` is genuinely unknown until the last page returns a null
 * cursor, so progress is reported as `(pagesLoaded, pagesLoaded + 1)`
 * while more remain and `(n, n)` once finished — an honest "at least this
 * far" rather than a fabricated total that would later jump backwards.
 */
async function forEachFeaturePage(
  layerId: string,
  onPage: (features: PagedFeature[]) => void,
  onProgress?: ExportProgressCallback,
): Promise<number> {
  let cursor: string | undefined
  let pagesLoaded = 0
  let featureCount = 0

  do {
    const page = await featureService.list(layerId, cursor ? { cursor } : undefined)
    const mapped: PagedFeature[] = page.features.map((feature) => ({
      geometry: feature.geometry as unknown,
      properties: Object.fromEntries(feature.attributes.map((attribute) => [attribute.key, attribute.value])),
    }))
    featureCount += mapped.length
    onPage(mapped)

    pagesLoaded += 1
    cursor = page.nextCursor ?? undefined
    onProgress?.(pagesLoaded, cursor ? pagesLoaded + 1 : pagesLoaded)
  } while (cursor)

  return featureCount
}

/** Escapes one CSV field per RFC 4180 — quotes doubled, and any field containing a comma, quote, or newline wrapped. */
function toCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * CSV export (US9.3, FR-022) — one row per feature, attributes flattened
 * to columns, plus a `geometry` column holding the feature's GeoJSON.
 *
 * Rows are buffered rather than streamed straight into Blob parts because
 * a CSV's header must list every column *before* any row is written, and
 * the full set of attribute keys is only known once the last page has
 * arrived. Emitting a header built from the first page alone would
 * silently drop columns that appear later, which is worse than the memory
 * cost of holding the rows.
 */
async function buildCsv(layerId: string, onProgress?: ExportProgressCallback): Promise<ExportResult> {
  const rows: Record<string, string>[] = []
  const columns = new Set<string>()

  const featureCount = await forEachFeaturePage(
    layerId,
    (features) => {
      for (const feature of features) {
        for (const key of Object.keys(feature.properties)) columns.add(key)
        rows.push({ ...feature.properties, geometry: JSON.stringify(feature.geometry) })
      }
    },
    onProgress,
  )

  const header = [...columns].sort()
  header.push("geometry")

  const lines = [header.map(toCsvField).join(",")]
  for (const row of rows) {
    lines.push(header.map((column) => toCsvField(row[column] ?? "")).join(","))
  }

  return { blob: new Blob([lines.join("\r\n")], { type: EXPORT_MIME_TYPES.csv }), featureCount }
}

/** Escapes text for XML character data. */
function escapeXml(value: string): string {
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
 * (research.md Decision 10). Multi-part geometries become
 * `<MultiGeometry>`, KML's own representation, so a multipolygon survives
 * as one placemark rather than being split into several.
 */
function toKmlGeometry(geometry: unknown): string {
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
 * KML export (US9.4, FR-022) — one `<Placemark>` per feature, attributes
 * carried as `<ExtendedData>` so they survive into Google Earth or QGIS.
 * Assembled into Blob parts page by page (T231): unlike CSV, KML needs no
 * whole-file knowledge before its first record.
 */
async function buildKml(layerId: string, onProgress?: ExportProgressCallback): Promise<ExportResult> {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n',
  ]

  const featureCount = await forEachFeaturePage(
    layerId,
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
    onProgress,
  )

  parts.push("</Document>\n</kml>\n")
  return { blob: new Blob(parts, { type: EXPORT_MIME_TYPES.kml }), featureCount }
}

/**
 * Shapefile export (US9.2, FR-022) — a zipped `.shp`/`.shx`/`.dbf`/`.prj`
 * set via the `@mapbox/shp-write` dependency.
 *
 * Unlike CSV and KML this cannot be assembled progressively: the writer
 * takes one complete FeatureCollection, because a shapefile's header
 * records the geometry type and bounding box of the entire file. Imported
 * lazily so the zip/writer code is not pulled into the bundle for users
 * who never export a shapefile.
 */
async function buildShapefile(layerId: string, onProgress?: ExportProgressCallback): Promise<ExportResult> {
  const features: PagedFeature[] = []
  const featureCount = await forEachFeaturePage(layerId, (page) => features.push(...page), onProgress)

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
  return { blob, featureCount }
}

export async function exportLayerAsCsv(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  return (await buildCsv(layerId, onProgress)).blob
}

export async function exportLayerAsKml(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  return (await buildKml(layerId, onProgress)).blob
}

export async function exportLayerAsShapefile(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  return (await buildShapefile(layerId, onProgress)).blob
}

/** Serializes a statistics-style `resultData` payload for a run that produced no layer. */
function resultDataBlob(resultData: unknown, format: ExportFormat): Blob {
  if (format === "csv") {
    const record = (resultData ?? {}) as Record<string, unknown>
    const keys = Object.keys(record)
    const header = keys.map(toCsvField).join(",")
    const row = keys.map((key) => toCsvField(String(record[key] ?? ""))).join(",")
    return new Blob([`${header}\r\n${row}`], { type: EXPORT_MIME_TYPES.csv })
  }
  return new Blob([JSON.stringify(resultData ?? null, null, 2)], { type: EXPORT_MIME_TYPES.geojson })
}

/**
 * Exports one analysis run's result (US9, FR-022).
 *
 * A run with a `resultLayerId` exports that layer in the requested format.
 * A run without one produced a `resultData` payload instead — every
 * Statistics operation, plus Near and Distance Matrix. There is no
 * geometry to put in a shapefile or KML, so those payloads are exported as
 * JSON (or a single CSV row) rather than throwing: "export what I am
 * looking at" is the useful behaviour, and refusing would leave the only
 * copy of a statistics result trapped in the panel.
 */
export async function exportAnalysisResult(
  run: { resultLayerId: string | null; resultData: unknown },
  format: ExportFormat,
  onProgress?: ExportProgressCallback,
): Promise<ExportResult> {
  if (!run.resultLayerId) {
    onProgress?.(1, 1)
    return { blob: resultDataBlob(run.resultData, format), featureCount: 0 }
  }

  const layerId = run.resultLayerId

  switch (format) {
    case "geojson": {
      // Delegates to database/services/exportLayer.ts rather than
      // reassembling GeoJSON here (T226, research.md Decision 10).
      const collection: ExportedFeatureCollection = await exportLayerAsGeoJson(layerId)
      onProgress?.(1, 1)
      return {
        blob: new Blob([JSON.stringify(collection)], { type: EXPORT_MIME_TYPES.geojson }),
        featureCount: collection.features.length,
      }
    }
    case "csv":
      return buildCsv(layerId, onProgress)
    case "kml":
      return buildKml(layerId, onProgress)
    case "shapefile":
      return buildShapefile(layerId, onProgress)
  }
}
