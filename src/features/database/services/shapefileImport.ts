import * as shapefile from "shapefile"
import { reprojectCoordinatesToWgs84 } from "@/features/database/utils/reprojection"
import { validateGeometryStructure } from "@/features/database/utils/validateGeoJson"
import type { ImportFeatureEntry } from "@/shared/contracts/geoJsonImport.schema"

export interface ShapefileFileSet {
  shp: File
  dbf?: File
  prj?: File
}

export interface ShapefileConversionResult {
  status: "success" | "error"
  features?: ImportFeatureEntry[]
  errorMessage?: string
}

/**
 * Converts an uploaded Shapefile file set (.shp + .dbf + optional .prj) into
 * the same GeoJSON `Feature[]` shape the bulk import endpoint's
 * `importFeatureCollectionSchema` accepts (raw `properties`, flattened to
 * attributes server-side, same as a plain GeoJSON import) — Shapefile
 * import reuses that single endpoint after this client-side conversion
 * (Research Decision 19), no second backend route. All validation happens
 * here, before any network call, so a rejected set never partially imports
 * (FR-037).
 */
export async function convertShapefileToFeatures(
  fileSet: ShapefileFileSet,
): Promise<ShapefileConversionResult> {
  if (!fileSet.dbf) {
    return { status: "error", errorMessage: "A .dbf file is required alongside the .shp file." }
  }

  const [shpBuffer, dbfBuffer, prjText] = await Promise.all([
    fileSet.shp.arrayBuffer(),
    fileSet.dbf.arrayBuffer(),
    fileSet.prj ? fileSet.prj.text() : Promise.resolve(null),
  ])

  let source: Awaited<ReturnType<typeof shapefile.open>>
  try {
    source = await shapefile.open(shpBuffer, dbfBuffer)
  } catch {
    return { status: "error", errorMessage: "The uploaded files are not a valid Shapefile set." }
  }

  const features: ImportFeatureEntry[] = []

  for (;;) {
    const result = await source.read()
    if (result.done) break

    const rawFeature = result.value
    const rawGeometry = rawFeature.geometry as { type: string; coordinates: unknown } | null
    if (!rawGeometry) {
      return { status: "error", errorMessage: "The Shapefile contains a record with no geometry." }
    }

    const geometry = prjText
      ? {
          type: rawGeometry.type,
          coordinates: reprojectCoordinatesToWgs84(rawGeometry.coordinates, prjText),
        }
      : rawGeometry

    const validation = validateGeometryStructure(geometry)
    if (!validation.valid) {
      return {
        status: "error",
        errorMessage: validation.message ?? "The Shapefile contains an unsupported geometry.",
      }
    }

    features.push({
      type: "Feature",
      geometry: geometry as ImportFeatureEntry["geometry"],
      properties: rawFeature.properties,
    })
  }

  if (features.length === 0) {
    return { status: "error", errorMessage: "The Shapefile contains no features to import." }
  }

  return { status: "success", features }
}
