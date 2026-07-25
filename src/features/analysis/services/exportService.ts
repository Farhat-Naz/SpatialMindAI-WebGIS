export { exportLayerAsGeoJson, type ExportedFeatureCollection } from "@/features/database/services/exportLayer"

export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml"

export interface ExportProgressCallback {
  (pagesLoaded: number, totalPages: number): void
}

/**
 * Shell (T081) — signatures only. Full per-format bodies (CSV flatten, KML
 * serialization, Shapefile zip via the new writer dependency, and the
 * `AnalysisRun`-result dispatcher) land with Phase 15 (Export Results),
 * once the client is actually wired to call them.
 */
export async function exportLayerAsCsv(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  void layerId
  void onProgress
  throw new Error("exportLayerAsCsv is not yet implemented (lands in Phase 15).")
}

export async function exportLayerAsKml(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  void layerId
  void onProgress
  throw new Error("exportLayerAsKml is not yet implemented (lands in Phase 15).")
}

export async function exportLayerAsShapefile(layerId: string, onProgress?: ExportProgressCallback): Promise<Blob> {
  void layerId
  void onProgress
  throw new Error("exportLayerAsShapefile is not yet implemented (lands in Phase 15).")
}

export async function exportAnalysisResult(
  run: { resultLayerId: string | null; resultData: unknown },
  format: ExportFormat,
  onProgress?: ExportProgressCallback,
): Promise<Blob> {
  void run
  void format
  void onProgress
  throw new Error("exportAnalysisResult is not yet implemented (lands in Phase 15).")
}
