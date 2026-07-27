import { z } from "zod"
import { crsCodeSchema, CUSTOM_CRS_CODE } from "./crs.schema"
import { importIssueDraftSchema } from "./importIssue.schema"

/**
 * Import-job contracts (specs/005-import-export, contracts/api-contracts.md
 * §1, §3, §6). Imported by both the Route Handlers and the client
 * `importService`, so request/response shapes cannot drift (Constitution
 * Principle II).
 */

/** The five source formats the platform accepts (FR-001). */
export const importSourceFormatSchema = z.enum(["geojson", "shapefile", "kml", "kmz", "csv"])
export type ImportSourceFormat = z.infer<typeof importSourceFormatSchema>

/**
 * Strict rejects the whole file on any invalid feature; Lenient imports the
 * valid subset and reports the rest. **Lenient is the platform default**
 * (FR-006). Strict is enforced by auto-rollback on the first commit-time
 * rejection (research.md Decision 6), so this value records intent rather
 * than selecting a different write path.
 */
export const importModeSchema = z.enum(["strict", "lenient"])
export type ImportMode = z.infer<typeof importModeSchema>

/** Lifecycle states from data-model.md's state diagram. `running` is the only non-terminal one. */
export const importStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "rolled_back",
])
export type ImportStatus = z.infer<typeof importStatusSchema>

/**
 * How a CSV import's columns were interpreted. Retained on the job so a past
 * import's interpretation is reproducible (spec.md Key Entities).
 */
export const columnMappingSchema = z.object({
  latitudeColumn: z.string(),
  longitudeColumn: z.string(),
  delimiter: z.string().min(1).max(4),
  hasHeaderRow: z.boolean(),
  attributeColumns: z.array(z.string()),
})
export type ColumnMapping = z.infer<typeof columnMappingSchema>

/**
 * Preflight totals. Always exact, even when the accompanying issue list is
 * capped at `IMPORT_MAX_PERSISTED_ISSUES` (research.md Decision 16) — this is
 * what keeps SC-006's "imported + rejected + duplicate sums to total read"
 * property true.
 */
export const preflightCountsSchema = z.object({
  rejected: z.number().int().nonnegative(),
  duplicate: z.number().int().nonnegative(),
  repaired: z.number().int().nonnegative(),
})
export type PreflightCounts = z.infer<typeof preflightCountsSchema>

/**
 * `POST /api/layers/:layerId/imports` request body. Sent after the client's
 * preflight has completed and the user has confirmed — abandoning at the
 * confirmation gate simply never issues this call (FR-011).
 */
export const createImportJobSchema = z
  .object({
    sourceFormat: importSourceFormatSchema,
    fileName: z.string().trim().min(1).max(512),
    fileSizeBytes: z.number().int().positive(),
    mimeType: z.string().trim().max(255).optional(),
    /** SHA-256 of the source file. Provenance only — never used to skip work, and never accompanied by the bytes (research.md Decision 2). */
    fileHash: z.string().trim().length(64).optional(),
    sourceCrs: crsCodeSchema,
    customCrsDefinition: z.string().trim().min(1).optional(),
    mode: importModeSchema.default("lenient"),
    /** Display denominator for progress. Correctness never depends on it — authoritative counts accumulate from what chunks actually commit. */
    totalFeatures: z.number().int().nonnegative(),
    columnMapping: columnMappingSchema.optional(),
    preflightIssues: z.array(importIssueDraftSchema).optional(),
    preflightCounts: preflightCountsSchema,
  })
  .refine(
    (value) => (value.sourceCrs === CUSTOM_CRS_CODE) === (value.customCrsDefinition !== undefined),
    {
      message: 'A custom coordinate system requires a definition, and a definition requires sourceCrs "CUSTOM".',
      path: ["customCrsDefinition"],
    },
  )
export type CreateImportJobInput = z.infer<typeof createImportJobSchema>

/** `POST /api/imports/:importJobId/complete` request body. */
export const completeImportJobSchema = z.object({
  outcome: z.enum(["succeeded", "failed"]),
  errorMessage: z.string().trim().max(1000).optional(),
})
export type CompleteImportJobInput = z.infer<typeof completeImportJobSchema>

/**
 * The `ImportJob` shape every import API response returns. Dates are ISO
 * strings over the wire; the repository's `ImportJobRecord` holds `Date`s.
 */
export const importJobRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  /** Null once the target layer has been deleted; `targetLayerName` stays readable (FR-079). */
  targetLayerId: z.string().nullable(),
  targetLayerName: z.string(),
  sourceFormat: importSourceFormatSchema,
  fileName: z.string(),
  fileSizeBytes: z.number().int(),
  mimeType: z.string().nullable(),
  fileHash: z.string().nullable(),
  sourceCrs: z.string(),
  customCrsDefinition: z.string().nullable(),
  mode: importModeSchema,
  columnMapping: columnMappingSchema.nullable(),
  status: importStatusSchema,
  totalFeatures: z.number().int().nullable(),
  importedCount: z.number().int(),
  rejectedCount: z.number().int(),
  duplicateCount: z.number().int(),
  repairedCount: z.number().int(),
  chunksCommitted: z.number().int(),
  errorMessage: z.string().nullable(),
  cancelRequestedAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
})
export type ImportJobRecordDto = z.infer<typeof importJobRecordSchema>

/** `GET /api/projects/:projectId/imports` response. */
export const importHistoryPageSchema = z.object({
  imports: z.array(importJobRecordSchema),
  nextCursor: z.string().nullable(),
})
export type ImportHistoryPage = z.infer<typeof importHistoryPageSchema>
