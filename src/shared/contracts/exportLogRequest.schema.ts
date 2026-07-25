import { z } from "zod"

/**
 * `POST /api/projects/:projectId/exports` request body (US9, research.md
 * Decision 10 — the client does all export work itself; this call logs the
 * already-finished attempt for history/audit parity with `AnalysisRun`,
 * not to drive execution) — shell only (T008); full source/format
 * cross-field validation lands with Phase 15.
 */
export const logExportRequestSchema = z.object({
  format: z.enum(["geojson", "shapefile", "csv", "kml"]),
  status: z.enum(["succeeded", "failed"]),
  sourceAnalysisRunId: z.string().trim().min(1).optional(),
  sourceLayerId: z.string().trim().min(1).optional(),
  featureCount: z.number().int().nonnegative().optional(),
  errorMessage: z.string().trim().optional(),
})
export type LogExportRequestInput = z.infer<typeof logExportRequestSchema>
