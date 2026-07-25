import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { getProjectById } from "@/server/repositories/projectRepository"
import { NotFoundError, ValidationError } from "@/shared/errors/apiError"
import type { AnalysisRequestInput, OperationType } from "@/shared/contracts/analysis.schema"

export interface AnalysisRunRecord {
  id: string
  projectId: string
  operationType: string
  status: "succeeded" | "failed"
  parameters: unknown
  inputLayerIds: string[]
  resultLayerId: string | null
  resultData: unknown
  errorMessage: string | null
  batchId: string | null
  createdAt: Date
  updatedAt: Date
}

interface RawAnalysisRunRow {
  id: string
  projectId: string
  operationType: string
  status: string
  parameters: unknown
  inputLayerIds: unknown
  resultLayerId: string | null
  resultData: unknown
  errorMessage: string | null
  batchId: string | null
  createdAt: Date
  updatedAt: Date
}

function toRecord(row: RawAnalysisRunRow): AnalysisRunRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    operationType: row.operationType,
    status: row.status as "succeeded" | "failed",
    parameters: row.parameters,
    inputLayerIds: row.inputLayerIds as string[],
    resultLayerId: row.resultLayerId,
    resultData: row.resultData,
    errorMessage: row.errorMessage,
    batchId: row.batchId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Returns an AnalysisRun row only if it belongs to a project owned by `ownerId`. */
async function getRunScopedToOwner(runId: string, ownerId: string): Promise<RawAnalysisRunRow | null> {
  return prismaClient.analysisRun.findFirst({
    where: { id: runId, project: { ownerId } },
  })
}

/** Fetches a single Analysis Run, scoped to its owning project (ownership non-disclosure — see apiError.ts's NotFoundError doc). */
export async function getAnalysisRunById(runId: string, ownerId: string): Promise<AnalysisRunRecord | null> {
  const row = await getRunScopedToOwner(runId, ownerId)
  return row ? toRecord(row) : null
}

