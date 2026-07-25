import { z } from "zod"

/**
 * `POST /api/projects/:projectId/analysis/presets` request body (US8/
 * FR-021) — shell only (T008): validates `name`/`operationType` structure;
 * full per-`operationType` `parameters` validation against
 * `analysis.schema.ts`'s own per-operation shapes lands with Phase 14.
 */
export const createPresetRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  operationType: z.string().trim().min(1),
  parameters: z.unknown(),
})
export type CreatePresetRequestInput = z.infer<typeof createPresetRequestSchema>
