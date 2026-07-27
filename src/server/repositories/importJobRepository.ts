import { randomUUID } from "node:crypto"
import { Prisma, type ImportJob } from "@prisma/client"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { prismaClient } from "@/server/db/prismaClient"
import { CUSTOM_CRS_CODE, toSrid } from "@/shared/contracts/crs.schema"
import type { ColumnMapping } from "@/shared/contracts/importJob.schema"
import type { ImportIssueCategory, ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors/apiError"

/**
 * Import-job persistence (specs/005-import-export, contracts/repository-api.md).
 *
 * The browser tab executes an import; this repository is the job's system of
 * record (research.md Decision 3). Every function asserts its project role
 * before any read or write, throws the shared error classes rather than HTTP
 * responses, and returns a plain `*Record` — the conventions
 * `analysisRepository.ts` and `exportLogRepository.ts` already establish.
 *
 * `featureRepository.importFeatures` is deliberately **not** touched: its
 * per-feature loop and all-or-nothing transaction are Map Editing's contract.
 * The set-based path below is a second implementation for a different caller,
 * not a retuning of a shared one (research.md Decision 5).
 */

export type ImportSourceFormat = "geojson" | "shapefile" | "kml" | "kmz" | "csv"
export type ImportMode = "strict" | "lenient"
export type ImportStatus = "running" | "succeeded" | "failed" | "cancelled" | "rolled_back"

/** Maximum issue rows persisted per job (research.md Decision 16). Counters stay exact regardless. */
export const IMPORT_MAX_PERSISTED_ISSUES = 1000

/** A `running` job with no heartbeat this long is treated as abandoned (FR-074). */
export const ABANDONED_JOB_THRESHOLD_MS = 5 * 60 * 1000

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Terminal states — `POST /chunks` and `/complete` are refused once reached. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "rolled_back",
])

export interface ImportJobRecord {
  id: string
  projectId: string
  userId: string
  targetLayerId: string | null
  targetLayerName: string
  sourceFormat: ImportSourceFormat
  fileName: string
  fileSizeBytes: number
  mimeType: string | null
  fileHash: string | null
  sourceCrs: string
  customCrsDefinition: string | null
  mode: ImportMode
  columnMapping: ColumnMapping | null
  status: ImportStatus
  totalFeatures: number | null
  importedCount: number
  rejectedCount: number
  duplicateCount: number
  repairedCount: number
  chunksCommitted: number
  errorMessage: string | null
  cancelRequestedAt: Date | null
  heartbeatAt: Date | null
  startedAt: Date
  completedAt: Date | null
  createdAt: Date
}

export interface ImportIssueRecord {
  id: string
  importJobId: string
  sourcePosition: number
  category: ImportIssueCategory
  message: string
  createdAt: Date
}

function toRecord(row: ImportJob): ImportJobRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    targetLayerId: row.targetLayerId,
    targetLayerName: row.targetLayerName,
    sourceFormat: row.sourceFormat as ImportSourceFormat,
    fileName: row.fileName,
    fileSizeBytes: row.fileSizeBytes,
    mimeType: row.mimeType,
    fileHash: row.fileHash,
    sourceCrs: row.sourceCrs,
    customCrsDefinition: row.customCrsDefinition,
    mode: row.mode as ImportMode,
    columnMapping: (row.columnMapping as ColumnMapping | null) ?? null,
    status: row.status as ImportStatus,
    totalFeatures: row.totalFeatures,
    importedCount: row.importedCount,
    rejectedCount: row.rejectedCount,
    duplicateCount: row.duplicateCount,
    repairedCount: row.repairedCount,
    chunksCommitted: row.chunksCommitted,
    errorMessage: row.errorMessage,
    cancelRequestedAt: row.cancelRequestedAt,
    heartbeatAt: row.heartbeatAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  }
}

/**
 * Sweeps `running` jobs whose heartbeat has gone stale to `failed`
 * (FR-074, research.md Decision 17).
 *
 * Reading history is the only moment anyone can observe a stale job, so it is
 * the correct moment to resolve one — which is why this needs no cron, no
 * scheduler, and no infrastructure the platform does not already have. The
 * rollback action stays available on the swept job.
 */
async function sweepAbandonedJobs(projectId: string): Promise<void> {
  await prismaClient.importJob.updateMany({
    where: {
      projectId,
      status: "running",
      heartbeatAt: { lt: new Date(Date.now() - ABANDONED_JOB_THRESHOLD_MS) },
    },
    data: {
      status: "failed",
      errorMessage: "The import was interrupted before it finished.",
      completedAt: new Date(),
    },
  })
}

