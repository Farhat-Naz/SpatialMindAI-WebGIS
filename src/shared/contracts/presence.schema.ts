import { z } from "zod"

/** `POST /api/projects/:projectId/presence/heartbeat` request body — all fields optional (US9). */
export const presenceHeartbeatSchema = z.object({
  cursorLng: z.number().finite().min(-180).max(180).optional(),
  cursorLat: z.number().finite().min(-90).max(90).optional(),
  viewportBounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  currentFeatureId: z.string().trim().min(1).optional(),
})
export type PresenceHeartbeatInput = z.infer<typeof presenceHeartbeatSchema>

/** `Presence` shape returned by `GET /api/projects/:projectId/presence`. */
export const presenceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  cursorLng: z.number().nullable(),
  cursorLat: z.number().nullable(),
  viewportBounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  currentFeatureId: z.string().nullable(),
  lastSeenAt: z.string(),
})
export type Presence = z.infer<typeof presenceSchema>
