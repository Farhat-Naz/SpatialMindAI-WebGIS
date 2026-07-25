import { z } from "zod"
import { geometrySchema } from "@/shared/contracts/geometry.schema"

/**
 * `POST /api/projects/:projectId/measurements` request body (US3/FR-008,
 * research.md Decision 8 — "Save to History" re-computes the authoritative
 * value server-side via PostGIS before persisting). `geometry` reuses
 * `geometry.schema.ts`'s existing structural + coordinate-range validation
 * (Constitution Principle II — one schema, no duplicated geometry rules);
 * topological validity (`ST_IsValid`) is still PostGIS's job, checked by
 * `measurementRepository.saveMeasurement` itself.
 */
export const saveMeasurementRequestSchema = z.object({
  measurementType: z.enum(["distance", "area", "perimeter", "radius", "bearing", "azimuth", "coordinates"]),
  geometry: geometrySchema,
  label: z.string().trim().max(500).optional(),
})
export type SaveMeasurementRequestInput = z.infer<typeof saveMeasurementRequestSchema>