export interface ListAnalysisRunsParams {
  cursor?: string
  limit?: number
  batchId?: string
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Cursor-paginated Analysis History for a project, newest first (data-model.md — history is this query, not a separate table). */
export async function listAnalysisRunsForProject(
  projectId: string,
  ownerId: string,
  params: ListAnalysisRunsParams,
): Promise<{ runs: AnalysisRunRecord[]; nextCursor: string | null }> {
  const project = await getProjectById(projectId, ownerId)
  if (!project) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const rows = await prismaClient.analysisRun.findMany({
    where: {
      projectId,
      ...(params.batchId ? { batchId: params.batchId } : {}),
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

/** Deletes an Analysis History entry only — never touches its `resultLayerId`'s layer (data-model.md, FR-026). */
export async function deleteAnalysisRun(runId: string, ownerId: string): Promise<void> {
  const existing = await getRunScopedToOwner(runId, ownerId)
  if (!existing) {
    throw new NotFoundError(`No analysis run found with id "${runId}".`)
  }
  await prismaClient.analysisRun.delete({ where: { id: runId } })
}

/**
 * Dispatches one validated request to its PostGIS implementation
 * (`analysisOperations.ts`). Each user story phase adds its own `case`
 * here as its operations land; the `default` case only remains reachable
 * for a genuinely not-yet-implemented operation type during phased
 * rollout — every one of the 22 types has a case by feature-complete.
 */
async function executeOperation(
  _tx: Prisma.TransactionClient,
  input: AnalysisRequestInput,
): Promise<{ resultLayerId?: string; resultData?: unknown }> {
  switch (input.operationType) {
    default:
      throw new ValidationError(`Operation "${input.operationType satisfies OperationType}" is not yet supported.`)
  }
}

function extractParameters(input: AnalysisRequestInput): unknown {
  return "parameters" in input ? (input.parameters ?? {}) : {}
}

/**
 * Creates and executes a single Analysis Run. Every `inputLayerIds` entry
 * is validated against project ownership before any PostGIS call runs
 * (FR-030); the operation itself and its resulting `AnalysisRun` row are
 * written atomically (`succeeded` path). A `ValidationError` thrown mid-
 * operation rolls back that transaction entirely, and a separate `failed`
 * row is written afterward outside it — a run always appears in history,
 * even one whose analysis failed (data-model.md Lifecycle), while a SQL
 * failure can never leave a half-committed transaction behind.
 */
export async function createAnalysisRun(
  projectId: string,
  ownerId: string,
  input: AnalysisRequestInput,
  batchId?: string,
): Promise<AnalysisRunRecord> {
  const project = await getProjectById(projectId, ownerId)
  if (!project) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }

  for (const layerId of input.inputLayerIds) {
    const layer = await prismaClient.layer.findFirst({ where: { id: layerId, projectId } })
    if (!layer) {
      throw new NotFoundError(`No layer found with id "${layerId}" in this project.`)
    }
  }

  const parameters = extractParameters(input)

  try {
    const row = await prismaClient.$transaction(async (tx) => {
      const result = await executeOperation(tx, input)
      return tx.analysisRun.create({
        data: {
          id: randomUUID(),
          projectId,
          // specs/007-spatial-analysis: `userId` (the resolved caller) is
          // `ownerId` for now — this function's full rework (background
          // execution, membership-based `userId` distinct from project
          // ownership) lands in Phase 3.
          userId: ownerId,
          operationType: input.operationType,
          status: "succeeded",
          parameters: parameters as Prisma.InputJsonValue,
          inputLayerIds: input.inputLayerIds,
          resultLayerId: result.resultLayerId ?? null,
          resultData: (result.resultData as Prisma.InputJsonValue) ?? undefined,
          batchId: batchId ?? null,
        },
      })
    })
    return toRecord(row)
  } catch (error) {
    if (error instanceof ValidationError) {
      const row = await prismaClient.analysisRun.create({
        data: {
          id: randomUUID(),
          projectId,
          userId: ownerId,
          operationType: input.operationType,
          status: "failed",
          parameters: parameters as Prisma.InputJsonValue,
          inputLayerIds: input.inputLayerIds,
          errorMessage: error.message,
          batchId: batchId ?? null,
        },
      })
      return toRecord(row)
    }
    throw error
  }
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
  ownerId: string,
  operationType: OperationType,
  parameters: unknown,
  items: { inputLayerIds: string[] }[],
): Promise<{ batchId: string; runs: AnalysisRunRecord[] }> {
  if (items.length === 0 || items.length > MAX_BATCH_ITEMS) {
    throw new ValidationError(`items must contain between 1 and ${MAX_BATCH_ITEMS} entries.`)
  }

  const batchId = randomUUID()
  const runs: AnalysisRunRecord[] = []

  for (const item of items) {
    const input = { operationType, parameters, inputLayerIds: item.inputLayerIds } as AnalysisRequestInput
    const run = await createAnalysisRun(projectId, ownerId, input, batchId)
    runs.push(run)
  }

  return { batchId, runs }
}

/**
 * Re-runs a past analysis with its original inputs and parameters (FR-025).
 * Rejects with a message naming the missing input if the original run, or
 * any of its original input layers, no longer resolves (spec.md Edge Cases).
 */
export async function rerunAnalysis(runId: string, ownerId: string): Promise<AnalysisRunRecord> {
  const original = await getRunScopedToOwner(runId, ownerId)
  if (!original) {
    throw new NotFoundError(`No analysis run found with id "${runId}".`)
  }

  const inputLayerIds = original.inputLayerIds as string[]
  for (const layerId of inputLayerIds) {
    const layer = await prismaClient.layer.findFirst({ where: { id: layerId, projectId: original.projectId } })
    if (!layer) {
      throw new NotFoundError(
        `Cannot re-run: input layer "${layerId}" no longer exists in this project.`,
      )
    }
  }

  const input = {
    operationType: original.operationType,
    parameters: original.parameters,
    inputLayerIds,
  } as AnalysisRequestInput

  return createAnalysisRun(original.projectId, ownerId, input)
}
