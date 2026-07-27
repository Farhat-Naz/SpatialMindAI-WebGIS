import { z } from "zod"

/**
 * One validation finding against one source feature or CSV row
 * (specs/005-import-export, FR-057–FR-059; data-model.md `ImportIssue`).
 *
 * Named "issue" rather than "error" deliberately: `duplicate_in_file`,
 * `duplicate_in_layer`, `repaired_geometry`, `sanitized_attribute`,
 * `truncated_value`, and `unsupported_content` are reported and counted, but
 * are not failures.
 */
export const importIssueCategorySchema = z.enum([
  "invalid_geometry",
  "out_of_range_coordinate",
  "unsupported_geometry_type",
  "invalid_topology",
  "missing_coordinate",
  "duplicate_in_file",
  "duplicate_in_layer",
  "sanitized_attribute",
  "repaired_geometry",
  "unsupported_content",
  "truncated_value",
])
export type ImportIssueCategory = z.infer<typeof importIssueCategorySchema>

/** Maximum stored length of an issue message (data-model.md validation rules). */
export const IMPORT_ISSUE_MESSAGE_MAX_LENGTH = 500

/**
 * A single issue as submitted by the client's preflight. `sourcePosition` is a
 * zero-based feature index for GeoJSON/Shapefile/KML and a 1-based line number
 * for CSV — whichever the user can actually find in their own file (FR-033).
 */
export const importIssueDraftSchema = z.object({
  sourcePosition: z.number().int().nonnegative(),
  category: importIssueCategorySchema,
  message: z.string().trim().min(1).max(IMPORT_ISSUE_MESSAGE_MAX_LENGTH),
})
export type ImportIssueDraft = z.infer<typeof importIssueDraftSchema>

/** A persisted issue as returned by `GET /api/imports/:importJobId/issues`. */
export const importIssueSchema = importIssueDraftSchema.extend({
  id: z.string(),
  importJobId: z.string(),
  createdAt: z.string(),
})
export type ImportIssue = z.infer<typeof importIssueSchema>

/**
 * `GET /api/imports/:importJobId/issues` response. `truncated` is how the UI
 * states honestly that history holds the first `IMPORT_MAX_PERSISTED_ISSUES`
 * of a larger set (research.md Decision 16) — the counts on the job itself
 * remain exact regardless.
 */
export const importIssuePageSchema = z.object({
  issues: z.array(importIssueSchema),
  nextCursor: z.string().nullable(),
  totalPersisted: z.number().int().nonnegative(),
  truncated: z.boolean(),
})
export type ImportIssuePage = z.infer<typeof importIssuePageSchema>
