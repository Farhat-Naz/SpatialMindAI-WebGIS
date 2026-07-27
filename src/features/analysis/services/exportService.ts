export { exportLayerAsGeoJson, type ExportedFeatureCollection } from "@/features/database/services/exportLayer"

// Imported from their own modules rather than the `@/features/database` or
// `@/features/import-export` barrels: a barrel re-exports map components, which
// pull in Leaflet and leaflet-geoman, and a plain data service must not drag a
// map runtime into every consumer that only wanted to page features.
import { exportLayerAsGeoJson, type ExportedFeatureCollection } from "@/features/database/services/exportLayer"
import {
  EXPORT_FILE_EXTENSIONS as ALL_FILE_EXTENSIONS,
  EXPORT_MIME_TYPES as ALL_MIME_TYPES,
  LARGE_EXPORT_FEATURE_THRESHOLD as SHARED_LARGE_EXPORT_THRESHOLD,
} from "@/features/import-export/types/exportConstants"
import {
  escapeXml,
  toCsvField,
  toKmlGeometry,
  writeCsv,
  writeKml,
  writeShapefile,
  type ExportProgressCallback,
} from "@/features/import-export/services/exportWriters"

/**
 * Analysis-result export (007-spatial-analysis, US9).
 *
 * **The format writers no longer live here.** specs/005-import-export (T072)
 * moved `buildCsv` / `buildKml` / `buildShapefile`, the page-streaming reader,
 * and the KML/CSV serializers into
 * `features/import-export/services/exportWriters.ts`, because 005 needs the
 * same writers for layer, selection, and project scopes and two copies would
 * inevitably drift (research.md Decision 21).
 *
 * This module is now a **re-export shim plus `exportAnalysisResult`**. Its
 * public surface is unchanged: `useExportResult`, `useExportHistory`, and the
 * Result Panel compile and behave identically with no edit, which is the
 * regression guard plan.md's Testing Strategy names explicitly.
 *
 * The moved writers take an `ExportSource` rather than a bare `layerId`. The
 * three thin `exportLayerAs*` wrappers below adapt 007's call shape onto it, so
 * the change stops at this file.
 */

export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml"

export type { ExportProgressCallback }

/** An assembled export: the file itself plus how many features went into it, which the export log records. */
export interface ExportResult {
  blob: Blob
  featureCount: number
}

/**
 * Beyond this many features a single-file export is worth warning about before
 * it is attempted. Re-exported from 005's canonical declaration so the Result
 * Panel and the Export dialog cannot disagree about what "large" means.
 */
export const LARGE_EXPORT_FEATURE_THRESHOLD = SHARED_LARGE_EXPORT_THRESHOLD

/**
 * MIME type per format. Re-exported from 005's canonical map, narrowed to the
 * four vector formats 007 offers — a five-key object satisfies a four-key
 * record, so `pdf` being present in the source map is invisible here.
 */
export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = ALL_MIME_TYPES

export const EXPORT_FILE_EXTENSIONS: Record<ExportFormat, string> = ALL_FILE_EXTENSIONS

// Re-exported so any existing importer of these helpers keeps resolving.
export { escapeXml, toCsvField, toKmlGeometry, writeCsv, writeKml, writeShapefile }

/**
 * Adapts 007's `(layerId, onProgress)` call shape onto the moved writers'
 * `ExportSource`. `layerName` is unused by the vector writers — only the
 * project archive needs it — so a stable placeholder is passed rather than
 * threading a name 007's callers do not have.
 */
function layerSource(layerId: string) {
  return { kind: "layer" as const, layerId, layerName: layerId }
}

export async function exportLayerAsCsv(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  return (await writeCsv(layerSource(layerId), { onProgress })).blob
}

export async function exportLayerAsKml(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  return (await writeKml(layerSource(layerId), { onProgress })).blob
}

export async function exportLayerAsShapefile(
  layerId: string,
  onProgress?: ExportProgressCallback,
): Promise<Blob> {
  return (await writeShapefile(layerSource(layerId), { onProgress })).blob
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
 * A run without one produced a `resultData` payload instead — every Statistics
 * operation, plus Near and Distance Matrix. There is no geometry to put in a
 * shapefile or KML, so those payloads are exported as JSON (or a single CSV
 * row) rather than throwing: "export what I am looking at" is the useful
 * behaviour, and refusing would leave the only copy of a statistics result
 * trapped in the panel.
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

  const source = layerSource(run.resultLayerId)

  switch (format) {
    case "geojson": {
      // Delegates to database/services/exportLayer.ts rather than reassembling
      // GeoJSON here (007 research.md Decision 10).
      const collection: ExportedFeatureCollection = await exportLayerAsGeoJson(run.resultLayerId)
      onProgress?.(1, 1)
      return {
        blob: new Blob([JSON.stringify(collection)], { type: EXPORT_MIME_TYPES.geojson }),
        featureCount: collection.features.length,
      }
    }
    case "csv":
      return writeCsv(source, { onProgress })
    case "kml":
      return writeKml(source, { onProgress })
    case "shapefile":
      return writeShapefile(source, { onProgress })
  }
}