/**
 * Loads a job and asserts the caller's role on its project. Throws
 * `NotFoundError` for an unknown job — matching `assertProjectRole`'s
 * non-disclosure rule, so a caller cannot distinguish "doesn't exist" from
 * "exists but isn't yours".
 */
async function getJobScopedToRole(
  importJobId: string,
  userId: string,
  minRole: "Viewer" | "Editor",
): Promise<ImportJob> {
  const job = await prismaClient.importJob.findUnique({ where: { id: importJobId } })
  if (!job) {
    throw new NotFoundError(`No import job found with id "${importJobId}".`)
  }
  await assertProjectRole(job.projectId, userId, minRole)
  return job
}

/**
 * Asserts the source CRS is one PostGIS can actually transform from (FR-063).
 *
 * The custom probe uses the **same three-argument `ST_Transform` form** the
 * commit will use, and asserts it returns a usable geometry. Matching the forms
 * matters more than it looks: the two-argument
 * `ST_Transform(geometry, to_proj text)` accepts a proj4 string but, given WKT,
 * silently returns the geometry **unchanged** rather than erroring — so a probe
 * written against that signature would pass a `.prj`'s WKT and the import would
 * then persist every coordinate untransformed, with nothing reporting a problem.
 * The three-argument `from_proj → to_srid` form handles both proj4 and WKT
 * correctly, which is why `toCanonicalGeometry` uses it and why this probe must
 * too.
 */
