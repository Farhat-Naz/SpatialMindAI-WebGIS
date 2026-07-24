import { featureService } from "@/features/database/services/featureService"

interface ExportedGeoJsonFeature {
  type: "Feature"
  geometry: unknown
  properties: Record<string, string>
}

export interface ExportedFeatureCollection {
  type: "FeatureCollection"
  features: ExportedGeoJsonFeature[]
}

/**
 * Pages through a layer's features until `nextCursor` is `null`, assembling
 * a complete GeoJSON `FeatureCollection` (Research Decision 6) — the
 * Features API is cursor-paginated, so a full export must aggregate across
 * pages rather than assume a single response contains everything.
 */
export async function exportLayerAsGeoJson(layerId: string): Promise<ExportedFeatureCollection> {
  const features: ExportedGeoJsonFeature[] = []
  let cursor: string | undefined

  do {
    const page = await featureService.list(layerId, cursor ? { cursor } : undefined)
    for (const feature of page.features) {
      features.push({
        type: "Feature",
        geometry: feature.geometry,
        properties: Object.fromEntries(
          feature.attributes.map((attribute) => [attribute.key, attribute.value]),
        ),
      })
    }
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  return { type: "FeatureCollection", features }
}
