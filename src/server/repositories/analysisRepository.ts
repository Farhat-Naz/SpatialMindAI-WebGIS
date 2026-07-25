import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertProjectRole, type ProjectRole } from "@/server/auth/assertProjectRole"
import { cancelBackendPid } from "@/server/db/pgCancel"
import { NotFoundError, RateLimitedError, ValidationError } from "@/shared/errors/apiError"
import type { AnalysisRequestInput, OperationType } from "@/shared/contracts/analysis.schema"
import {
  BACKGROUND_EXECUTION_THRESHOLD,
  CHUNK_PAGE_SIZE,
  MAX_CONCURRENT_JOBS_PER_USER,
} from "@/features/analysis/types/analysisConfig.constants"
import * as ops from "@/server/repositories/analysisOperations"

export type AnalysisJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export interface AnalysisRunRecord {
  id: string
  projectId: string
  userId: string
  operationType: string
  status: AnalysisJobStatus
  progress: number | null
  parameters: unknown
  inputLayerIds: string[]
  resultLayerId: string | null
  resultData: unknown
  errorMessage: string | null
  batchId: string | null
  presetId: string | null
  startedAt: Date | null
  completedAt: Date | null
  executionTimeMs: number | null
  cancelRequestedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface RawAnalysisRunRow {
  id: string
  projectId: string
  userId: string
  operationType: string
  status: string
  progress: number | null
  parameters: unknown
  inputLayerIds: unknown
  resultLayerId: string | null
  resultData: unknown
  errorMessage: string | null
  batchId: string | null
  presetId: string | null
  startedAt: Date | null
  completedAt: Date | null
  executionTimeMs: number | null
  cancelRequestedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: RawAnalysisRunRow): AnalysisRunRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    operationType: row.operationType,
    status: row.status as AnalysisJobStatus,
    progress: row.progress,
    parameters: row.parameters,
    inputLayerIds: row.inputLayerIds as string[],
    resultLayerId: row.resultLayerId,
    resultData: row.resultData,
    errorMessage: row.errorMessage,
    batchId: row.batchId,
    presetId: row.presetId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    executionTimeMs: row.executionTimeMs,
    cancelRequestedAt: row.cancelRequestedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Fetches a run and asserts the caller has at least `minRole` on its
 * project (research.md Decision 3). Looks the run up by id first, then
 * defers to `assertProjectRole`'s own non-disclosure behavior (`NotFoundError`
 * for "doesn't exist" and "not a member" alike; `ForbiddenError` only once
 * membership is confirmed but the role is insufficient) — matching the HTTP
 * layer's existing convention that both cases map to the same 404, even
 * though this function's own control flow checks row-existence first.
 */
async function getRunScopedToRole(runId: string, userId: string, minRole: ProjectRole): Promise<RawAnalysisRunRow> {
  const row = await prismaClient.analysisRun.findUnique({ where: { id: runId } })
  if (!row) {
    throw new NotFoundError(`No analysis run found with id "${runId}".`)
  }
  await assertProjectRole(row.projectId, userId, minRole)
  return row
}

/** Fetches a single Analysis Run — any project member (Viewer+) may read (research.md Decision 3). */
export async function getAnalysisRunById(runId: string, userId: string): Promise<AnalysisRunRecord | null> {
  const row = await prismaClient.analysisRun.findUnique({ where: { id: runId } })
  if (!row) {
    return null
  }
  await assertProjectRole(row.projectId, userId, "Viewer")
  return toRecord(row)
}

