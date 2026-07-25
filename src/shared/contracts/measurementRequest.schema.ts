import { z } from "zod"

/**
 * `POST /api/projects/:projectId/measurements` request body (US3/FR-008,
 * research.md Decision 8 — "Save to History" re-computes the authoritative
 * value server-side via PostGIS before persisting) — shell only (T008);
 * full `geometry` validation (reusing `geometry.schema.ts`) lands with
 * Phase 10.
 */
export const saveMeasurementRequestSchema = z.object({
  measurementType: z.enum(["distance", "area", "perimeter", "radius", "bearing", "azimuth", "coordinates"]),
  geometry: z.unknown(),
  label: z.string().trim().max(500).optional(),
})
export type SaveMeasurementRequestInput = z.infer<typeof saveMeasurementRequestSchema>
