import { z } from "zod"

/** `POST /api/projects/:projectId/versions` request body (FR-026). */
export const saveVersionSchema = z.object({
  note: z.string().trim().max(500).optional(),
})
export type SaveVersionInput = z.infer<typeof saveVersionSchema>

/** `Version` list-view shape — metadata only, excludes `snapshot` (api-contracts.md). */
export const versionMetadataSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  createdByUserId: z.string(),
  note: z.string().nullable(),
  isPreRestoreSnapshot: z.boolean(),
  createdAt: z.string(),
})
export type VersionMetadata = z.infer<typeof versionMetadataSchema>

/** `Version` detail shape — includes the full `snapshot` (compare/restore/detail views only). */
export const versionDetailSchema = versionMetadataSchema.extend({
  snapshot: z.unknown(),
})
export type VersionDetail = z.infer<typeof versionDetailSchema>