async function assertCrsIsUsable(sourceCrs: string, customCrsDefinition: string | null): Promise<void> {
  if (sourceCrs === CUSTOM_CRS_CODE) {
    if (!customCrsDefinition) {
      throw new ValidationError('A custom coordinate system requires a definition.')
    }

    // Probed through PostGIS itself rather than by trusting the client's parse —
    // this is the transform that will actually run.
    try {
      const rows = await prismaClient.$queryRaw<{ probe: string | null }[]>`
        SELECT ST_AsText(
                 ST_Transform(ST_GeomFromText('POINT(1000 2000)'), ${customCrsDefinition}, 4326)
               ) AS probe
      `
      if (!rows[0]?.probe) {
        throw new ValidationError("The supplied coordinate system definition could not be used.")
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error
      throw new ValidationError("The supplied coordinate system definition could not be used.")
    }
    return
  }

  const srid = toSrid(sourceCrs)
  if (srid === null) {
    throw new ValidationError(`"${sourceCrs}" is not a recognized coordinate system.`)
  }
  const rows = await prismaClient.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM spatial_ref_sys WHERE srid = ${srid}
  `
  if (Number(rows[0]?.count ?? 0) === 0) {
    throw new ValidationError(`Coordinate system "${sourceCrs}" is not available on this server.`)
  }
}

/**
 * The SQL fragment that transforms a source-CRS GeoJSON string into the
 * platform's canonical EPSG:4326 geometry.
 *
 * Constitution Principle IV: the transform whose result is persisted runs in
 * PostGIS, never in JavaScript (research.md Decision 4). A custom definition is
 * passed as **proj4 text** — see `assertCrsIsUsable` for why WKT must never
 * reach here.
 */
function toCanonicalGeometry(geomExpr: Prisma.Sql, sourceCrs: string, customDefinition: string | null): Prisma.Sql {
  if (sourceCrs === CUSTOM_CRS_CODE && customDefinition) {
    // The three-argument `ST_Transform(geometry, from_proj text, to_srid int)`
    // form: the incoming coordinates *are* in the custom CRS and are being
    // brought to 4326.
    //
    // Deliberately not `ST_Transform(ST_SetSRID(…, 4326), definition)`, which
    // reads as the same thing but means the opposite — it declares the source to
    // be WGS84 and converts *to* the custom system. For a projected source that
    // raises "latitude or longitude exceeded limits" because a 530000 easting is
    // read as a longitude; for a source whose values happen to fall inside
    // ±180/±90 it would silently persist doubly-wrong coordinates.
    return Prisma.sql`ST_Transform(ST_GeomFromGeoJSON(${geomExpr}), ${customDefinition}, 4326)`
  }
  const srid = toSrid(sourceCrs) ?? 4326
  if (srid === 4326) {
    return Prisma.sql`ST_SetSRID(ST_GeomFromGeoJSON(${geomExpr}), 4326)`
  }
  // `${srid}::int` is load-bearing, not decoration: Prisma binds a JS number
  // as `bigint`, and PostGIS declares `ST_SetSRID(geometry, integer)` with no
  // bigint overload — without the cast this fails at runtime with
  // `42883 function st_setsrid(geometry, bigint) does not exist`. The 4326
  // branch above is unaffected because that literal is inlined into the SQL
  // rather than bound as a parameter.
  return Prisma.sql`ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geomExpr}), ${srid}::int), 4326)`
}

// ---------------------------------------------------------------------------
// createImportJob
// ---------------------------------------------------------------------------

export interface CreateImportJobInput {
  sourceFormat: ImportSourceFormat
  fileName: string
  fileSizeBytes: number
  mimeType?: string
  fileHash?: string
  sourceCrs: string
  customCrsDefinition?: string
  mode: ImportMode
  totalFeatures: number
  columnMapping?: ColumnMapping
  preflightIssues?: ImportIssueDraft[]
  preflightCounts: { rejected: number; duplicate: number; repaired: number }
}

/**
 * Creates a job in `running` state after the client's preflight and the user's
 * confirmation (FR-005). Persists up to `IMPORT_MAX_PERSISTED_ISSUES` preflight
 * issues; the seeded counters come from `preflightCounts` and stay **exact**
 * even when the issue list is capped (research.md Decision 16, SC-006).
 */
export async function createImportJob(
  layerId: string,
  userId: string,
  input: CreateImportJobInput,
): Promise<ImportJobRecord> {
  const layer = await prismaClient.layer.findUnique({
    where: { id: layerId },
    select: { id: true, name: true, projectId: true },
  })
  if (!layer) {
    throw new NotFoundError(`No layer found with id "${layerId}".`)
  }
  await assertProjectRole(layer.projectId, userId, "Editor")
  await assertCrsIsUsable(input.sourceCrs, input.customCrsDefinition ?? null)

  const job = await prismaClient.importJob.create({
    data: {
      projectId: layer.projectId,
      userId,
      targetLayerId: layer.id,
      targetLayerName: layer.name,
      sourceFormat: input.sourceFormat,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      mimeType: input.mimeType ?? null,
      fileHash: input.fileHash ?? null,
      sourceCrs: input.sourceCrs,
      customCrsDefinition: input.customCrsDefinition ?? null,
      mode: input.mode,
      columnMapping: (input.columnMapping as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
      status: "running",
      totalFeatures: input.totalFeatures,
      rejectedCount: input.preflightCounts.rejected,
      duplicateCount: input.preflightCounts.duplicate,
      repairedCount: input.preflightCounts.repaired,
      heartbeatAt: new Date(),
    },
  })

  const issues = (input.preflightIssues ?? []).slice(0, IMPORT_MAX_PERSISTED_ISSUES)
  if (issues.length > 0) {
    await prismaClient.importIssue.createMany({
      data: issues.map((issue) => ({
        importJobId: job.id,
        sourcePosition: issue.sourcePosition,
        category: issue.category,
        message: issue.message,
      })),
    })
  }

  return toRecord(job)
}

// ---------------------------------------------------------------------------
// commitImportChunk — the performance-critical path
// ---------------------------------------------------------------------------

export interface ImportChunkFeature {
  sourcePosition: number
  geometry: unknown
  attributes: { key: string; value: string }[]
}

export interface ImportChunkRejection {
  sourcePosition: number
  category: ImportIssueCategory
  message: string
}

export interface ImportChunkResult {
  chunkIndex: number
  committed: number
  rejected: ImportChunkRejection[]
  job: {
    importedCount: number
    rejectedCount: number
    duplicateCount: number
    status: ImportStatus
  }
}

interface InsertedRow {
  id: string
  position: number
}

/**
 * Commits one chunk of features (research.md Decisions 3, 5, 8).
 *
 * **Four statements per 1,000-feature chunk, not three per feature.** The
 * existing `featureRepository.importFeatures` issues one `ST_IsValid` probe,
 * one INSERT, and one attribute `createMany` per feature — ~300,000 round
 * trips at 100,000 features, which cannot meet SC-002 under any chunking
 * scheme. The set-based form below is ~400 statements for the whole import.
 *
 * Rejections fall out for free: the positions passed in, minus the positions
 * `RETURNING` gives back, are exactly the features PostGIS refused. Only those
 * few are re-probed for a specific reason, so `ST_IsValidReason` never runs
 * over the whole chunk.
 */
export async function commitImportChunk(
  importJobId: string,
  userId: string,
  chunkIndex: number,
  features: ImportChunkFeature[],
): Promise<ImportChunkResult> {
  const job = await getJobScopedToRole(importJobId, userId, "Editor")

  // Guard order matters: cancellation is checked before terminal status so a
  // cancelled job reports the cancellation rather than a generic conflict.
  if (job.cancelRequestedAt !== null) {
    throw new ConflictError("This import was cancelled and cannot accept more data.")
  }
  if (TERMINAL_STATUSES.has(job.status)) {
    throw new ConflictError(`This import has already finished (status: ${job.status}).`)
  }
  if (!job.targetLayerId) {
    throw new ConflictError("The layer this import targeted no longer exists.")
  }

  // Idempotency (research.md Decision 3): a replayed chunk after a network
  // blip must commit nothing new. Retries are routine across the ~100 requests
  // a large import makes.
  if (chunkIndex < job.chunksCommitted) {
    return {
      chunkIndex,
      committed: 0,
      rejected: [],
      job: {
        importedCount: job.importedCount,
        rejectedCount: job.rejectedCount,
        duplicateCount: job.duplicateCount,
        status: job.status as ImportStatus,
      },
    }
  }

  const layerId = job.targetLayerId
  const positions = features.map((feature) => feature.sourcePosition)
  const geometries = features.map((feature) => JSON.stringify(feature.geometry))
  const ids = features.map(() => randomUUID())

  const canonical = toCanonicalGeometry(
    Prisma.sql`v.geom`,
    job.sourceCrs,
    job.customCrsDefinition,
  )

  const updated = await prismaClient.$transaction(async (tx) => {
    // Statement 1 — set-based insert. Invalid topology and existing-layer
    // duplicates are filtered in SQL rather than probed per feature.
    //
    // The duplicate probe narrows candidates with `&&` (bbox overlap, served
    // by Feature_geometry_gist_idx) before ST_OrderingEquals, which is the
    // byte-identical test the spec's duplicate definition actually calls for —
    // ST_Equals is a point-set test and far more expensive (research.md
    // Decision 8).
    const inserted = await tx.$queryRaw<InsertedRow[]>`
      WITH source AS (
        SELECT v.id, v.geom, v.position, ${canonical} AS geometry
        FROM unnest(
          ${ids}::text[],
          ${geometries}::text[],
          ${positions}::int[]
        ) AS v(id, geom, position)
      )
      INSERT INTO "Feature" (id, "layerId", geometry, "importJobId", "createdAt", "updatedAt")
      SELECT s.id, ${layerId}, s.geometry, ${importJobId}, NOW(), NOW()
      FROM source s
      WHERE ST_IsValid(s.geometry)
        AND NOT EXISTS (
          SELECT 1 FROM "Feature" existing
          WHERE existing."layerId" = ${layerId}
            AND existing.geometry && s.geometry
            AND ST_OrderingEquals(existing.geometry, s.geometry)
        )
      RETURNING id, (SELECT position FROM source WHERE source.id = "Feature".id) AS position
    `

    const insertedPositions = new Set(inserted.map((row) => row.position))
    const insertedIdByPosition = new Map(inserted.map((row) => [row.position, row.id]))

    // Statement 2 — attributes for the features that actually landed.
    const attributeRows = features
      .filter((feature) => insertedPositions.has(feature.sourcePosition))
      .flatMap((feature) => {
        const featureId = insertedIdByPosition.get(feature.sourcePosition)
        if (!featureId) return []
        return feature.attributes.map((attribute) => ({
          featureId,
          key: attribute.key,
          value: attribute.value,
        }))
      })
    if (attributeRows.length > 0) {
      await tx.featureAttribute.createMany({ data: attributeRows, skipDuplicates: true })
    }

    // Attribute rejections to a specific cause — only for what failed.
    const rejected = await classifyRejections(
      tx,
      features.filter((feature) => !insertedPositions.has(feature.sourcePosition)),
      layerId,
      job.sourceCrs,
      job.customCrsDefinition,
    )

    const duplicates = rejected.filter((entry) => entry.category === "duplicate_in_layer").length
    const failures = rejected.length - duplicates

    // Statement 3 — counters, chunk high-water mark, and the heartbeat the
    // abandoned-job sweep reads.
    const jobRow = await tx.importJob.update({
      where: { id: importJobId },
      data: {
        importedCount: { increment: inserted.length },
        rejectedCount: { increment: failures },
        duplicateCount: { increment: duplicates },
        chunksCommitted: Math.max(job.chunksCommitted, chunkIndex + 1),
        heartbeatAt: new Date(),
      },
    })

    // Statement 4 — issue rows, subject to the per-job cap.
    const persistedSoFar = await tx.importIssue.count({ where: { importJobId } })
    const room = Math.max(0, IMPORT_MAX_PERSISTED_ISSUES - persistedSoFar)
    if (room > 0 && rejected.length > 0) {
      await tx.importIssue.createMany({
        data: rejected.slice(0, room).map((entry) => ({
          importJobId,
          sourcePosition: entry.sourcePosition,
          category: entry.category,
          message: entry.message,
        })),
      })
    }

    return { inserted: inserted.length, rejected, jobRow }
  })

  return {
    chunkIndex,
    committed: updated.inserted,
    rejected: updated.rejected,
    job: {
      importedCount: updated.jobRow.importedCount,
      rejectedCount: updated.jobRow.rejectedCount,
      duplicateCount: updated.jobRow.duplicateCount,
      status: updated.jobRow.status as ImportStatus,
    },
  }
}

/**
 * Determines why each non-inserted feature was refused, running the expensive
 * `ST_IsValidReason` only over actual failures rather than the whole chunk
 * (plan.md Performance).
 */
async function classifyRejections(
  tx: Prisma.TransactionClient,
  failed: ImportChunkFeature[],
  layerId: string,
  sourceCrs: string,
  customDefinition: string | null,
): Promise<ImportChunkRejection[]> {
  if (failed.length === 0) return []

  const canonical = toCanonicalGeometry(Prisma.sql`v.geom`, sourceCrs, customDefinition)
  const positions = failed.map((feature) => feature.sourcePosition)
  const geometries = failed.map((feature) => JSON.stringify(feature.geometry))

  const probed = await tx.$queryRaw<
    { position: number; valid: boolean; reason: string | null; duplicate: boolean }[]
  >`
    WITH source AS (
      SELECT v.position, ${canonical} AS geometry
      FROM unnest(${geometries}::text[], ${positions}::int[]) AS v(geom, position)
    )
    SELECT
      s.position,
      ST_IsValid(s.geometry) AS valid,
      CASE WHEN ST_IsValid(s.geometry) THEN NULL ELSE ST_IsValidReason(s.geometry) END AS reason,
      EXISTS (
        SELECT 1 FROM "Feature" existing
        WHERE existing."layerId" = ${layerId}
          AND existing.geometry && s.geometry
          AND ST_OrderingEquals(existing.geometry, s.geometry)
      ) AS duplicate
    FROM source s
  `

  return probed.map((row) => {
    if (!row.valid) {
      return {
        sourcePosition: row.position,
        category: "invalid_topology" as const,
        message: row.reason
          ? `The geometry is not valid: ${row.reason}`
          : "The geometry is not topologically valid.",
      }
    }
    if (row.duplicate) {
      return {
        sourcePosition: row.position,
        category: "duplicate_in_layer" as const,
        message: "An identical feature already exists in this layer.",
      }
    }
    return {
      sourcePosition: row.position,
      category: "invalid_geometry" as const,
      message: "The geometry could not be stored.",
    }
  })
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Finalizes a job (contracts/api-contracts.md §3). `ConflictError` if already terminal. */
export async function completeImportJob(
  importJobId: string,
  userId: string,
  outcome: "succeeded" | "failed",
  errorMessage?: string,
): Promise<ImportJobRecord> {
  const job = await getJobScopedToRole(importJobId, userId, "Editor")
  if (TERMINAL_STATUSES.has(job.status)) {
    throw new ConflictError(`This import has already finished (status: ${job.status}).`)
  }

  const updated = await prismaClient.importJob.update({
    where: { id: importJobId },
    data: { status: outcome, errorMessage: errorMessage ?? null, completedAt: new Date() },
  })
  return toRecord(updated)
}

/**
 * Requests cancellation (FR-070, research.md Decision 13).
 *
 * Chunks already committed **remain** — the confirmed design decision
 * (spec.md Assumptions); recovery is the explicit rollback below. Setting
 * `cancelRequestedAt` is what makes cancellation a server guarantee rather
 * than client politeness: `commitImportChunk` refuses every subsequent chunk.
 *
 * No `pg_cancel_backend`: the longest statement here is one chunk insert, so a
 * chunk-boundary check meets SC-004's two-second budget without aborting a
 * partially-applied transaction.
 *
 * A cancel on an already-terminal job is a **no-op success, not an error** —
 * deliberately mirroring `analysisRepository.cancelRun`'s first guard.
 */
export async function cancelImportJob(importJobId: string, userId: string): Promise<ImportJobRecord> {
  const job = await getJobScopedToRole(importJobId, userId, "Editor")
  if (TERMINAL_STATUSES.has(job.status)) {
    return toRecord(job)
  }

  const updated = await prismaClient.importJob.update({
    where: { id: importJobId },
    data: { status: "cancelled", cancelRequestedAt: new Date(), completedAt: new Date() },
  })
  return toRecord(updated)
}

/**
 * "Undo this import" — deletes exactly the features this job created
 * (FR-072, research.md Decision 14).
 *
 * Row-level provenance is the only predicate that can guarantee a concurrent
 * user's additions to the same layer survive; a timestamp window would take
 * them with it (spec.md Edge Cases, SC-011). `FeatureAttribute` and
 * `FeatureStyle` cascade via their existing foreign keys.
 *
 * Reachable from every terminal state including `succeeded`.
 */
export async function rollbackImportJob(
  importJobId: string,
  userId: string,
): Promise<{ job: ImportJobRecord; deletedFeatureCount: number }> {
  const job = await getJobScopedToRole(importJobId, userId, "Editor")
  if (job.status === "rolled_back") {
    throw new ConflictError("This import has already been undone.")
  }

  const result = await prismaClient.$transaction(async (tx) => {
    const deletedFeatureCount = await tx.$executeRaw`
      DELETE FROM "Feature" WHERE "importJobId" = ${importJobId}
    `
    const jobRow = await tx.importJob.update({
      where: { id: importJobId },
      data: { status: "rolled_back", completedAt: new Date() },
    })
    return { jobRow, deletedFeatureCount }
  })

  return { job: toRecord(result.jobRow), deletedFeatureCount: result.deletedFeatureCount }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One job's current detail/status, applying the abandoned-job sweep first (FR-074). */
export async function getImportJobById(
  importJobId: string,
  userId: string,
): Promise<ImportJobRecord | null> {
  const job = await prismaClient.importJob.findUnique({ where: { id: importJobId } })
  if (!job) return null
  await assertProjectRole(job.projectId, userId, "Viewer")

  await sweepAbandonedJobs(job.projectId)
  const fresh = await prismaClient.importJob.findUnique({ where: { id: importJobId } })
  return fresh ? toRecord(fresh) : null
}

export interface ListImportsParams {
  cursor?: string
  limit?: number
  status?: ImportStatus
}

/**
 * Cursor-paginated import history, newest first (FR-077). Readable by a
 * project `Viewer` — FR-080's "view-only members can read history" — while
 * every mutating action above requires `Editor`.
 *
 * This is the outline's "HistoryRepository": `ImportJob` rows *are* the
 * history, so there is no separate table and no separate repository file
 * (research.md Decision 15).
 */
export async function listImportsForProject(
  projectId: string,
  userId: string,
  params: ListImportsParams,
): Promise<{ imports: ImportJobRecord[]; nextCursor: string | null }> {
  await assertProjectRole(projectId, userId, "Viewer")
  await sweepAbandonedJobs(projectId)

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const rows = await prismaClient.importJob.findMany({
    where: { projectId, ...(params.status ? { status: params.status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1].id : null

  return { imports: pageRows.map(toRecord), nextCursor }
}

export interface ListIssuesResult {
  issues: ImportIssueRecord[]
  nextCursor: string | null
  totalPersisted: number
  /** True once the cap was reached — history holds the first 1,000 of a larger set. */
  truncated: boolean
}

/** A job's validation issues in source order (FR-058). */
export async function listIssuesForJob(
  importJobId: string,
  userId: string,
  params: { cursor?: string; limit?: number },
): Promise<ListIssuesResult> {
  await getJobScopedToRole(importJobId, userId, "Viewer")

  const limit = Math.min(params.limit ?? 100, 500)

  const rows = await prismaClient.importIssue.findMany({
    where: { importJobId },
    orderBy: [{ sourcePosition: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1].id : null

  const totalPersisted = await prismaClient.importIssue.count({ where: { importJobId } })

  return {
    issues: pageRows.map((row) => ({
      id: row.id,
      importJobId: row.importJobId,
      sourcePosition: row.sourcePosition,
      category: row.category as ImportIssueCategory,
      message: row.message,
      createdAt: row.createdAt,
    })),
    nextCursor,
    totalPersisted,
    truncated: totalPersisted >= IMPORT_MAX_PERSISTED_ISSUES,
  }
}
