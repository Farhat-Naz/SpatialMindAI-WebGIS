import { z } from "zod"
import { OPERATION_TYPES } from "@/shared/contracts/analysis.schema"

/**
 * `POST /api/projects/:projectId/analysis/presets` request body (US8/
 * FR-021). `operationType` is validated against the same known-operation
 * enum `analysis.schema.ts` itself uses — a preset can never be saved
 * against an operation that doesn't exist. `parameters` stays `z.unknown()`
 * here (not the full per-operation shape): a preset's parameters are
 * re-validated against that specific operation's own schema at *run* time
 * (`POST .../analysis`, when the preset is applied), which is where a
 * mismatch actually matters — duplicating that per-operation validation
 * here would only be able to drift from it.
 */
export const createPresetRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  operationType: z.enum(OPERATION_TYPES),
  parameters: z.unknown(),
})
export type CreatePresetRequestInput = z.infer<typeof createPresetRequestSchema>
