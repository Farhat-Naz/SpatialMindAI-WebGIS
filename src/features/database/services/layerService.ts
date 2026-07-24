import type { CreateLayerInput, Layer, RenameLayerInput } from "@/shared/contracts/layer.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the Layers API. */
export const layerService = {
  /** Lists a project's layers, ordered by `order` ascending. */
  list(projectId: string): Promise<{ layers: Layer[] }> {
    return apiFetch(`/api/projects/${projectId}/layers`)
  },
  /** Creates a layer within a project; the server assigns the next `order` value. */
  create(projectId: string, input: CreateLayerInput): Promise<{ layer: Layer }> {
    return apiFetch(`/api/projects/${projectId}/layers`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
  /** Renames a layer without affecting its features. */
  rename(layerId: string, input: RenameLayerInput): Promise<{ layer: Layer }> {
    return apiFetch(`/api/layers/${layerId}`, { method: "PATCH", body: JSON.stringify(input) })
  },
  /** Bulk-reorders a project's layers; `orderedLayerIds` must be the full current set. */
  reorder(projectId: string, orderedLayerIds: string[]): Promise<{ layers: Layer[] }> {
    return apiFetch(`/api/projects/${projectId}/layers/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ orderedLayerIds }),
    })
  },
  /** Deletes a layer; the server cascades to every feature/attribute/style beneath it. */
  remove(layerId: string): Promise<void> {
    return apiFetch(`/api/layers/${layerId}`, { method: "DELETE" })
  },
}
