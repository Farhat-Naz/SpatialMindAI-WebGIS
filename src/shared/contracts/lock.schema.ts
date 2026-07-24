import { z } from "zod"

/** `FeatureLock` shape returned by `POST`/`GET /api/features/:featureId/lock` (US3). */
export const featureLockSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  lockedByUserId: z.string(),
  acquiredAt: z.string(),
  expiresAt: z.string(),
})
export type FeatureLock = z.infer<typeof featureLockSchema>
