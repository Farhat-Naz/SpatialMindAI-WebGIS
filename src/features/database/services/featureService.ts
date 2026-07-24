import type {
  CreateFeatureInput,
  Feature,
  UpdateFeatureInput,
} from "@/shared/contracts/feature.schema"
import type { ImportFeatureCollectionInput } from "@/shared/contracts/geoJsonImport.schema"
import { apiFetch } from "./apiFetch"

export interface ListFeaturesQueryParams {
  cursor?: string
  limit?: number
  bbox?: [number, number, number, number]
}

/** Builds the `?cursor=&limit=&bbox=` query string for a feature-listing request. */
function toSearchParams(params?: ListFeaturesQueryParams): string {
  if (!params) return ""
  const searchParams = new URLSearchParams()
  if (params.cursor) searchParams.set("cursor", params.cursor)
  if (params.limit) searchParams.set("limit", String(params.limit))
  if (params.bbox) searchParams.set("bbox", params.bbox.join(","))
  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

/** Client-side fetch wrappers for the Features API. */
export const featureService = {
  /** Cursor-paginated feature listing for a layer, with an optional bbox filter. */
  list(
    layerId: string,
    params?: ListFeaturesQueryParams,
  ): Promise<{ features: Feature[]; nextCursor: string | null }> {
    return apiFetch(`/api/layers/${layerId}/features${toSearchParams(params)}`)
  },
  /** Creates a feature within a layer (geometry required; attributes/style optional). */
  create(layerId: string, input: CreateFeatureInput): Promise<{ feature: Feature }> {
    return apiFetch(`/api/layers/${layerId}/features`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
  /** Fetches a single feature by id. */
  get(featureId: string): Promise<{ feature: Feature }> {
    return apiFetch(`/api/features/${featureId}`)
  },
  /** Updates a feature's geometry, attributes, and/or style independently. */
  update(featureId: string, input: UpdateFeatureInput): Promise<{ feature: Feature }> {
    return apiFetch(`/api/features/${featureId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  },
  /** Deletes a feature; the server cascades to its attributes/style. */
  remove(featureId: string): Promise<void> {
    return apiFetch(`/api/features/${featureId}`, { method: "DELETE" })
  },
  /** Bulk-imports a GeoJSON `FeatureCollection` into a layer — append-only, all-or-nothing. */
  importFeatureCollection(
    layerId: string,
    input: ImportFeatureCollectionInput,
  ): Promise<{ importedCount: number }> {
    return apiFetch(`/api/layers/${layerId}/features/import`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
}
