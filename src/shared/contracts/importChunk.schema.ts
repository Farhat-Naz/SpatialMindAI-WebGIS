import { z } from "zod"
import { geometrySchema } from "./geometry.schema"
import { importIssueDraftSchema } from "./importIssue.schema"
import { importStatusSchema } from "./importJob.schema"

/**
 * Chunk-commit contracts (specs/005-import-export, contracts/api-contracts.md §2).
 *
 * This endpoint is the feature's **security boundary**: because all five
 * formats are parsed in the browser (research.md Decision 2), the server must
 * assume a hostile caller and re-validate everything here, regardless of what
 * the client's preflight claims to have checked (research.md Decision 18).
 */

/** Maximum features per chunk request (research.md Decision 3). */
export const IMPORT_CHUNK_MAX_FEATURES = 1000

/** Maximum chunk request body size in bytes, enforced before parsing (FR-083 defence in depth). */
export const IMPORT_CHUNK_MAX_BYTES = 8 * 1024 * 1024

/**
 * A position in the **source** coordinate system — finite, but deliberately
 * unbounded.
 *
 * `geometry.schema.ts`'s `position` bounds longitude to ±180 and latitude to
 * ±90, which is correct for WGS84 and wrong for every projected system: an
 * EPSG:27700 easting is around 530000. Since coordinates arrive untransformed
 * and `ST_Transform` runs server-side (research.md Decision 4), the structural
 * rules must be expressed once more without those bounds.
 *
 * `geometry.schema.ts` is deliberately left untouched — it is the authority
 * for WGS84 input and is used unchanged by Map Editing. `assertWgs84Ranges`
 * below delegates back to it whenever the source CRS *is* 4326, so the range
 * rules themselves are never restated.
 */
const sourcePosition = z.tuple([z.number().finite(), z.number().finite()])

const sourceLinearRing = z
  .array(sourcePosition)
  .min(4, "A polygon ring must have at least 4 positions")

/**
 * Structural validation for source-CRS geometry across the six supported
 * types (Constitution Principle IV). Anything else — `GeometryCollection`
 * included — is rejected by name.
 *
 * Structural strictness here is not cosmetic: malformed coordinate nesting
 * reaching `ST_GeomFromGeoJSON` would raise inside the chunk's transaction and
 * abort the whole chunk, rather than rejecting one feature.
 */
export const sourceGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: sourcePosition }),
  z.object({ type: z.literal("MultiPoint"), coordinates: z.array(sourcePosition).min(1) }),
  z.object({
    type: z.literal("LineString"),
    coordinates: z.array(sourcePosition).min(2, "A LineString must have at least 2 positions"),
  }),
  z.object({
    type: z.literal("MultiLineString"),
    coordinates: z
      .array(z.array(sourcePosition).min(2, "Each line must have at least 2 positions"))
      .min(1),
  }),
  z.object({ type: z.literal("Polygon"), coordinates: z.array(sourceLinearRing).min(1) }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(sourceLinearRing).min(1)).min(1),
  }),
])
export type SourceGeometry = z.infer<typeof sourceGeometrySchema>

/**
 * Applies WGS84 coordinate-range validation by delegating to the existing
 * `geometrySchema`, so those bounds live in exactly one place. Called only
 * when the job's source CRS is EPSG:4326 — for any projected source, the
 * range check belongs to `ST_Transform`'s output, not its input.
 */
export function assertWgs84Ranges(geometry: SourceGeometry): { valid: true } | { valid: false; message: string } {
  const result = geometrySchema.safeParse(geometry)
  if (result.success) return { valid: true }
  return { valid: false, message: result.error.issues[0]?.message ?? "Invalid geometry." }
}

/** One feature within a chunk, carrying its position in the source file so a rejection can be attributed to it. */
export const chunkFeatureSchema = z.object({
  sourcePosition: z.number().int().nonnegative(),
  geometry: sourceGeometrySchema,
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type ChunkFeature = z.infer<typeof chunkFeatureSchema>

/**
 * `POST /api/imports/:importJobId/chunks` request body. Idempotent on
 * `chunkIndex`: a replay after a network blip commits nothing new
 * (research.md Decision 3).
 */
export const commitImportChunkSchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  features: z
    .array(chunkFeatureSchema)
    .min(1, "A chunk must contain at least one feature")
    .max(IMPORT_CHUNK_MAX_FEATURES, `A chunk may contain at most ${IMPORT_CHUNK_MAX_FEATURES} features`),
})
export type CommitImportChunkInput = z.infer<typeof commitImportChunkSchema>

/** `POST /api/imports/:importJobId/chunks` response. */
export const importChunkResultSchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  committed: z.number().int().nonnegative(),
  rejected: z.array(importIssueDraftSchema),
  job: z.object({
    importedCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    duplicateCount: z.number().int().nonnegative(),
    status: importStatusSchema,
  }),
})
export type ImportChunkResult = z.infer<typeof importChunkResultSchema>
