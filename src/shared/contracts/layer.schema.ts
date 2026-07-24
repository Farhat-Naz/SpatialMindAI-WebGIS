import { z } from "zod"

const name = z.string().trim().min(1, "Layer name must not be empty")

/** `POST /api/projects/:projectId/layers` request body. */
export const createLayerSchema = z.object({ name })
export type CreateLayerInput = z.infer<typeof createLayerSchema>

/** `PATCH /api/layers/:layerId` request body. */
export const renameLayerSchema = z.object({ name })
export type RenameLayerInput = z.infer<typeof renameLayerSchema>

/** `PATCH /api/projects/:projectId/layers/reorder` request body. */
export const reorderLayersSchema = z.object({
  orderedLayerIds: z.array(z.string()).min(1, "orderedLayerIds must not be empty"),
})
export type ReorderLayersInput = z.infer<typeof reorderLayersSchema>

/** Layer shape returned by every Layers API response. */
export const layerSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  projectId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Layer = z.infer<typeof layerSchema>
