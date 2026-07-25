import type { ExportJob } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { ValidationError } from "@/shared/errors/apiError"

export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml"
export type ExportOutcome = "succeeded" | "failed"

export interface ExportJobRecord {
  id: string
  projectId: string
  userId: string
  sourceAnalysisRunId: string | null
  sourceLayerId: string | null
  format: ExportFormat
  status: ExportOutcome
  featureCount: number | null
  errorMessage: string | null
  createdAt: Date
}

function toRecord(row: ExportJob): ExportJobRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    sourceAnalysisRunId: row.sourceAnalysisRunId,
    sourceLayerId: row.sourceLayerId,
    format: row.format as ExportFormat,
    status: row.status as ExportOutcome,
    featureCount: row.featureCount,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  }
}

export interface LogExportInput {
  sourceAnalysisRunId?: string | null
  sourceLayerId?: string | null
  format: ExportFormat
  status: ExportOutcome
  featureCount?: number | null
  errorMessage?: string | null
}

/**
 * Logs a completed client-side export (US9, research.md Decision 10,
 * revised) — a pure insert; the client already did all the work, so there
 * is no execution/status-transition logic here. `status` is always written
 * already-terminal.
 */
export async function logExport(projectId: string, userId: string, input: LogExportInput): Promise<ExportJobRecord> {
  await assertProjectRole(projectId, userId, "Editor")

  if (input.sourceAnalysisRunId && input.sourceLayerId) {
    throw new ValidationError("An export may reference at most one of sourceAnalysisRunId or sourceLayerId, not both.")
  }

  const row = await prismaClient.exportJob.create({
    data: {
      projectId,
      userId,
      sourceAnalysisRunId: input.sourceAnalysisRunId ?? null,
      sourceLayerId: input.sourceLayerId ?? null,
      format: input.format,
      status: input.status,
      featureCount: input.featureCount ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  })
  return toRecord(row)
}

export interface ListExportsParams {
  cursor?: string
  limit?: number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Cursor-paginated export history for a project, newest first — same shape as the analysis/measurement history listings. Any project member (Viewer+) may read. */
export async function listExportsForProject(
  projectId: string,
  userId: string,
  params: ListExportsParams,
): Promise<{ exports: ExportJobRecord[]; nextCursor: string | null }> {
  await assertProjectRole(projectId, userId, "Viewer")

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const rows = await prismaClient.exportJob.findMany({
    where: {
      projectId,
      ...(params.cursor ? { createdAt: { lte: (await getCursorTimestamp(params.cursor)) ?? undefined } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1].id : null

  return { exports: pageRows.map(toRecord), nextCursor }
}

async function getCursorTimestamp(cursorId: string): Promise<Date | null> {
  const row = await prismaClient.exportJob.findUnique({ where: { id: cursorId } })
  return row?.createdAt ?? null
}
