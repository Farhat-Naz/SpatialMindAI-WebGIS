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
    // specs/005-import-export: `pdf` added (FR-034). Print/PDF output is
    // produced entirely in the browser like every other format — this
    // endpoint still only logs a finished attempt.
    format: z.enum(["geojson", "shapefile", "csv", "kml", "pdf"]),
    status: z.enum(["succeeded", "failed"]),
    sourceAnalysisRunId: z.string().trim().min(1).optional(),
    sourceLayerId: z.string().trim().min(1).optional(),
    featureCount: z.number().int().nonnegative().optional(),
    errorMessage: z.string().trim().optional(),

    // ---- specs/005-import-export additions (FR-035, FR-041, FR-037) ----
    // All three are optional/defaulted so every 007 caller keeps compiling
    // and behaving identically; `layer` is what every pre-existing row was.
    scope: z.enum(["selection", "layer", "project"]).default("layer"),
    outputCrs: z
      .string()
      .regex(/^EPSG:\d{4,6}$/, "Expected an authority code such as EPSG:4326")
      .optional(),
    layerCount: z.number().int().positive().optional(),
  })
  .refine((data) => !(data.sourceAnalysisRunId && data.sourceLayerId), {
    message: "An export may reference at most one of sourceAnalysisRunId or sourceLayerId, not both.",
  })
  .refine((data) => !(data.scope === "project" && (data.sourceAnalysisRunId || data.sourceLayerId)), {
    message: "A project-scope export may not reference a source analysis run or layer.",
  })
/**
 * What a **caller sends**. Deliberately `z.input`, not `z.infer`: `scope` has
 * a `.default()`, which makes it required in the *output* type and optional in
 * the *input* type. Using `z.infer` here would force every pre-existing 007
 * caller to start passing `scope` explicitly — precisely the breakage this
 * additive widening exists to avoid.
 */
export type LogExportRequestInput = z.input<typeof logExportRequestSchema>

/** What the schema **produces** after parsing — `scope` always present. Used by the Route Handler. */
export type LogExportRequestOutput = z.output<typeof logExportRequestSchema>