export interface ListAnalysisRunsParams {
  cursor?: string
  limit?: number
  batchId?: string
  /** Status filter (contracts/api-contracts.md) — e.g. `["queued","running"]` for the History Panel's "show only running" view. Omitted = unchanged from 005's behavior (every status). */
  status?: string[]
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Cursor-paginated Analysis History for a project, newest first (data-model.md — history is this query, not a separate table). Any project member (Viewer+) may read. */
export async function listAnalysisRunsForProject(
  projectId: string,
  userId: string,
  params: ListAnalysisRunsParams,
): Promise<{ runs: AnalysisRunRecord[]; nextCursor: string | null }> {
  await assertProjectRole(projectId, userId, "Viewer")

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const rows = await prismaClient.analysisRun.findMany({
    where: {
      projectId,
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.status?.length ? { status: { in: params.status } } : {}),
      ...(params.cursor ? { createdAt: { lte: (await getCursorTimestamp(params.cursor)) ?? undefined } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1].id : null

  return { runs: pageRows.map(toRecord), nextCursor: nextCursor }
}

async function getCursorTimestamp(cursorId: string): Promise<Date | null> {
  const row = await prismaClient.analysisRun.findUnique({ where: { id: cursorId } })
  return row?.createdAt ?? null
}

/** Deletes an Analysis History entry only — never touches its `resultLayerId`'s layer (data-model.md, FR-026). Editor+ required, or the run's own creator. */
export async function deleteAnalysisRun(runId: string, userId: string): Promise<void> {
  const existing = await prismaClient.analysisRun.findUnique({ where: { id: runId } })
  if (!existing) {
    throw new NotFoundError(`No analysis run found with id "${runId}".`)
  }
  if (existing.userId !== userId) {
    await assertProjectRole(existing.projectId, userId, "Editor")
  } else {
    await assertProjectRole(existing.projectId, userId, "Viewer")
  }
  await prismaClient.analysisRun.delete({ where: { id: runId } })
}

function extractParameters(input: AnalysisRequestInput): unknown {
  return "parameters" in input ? (input.parameters ?? {}) : {}
}

/** Thrown internally to unwind out of a chunk loop the moment cancellation is detected — caught by `executeRun`, never propagates past it. */
class RunCancelledSignal extends Error {}

async function isCancellationRequested(runId: string): Promise<boolean> {
  const row = await prismaClient.analysisRun.findUnique({
    where: { id: runId },
    select: { cancelRequestedAt: true },
  })
  return row?.cancelRequestedAt != null
}

async function nextLayerOrder(projectId: string): Promise<number> {
  const max = await prismaClient.layer.aggregate({ where: { projectId }, _max: { order: true } })
  return (max._max.order ?? -1) + 1
}

async function createResultLayer(projectId: string, name: string): Promise<string> {
  const order = await nextLayerOrder(projectId)
  const layer = await prismaClient.layer.create({ data: { projectId, name, order } })
  return layer.id
}

/**
 * Runs `buildChunkSql` once per keyset-paginated page (T011) of
 * `sourceLayerId`'s features, updating `AnalysisRun.progress` after each
 * page and checking `cancelRequestedAt` before starting the next one
 * (research.md Decision 5). Every chunk's write is its own statement (not
 * nested inside one long-lived transaction), so progress is immediately
 * visible to a concurrent poller — the entire point of chunking.
 */
async function runChunkedFeatureMap(
  runId: string,
  sourceLayerId: string,
  pageSize: number,
  buildChunkSql: (chunkIds: string[]) => Prisma.Sql,
): Promise<void> {
  const total = await prismaClient.feature.count({ where: { layerId: sourceLayerId } })
  let afterId: string | null = null
  let processed = 0
  let hasMore = true

  while (hasMore) {
    if (await isCancellationRequested(runId)) {
      throw new RunCancelledSignal()
    }
    const page: { id: string }[] = await prismaClient.$queryRaw(ops.buildChunkPageSql(sourceLayerId, afterId, pageSize))
    if (page.length === 0) {
      break
    }
    const ids = page.map((row) => row.id)
    await prismaClient.$executeRaw(buildChunkSql(ids))
    processed += ids.length
    afterId = ids[ids.length - 1]
    const progress = total > 0 ? Math.min(99, Math.round((processed / total) * 100)) : 100
    await prismaClient.analysisRun.update({ where: { id: runId }, data: { progress } })
    hasMore = page.length === pageSize
  }
}

/** Same chunked-paging shape as `runChunkedFeatureMap`, but each chunk merges into one shared accumulator feature rather than inserting its own rows (buffer-with-dissolve, Union — see analysisOperations.ts's accumulator builders). */
async function runChunkedAccumulate(
  runId: string,
  sourceLayerId: string,
  pageSize: number,
  progressWeight: { processed: number; total: number },
  buildChunkSql: (chunkIds: string[]) => Prisma.Sql,
): Promise<void> {
  let afterId: string | null = null
  let hasMore = true

  while (hasMore) {
    if (await isCancellationRequested(runId)) {
      throw new RunCancelledSignal()
    }
    const page: { id: string }[] = await prismaClient.$queryRaw(ops.buildChunkPageSql(sourceLayerId, afterId, pageSize))
    if (page.length === 0) {
      break
    }
    const ids = page.map((row) => row.id)
    await prismaClient.$executeRaw(buildChunkSql(ids))
    progressWeight.processed += ids.length
    afterId = ids[ids.length - 1]
    const progress =
      progressWeight.total > 0 ? Math.min(99, Math.round((progressWeight.processed / progressWeight.total) * 100)) : 100
    await prismaClient.analysisRun.update({ where: { id: runId }, data: { progress } })
    hasMore = page.length === pageSize
  }
}

/**
 * Executes a single-statement operation (a pairwise overlay, dissolve,
 * statistic, etc. — see analysisOperations.ts's file doc for why these
 * cannot be chunked correctly) with `pg_cancel_backend` support for an
 * in-flight cancel: this connection's backend pid is recorded (on a
 * *different*, already-committed connection) before the statement runs, so
 * `cancelRun` can interrupt it mid-flight rather than only between chunks.
 */
async function runWholeStatement<T>(runId: string, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (await isCancellationRequested(runId)) {
    throw new RunCancelledSignal()
  }
  return prismaClient.$transaction(async (tx) => {
    const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
    await prismaClient.analysisRun.update({ where: { id: runId }, data: { backendPid: pid } })
    const result = await run(tx)
    return result
  })
}

interface ExecutionResult {
  resultLayerId?: string
  resultData?: unknown
}

/**
 * Dispatches one validated request to its PostGIS implementation
 * (`analysisOperations.ts`), executing every operationType from
 * data-model.md. `chunked: true` operations report incremental progress via
 * `runChunkedFeatureMap`/`runChunkedAccumulate`; everything else runs as
 * one `runWholeStatement` call (progress 0→100).
 */
async function executeOperation(run: RawAnalysisRunRow, input: AnalysisRequestInput): Promise<ExecutionResult> {
  const runId = run.id
  const projectId = run.projectId
  const chunkPageSize = (category: keyof typeof CHUNK_PAGE_SIZE): number => CHUNK_PAGE_SIZE[category]

  switch (input.operationType) {
    case "buffer": {
      const { distance, unit, dissolve } = input.parameters
      const meters = ops.toMeters(distance, unit)
      const [layerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `Buffer of ${layerId}`)
      if (dissolve) {
        const accumulatorId = randomUUID()
        await prismaClient.$executeRaw(ops.buildAccumulatorInitSql(accumulatorId, newLayerId))
        await runChunkedAccumulate(runId, layerId, chunkPageSize("buffer"), { processed: 0, total: 0 }, (ids) =>
          ops.buildBufferAccumulateChunkSql(accumulatorId, ids, meters),
        )
      } else {
        await runChunkedFeatureMap(runId, layerId, chunkPageSize("buffer"), (ids) =>
          ops.buildBufferChunkSql(newLayerId, ids, meters),
        )
      }
      return { resultLayerId: newLayerId }
    }

    case "simplify": {
      const [layerId] = input.inputLayerIds
      const { tolerance } = input.parameters
      const newLayerId = await createResultLayer(projectId, `Simplify of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("geometry"), (ids) =>
        ops.buildSimplifyChunkSql(newLayerId, ids, tolerance),
      )
      return { resultLayerId: newLayerId }
    }

    case "smoothGeometry": {
      const [layerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `Smooth of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("geometry"), (ids) =>
        ops.buildSmoothChunkSql(newLayerId, ids),
      )
      return { resultLayerId: newLayerId }
    }

    case "multipartToSinglepart":
    case "singlepartToMultipart": {
      const [layerId] = input.inputLayerIds
      const direction = input.operationType === "multipartToSinglepart" ? "toSinglepart" : "toMultipart"
      const newLayerId = await createResultLayer(projectId, `${input.operationType} of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("geometry"), (ids) =>
        ops.buildMultipartConversionChunkSql(newLayerId, ids, direction),
      )
      return { resultLayerId: newLayerId }
    }

    case "repairGeometry": {
      const [layerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `Repair Geometry of ${layerId}`)
      const unrepaired: string[] = []
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("geometry"), (ids) => ops.buildRepairGeometryChunkSql(newLayerId, ids))
      // A second pass over the same pages to collect unrepairable ids (FR-015's "clearly report" requirement) — cheap relative to the repair pass itself, and keeps buildRepairGeometryChunkSql's own contract simple (INSERT-only).
      let afterId: string | null = null
      let hasMore = true
      while (hasMore) {
        const page: { id: string }[] = await prismaClient.$queryRaw(ops.buildChunkPageSql(layerId, afterId, chunkPageSize("geometry")))
        if (page.length === 0) break
        const ids = page.map((r) => r.id)
        const bad: { id: string }[] = await prismaClient.$queryRaw(ops.buildUnrepairableFeatureIdsSql(ids))
        unrepaired.push(...bad.map((r) => r.id))
        afterId = ids[ids.length - 1]
        hasMore = page.length === chunkPageSize("geometry")
      }
      return { resultLayerId: newLayerId, resultData: unrepaired.length > 0 ? { unrepairedFeatureIds: unrepaired } : undefined }
    }

    case "clip": {
      const [layerId, boundaryLayerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `Clip of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("overlay"), (ids) =>
        ops.buildClipChunkSql(newLayerId, ids, boundaryLayerId),
      )
      return { resultLayerId: newLayerId }
    }

    case "erase": {
      const [layerId, eraseLayerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `Erase of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("overlay"), (ids) =>
        ops.buildEraseChunkSql(newLayerId, ids, eraseLayerId),
      )
      return { resultLayerId: newLayerId }
    }

    case "union": {
      const [layerAId, layerBId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, "Union")
      const [countA, countB] = await Promise.all([
        prismaClient.feature.count({ where: { layerId: layerAId } }),
        prismaClient.feature.count({ where: { layerId: layerBId } }),
      ])
      const accumulatorId = randomUUID()
      await prismaClient.$executeRaw(ops.buildAccumulatorInitSql(accumulatorId, newLayerId))
      const weight = { processed: 0, total: countA + countB }
      await runChunkedAccumulate(runId, layerAId, chunkPageSize("overlay"), weight, (ids) =>
        ops.buildLayerChunkUnionIntoAccumulatorSql(accumulatorId, ids),
      )
      await runChunkedAccumulate(runId, layerBId, chunkPageSize("overlay"), weight, (ids) =>
        ops.buildLayerChunkUnionIntoAccumulatorSql(accumulatorId, ids),
      )
      return { resultLayerId: newLayerId }
    }

    case "intersect": {
      const [layerAId, layerBId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, "Intersection")
      await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildIntersectSql(newLayerId, layerAId, layerBId)))
      return { resultLayerId: newLayerId }
    }

    case "difference": {
      const [layerAId, layerBId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, "Difference")
      await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildDifferenceSql(newLayerId, layerAId, layerBId)))
      return { resultLayerId: newLayerId }
    }

    case "symmetricalDifference": {
      const [layerAId, layerBId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, "Symmetrical Difference")
      await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildSymmetricalDifferenceSql(newLayerId, layerAId, layerBId)))
      return { resultLayerId: newLayerId }
    }

    case "identity": {
      const [layerAId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, "Identity")
      await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildIdentitySql(newLayerId, layerAId)))
      return { resultLayerId: newLayerId }
    }

    case "split": {
      const [targetLayerId, splitterLayerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `Split of ${targetLayerId}`)
      await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildSplitSql(newLayerId, targetLayerId, splitterLayerId)))
      return { resultLayerId: newLayerId }
    }

    case "merge": {
      const newLayerId = await createResultLayer(projectId, "Merge")
      await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildMergeSql(newLayerId, input.inputLayerIds)))
      return { resultLayerId: newLayerId }
    }

    case "dissolve": {
      const [layerId] = input.inputLayerIds
      const { attributeKey } = input.parameters
      const newLayerId = await createResultLayer(projectId, `Dissolve of ${layerId}`)
      await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildDissolveSql(newLayerId, layerId, attributeKey)))
      return { resultLayerId: newLayerId }
    }

    case "spatialJoin": {
      const [layerId, referenceLayerId] = input.inputLayerIds
      const { relationship } = input.parameters
      const newLayerId = await createResultLayer(projectId, `Spatial Join of ${layerId}`)
      if (relationship === "nearest") {
        // Every feature has *some* nearest neighbor, so "nearest" as a
        // join filter (vs. a threshold) is a pass-through — documented
        // simplification pending a distance-threshold parameter design.
        await runWholeStatement(runId, (tx) => tx.$executeRaw(ops.buildIdentitySql(newLayerId, layerId)))
      } else {
        await runChunkedFeatureMap(runId, layerId, chunkPageSize("query"), (ids) =>
          ops.buildSpatialPredicateChunkSql(newLayerId, ids, referenceLayerId, relationship),
        )
      }
      return { resultLayerId: newLayerId }
    }

    case "pointInPolygon": {
      const [pointsLayerId, polygonsLayerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `Point in Polygon of ${pointsLayerId}`)
      await runChunkedFeatureMap(runId, pointsLayerId, chunkPageSize("query"), (ids) =>
        ops.buildSpatialPredicateChunkSql(newLayerId, ids, polygonsLayerId, "within"),
      )
      return { resultLayerId: newLayerId }
    }

    case "touches":
    case "crosses":
    case "overlaps": {
      const [layerId, referenceLayerId] = input.inputLayerIds
      const newLayerId = await createResultLayer(projectId, `${input.operationType} of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("query"), (ids) =>
        ops.buildSpatialPredicateChunkSql(newLayerId, ids, referenceLayerId, input.operationType as ops.SpatialRelationship),
      )
      return { resultLayerId: newLayerId }
    }

    case "selectByLocation": {
      const [layerId, referenceLayerId] = input.inputLayerIds
      const { relationship } = input.parameters
      const newLayerId = await createResultLayer(projectId, `Select by Location of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("query"), (ids) =>
        ops.buildSpatialPredicateChunkSql(newLayerId, ids, referenceLayerId, relationship),
      )
      return { resultLayerId: newLayerId }
    }

    case "selectByAttribute": {
      const [layerId] = input.inputLayerIds
      const filter = input.parameters
      const newLayerId = await createResultLayer(projectId, `Select by Attribute of ${layerId}`)
      await runChunkedFeatureMap(runId, layerId, chunkPageSize("query"), (ids) =>
        ops.buildSelectByAttributeChunkSql(newLayerId, ids, filter),
      )
      return { resultLayerId: newLayerId }
    }

    case "nearAnalysis": {
      const [sourceLayerId, referenceLayerId] = input.inputLayerIds
      const parameters = input.parameters as { maxDistance?: number; unit?: ops.ShortDistanceUnit } | undefined
      const maxDistanceMeters =
        parameters?.maxDistance != null && parameters.unit != null ? ops.toMeters(parameters.maxDistance, parameters.unit) : null
      const rows = await runWholeStatement(runId, (tx) =>
        tx.$queryRaw<{ result: unknown }[]>(ops.buildNearAnalysisSql(sourceLayerId, referenceLayerId, maxDistanceMeters)),
      )
      return { resultData: rows[0]?.result ?? [] }
    }

    case "distanceMatrix": {
      const [layerAId, layerBId] = input.inputLayerIds
      const rows = await runWholeStatement(runId, (tx) =>
        tx.$queryRaw<{ result: unknown }[]>(ops.buildDistanceMatrixSql(layerAId, layerBId)),
      )
      return { resultData: rows[0]?.result ?? [] }
    }

    case "featureCount":
    case "totalLength":
    case "averageLength":
    case "averageArea":
    case "extent":
    case "areaCalculation":
    case "lengthCalculation":
    case "centroid":
    case "convexHull":
    case "boundingBox":
    case "densityAnalysis": {
      const [layerId] = input.inputLayerIds
      const rows = await runWholeStatement(runId, (tx) =>
        tx.$queryRaw<{ result: unknown }[]>(ops.buildStatisticsSql(layerId, input.operationType as ops.StatisticType)),
      )
      return { resultData: rows[0]?.result ?? {} }
    }

    case "coordinateConversion": {
      const { coordinates, sourceCrs } = input.parameters
      const rows = await runWholeStatement(runId, (tx) =>
        tx.$queryRaw<{ result: unknown }[]>(ops.buildCoordinateConversionSql(coordinates as [number, number][], sourceCrs)),
      )
      return { resultData: rows[0]?.result ?? [] }
    }

    case "crsTransformation": {
      const [layerId] = input.inputLayerIds
      const { targetCrs } = input.parameters
      const rows = await runWholeStatement(runId, (tx) =>
        tx.$queryRaw<{ result: unknown }[]>(ops.buildCrsTransformationPreviewSql(layerId, targetCrs)),
      )
      return { resultData: rows[0]?.result ?? [] }
    }

    default: {
      const exhaustiveCheck: never = input
      throw new ValidationError(`Operation "${(exhaustiveCheck as { operationType: string }).operationType}" is not yet supported.`)
    }
  }
}

/**
 * Runs `runId`'s operation end to end: `queued`→`running`→terminal. Any
 * thrown error is caught here and written as `status: "failed"` — this
 * function must never reject uncaught, since the background path calls it
 * fire-and-forget (contracts/repository-api.md).
 */
async function executeRun(runId: string, input: AnalysisRequestInput): Promise<void> {
  const run = await prismaClient.analysisRun.findUnique({ where: { id: runId } })
  if (!run) {
    return
  }

  const startedAt = new Date()
  await prismaClient.analysisRun.update({
    where: { id: runId },
    data: { status: "running", startedAt, progress: 0 },
  })

  try {
    const result = await executeOperation(run, input)
    const completedAt = new Date()
    await prismaClient.analysisRun.update({
      where: { id: runId },
      data: {
        status: "succeeded",
        progress: 100,
        resultLayerId: result.resultLayerId ?? null,
        resultData: (result.resultData as Prisma.InputJsonValue) ?? undefined,
        completedAt,
        executionTimeMs: completedAt.getTime() - startedAt.getTime(),
        backendPid: null,
      },
    })
  } catch (error) {
    const completedAt = new Date()
    if (error instanceof RunCancelledSignal) {
      await prismaClient.analysisRun.update({
        where: { id: runId },
        data: { status: "cancelled", completedAt, executionTimeMs: completedAt.getTime() - startedAt.getTime(), backendPid: null },
      })
      return
    }
    const message = error instanceof ValidationError ? error.message : "The analysis operation failed to complete."
    await prismaClient.analysisRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        errorMessage: message,
        completedAt,
        executionTimeMs: completedAt.getTime() - startedAt.getTime(),
        backendPid: null,
      },
    })
  }
}

async function assertUnderConcurrentJobCap(userId: string): Promise<void> {
  const count = await prismaClient.analysisRun.count({
    where: { userId, status: { in: ["queued", "running"] } },
  })
  if (count >= MAX_CONCURRENT_JOBS_PER_USER) {
    throw new RateLimitedError(
      `You already have ${count} analyses running or queued — wait for one to finish before starting another.`,
    )
  }
}

/**
 * Creates and executes an Analysis Run. Every `inputLayerIds` entry is
 * validated against project membership before any PostGIS call runs
 * (FR-030). Small inputs (below `BACKGROUND_EXECUTION_THRESHOLD`) resolve
 * synchronously within this call, preserving 005's original fast-path
 * behavior; larger inputs return immediately with `status: "queued"` and
 * continue via a fire-and-forget `executeRun` call (research.md Decision 5).
 */
export async function createAnalysisRun(
  projectId: string,
  userId: string,
  input: AnalysisRequestInput,
  batchId?: string,
): Promise<AnalysisRunRecord> {
  await assertProjectRole(projectId, userId, "Editor")
  await assertUnderConcurrentJobCap(userId)

  for (const layerId of input.inputLayerIds) {
    const layer = await prismaClient.layer.findFirst({ where: { id: layerId, projectId } })
    if (!layer) {
      throw new NotFoundError(`No layer found with id "${layerId}" in this project.`)
    }
  }

  const featureCounts = await Promise.all(
    input.inputLayerIds.map((layerId) => prismaClient.feature.count({ where: { layerId } })),
  )
  const largestInput = featureCounts.length > 0 ? Math.max(...featureCounts) : 0

  const runId = randomUUID()
  const row = await prismaClient.analysisRun.create({
    data: {
      id: runId,
      projectId,
      userId,
      operationType: input.operationType,
      status: "queued",
      parameters: extractParameters(input) as Prisma.InputJsonValue,
      inputLayerIds: input.inputLayerIds,
      batchId: batchId ?? null,
    },
  })

  if (largestInput >= BACKGROUND_EXECUTION_THRESHOLD) {
    void executeRun(runId, input)
    return toRecord(row)
  }

  await executeRun(runId, input)
  const finished = await prismaClient.analysisRun.findUniqueOrThrow({ where: { id: runId } })
  return toRecord(finished)
}

const MAX_BATCH_ITEMS = 20

/**
 * Submits a Batch Run: one operation/parameter set applied independently
 * across each item's inputs, sharing one generated `batchId` (data-model.md
 * Decision 2). Each item's own failure is caught individually — one
 * invalid item never aborts the others (FR-023).
 */
export async function createBatchRun(
  projectId: string,
  userId: string,
  operationType: OperationType,
  parameters: unknown,
  items: { inputLayerIds: string[] }[],
): Promise<{ batchId: string; runs: AnalysisRunRecord[] }> {
  if (items.length === 0 || items.length > MAX_BATCH_ITEMS) {
    throw new ValidationError(`items must contain between 1 and ${MAX_BATCH_ITEMS} entries.`)
  }

  // Membership/role is checked once upfront (every item shares the same
  // project) so a permission failure surfaces as a real thrown error, not a
  // silently-recorded "failed" row per item.
  await assertProjectRole(projectId, userId, "Editor")

  const batchId = randomUUID()
  const runs: AnalysisRunRecord[] = []

  for (const item of items) {
    const input = { operationType, parameters, inputLayerIds: item.inputLayerIds } as AnalysisRequestInput
    try {
      const run = await createAnalysisRun(projectId, userId, input, batchId)
      runs.push(run)
    } catch (error) {
      // One item's failure (e.g. a bad inputLayerIds entry) must never abort
      // the rest of the batch (FR-023) — recorded as its own "failed" row so
      // it still appears in history, same as any other failed run.
      const message = error instanceof Error ? error.message : "This batch item failed to run."
      const failedRow = await prismaClient.analysisRun.create({
        data: {
          id: randomUUID(),
          projectId,
          userId,
          operationType,
          status: "failed",
          parameters: (parameters ?? {}) as Prisma.InputJsonValue,
          inputLayerIds: item.inputLayerIds,
          errorMessage: message,
          batchId,
        },
      })
      runs.push(toRecord(failedRow))
    }
  }

  return { batchId, runs }
}

/**
 * Re-runs a past analysis with its original inputs and parameters (FR-025).
 * Rejects with a message naming the missing input if the original run, or
 * any of its original input layers, no longer resolves (spec.md Edge Cases).
 */
export async function rerunAnalysis(runId: string, userId: string): Promise<AnalysisRunRecord> {
  const original = await getRunScopedToRole(runId, userId, "Editor")

  const inputLayerIds = original.inputLayerIds as string[]
  for (const layerId of inputLayerIds) {
    const layer = await prismaClient.layer.findFirst({ where: { id: layerId, projectId: original.projectId } })
    if (!layer) {
      throw new NotFoundError(`Cannot re-run: input layer "${layerId}" no longer exists in this project.`)
    }
  }

  const input = {
    operationType: original.operationType,
    parameters: original.parameters,
    inputLayerIds,
  } as AnalysisRequestInput

  return createAnalysisRun(original.projectId, userId, input)
}

/**
 * Requests cancellation of a queued or running run (FR-028). A no-op
 * (returns current state unchanged) if the run already reached a terminal
 * status — cancelling an already-finished run is not an error
 * (contracts/api-contracts.md). If a chunk is currently executing under
 * `pg_cancel_backend` tracking (`runWholeStatement`), interrupts it
 * immediately rather than waiting for the next between-chunk check.
 */
export async function cancelRun(runId: string, userId: string): Promise<AnalysisRunRecord> {
  const run = await getRunScopedToRole(runId, userId, "Editor")

  if (["succeeded", "failed", "cancelled"].includes(run.status)) {
    return toRecord(run)
  }

  const updated = await prismaClient.analysisRun.update({
    where: { id: runId },
    data: { cancelRequestedAt: new Date() },
  })

  if (updated.backendPid != null) {
    await cancelBackendPid(updated.backendPid)
  }

  return toRecord(updated)
}

/**
 * Undoes a specific analysis result (FR-031) — deletes the run's
 * `resultLayerId` layer (cascading its features) if one exists, and clears
 * `resultLayerId` on the run. The run row itself is retained, so the audit
 * trail of "this analysis ran" survives even though its output was
 * discarded (contracts/api-contracts.md).
 */
export async function discardResult(runId: string, userId: string): Promise<AnalysisRunRecord> {
  const run = await getRunScopedToRole(runId, userId, "Editor")

  if (!run.resultLayerId) {
    throw new ValidationError("This analysis run has no result to discard.")
  }

  const updated = await prismaClient.$transaction(async (tx) => {
    await tx.layer.delete({ where: { id: run.resultLayerId! } })
    return tx.analysisRun.update({ where: { id: runId }, data: { resultLayerId: null } })
  })

  return toRecord(updated)
}
