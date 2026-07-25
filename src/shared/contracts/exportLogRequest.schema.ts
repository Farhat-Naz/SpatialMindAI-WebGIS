import { z } from "zod"

/**
 * `POST /api/projects/:projectId/exports` request body (US9, research.md
 * Decision 10 — the client does all export work itself; this call logs the
 * already-finished attempt for history/audit parity with `AnalysisRun`,
 * not to drive execution). The at-most-one-of-`sourceAnalysisRunId`/
 * `sourceLayerId` rule (data-model.md's validation rule) is enforced here
 * too, as defense in depth alongside `exportLogRepository.logExport`'s own
 * check — a malformed request is rejected before it ever reaches the
 * repository.
 */
export const logExportRequestSchema = z
  .object({
    format: z.enum(["geojson", "shapefile", "csv", "kml"]),
    status: z.enum(["succeeded", "failed"]),
    sourceAnalysisRunId: z.string().trim().min(1).optional(),
    sourceLayerId: z.string().trim().min(1).optional(),
    featureCount: z.number().int().nonnegative().optional(),
    errorMessage: z.string().trim().optional(),
  })
  .refine((data) => !(data.sourceAnalysisRunId && data.sourceLayerId), {
    message: "An export may reference at most one of sourceAnalysisRunId or sourceLayerId, not both.",
  })
export type LogExportRequestInput = z.infer<typeof logExportRequestSchema>
