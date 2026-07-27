import type { ExportJob } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { ValidationError } from "@/shared/errors/apiError"

/**
 * specs/005-import-export (T046) — `"pdf"` added additively (FR-034). Print
 * output is produced entirely in the browser like every other format; this
 * repository still only records a finished attempt (007 research Decision 10).
 */
export type ExportFormat = "geojson" | "shapefile" | "csv" | "kml" | "pdf"

/** specs/005-import-export (T046) — what an export covered (FR-035). */
export type ExportScope = "selection" | "layer" | "project"

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
  // specs/005-import-export (T046) — additive.
  scope: ExportScope
  outputCrs: string | null
  layerCount: number | null
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
    scope: (row.scope as ExportScope) ?? "layer",
    outputCrs: row.outputCrs,
    layerCount: row.layerCount,
  }
}

export interface LogExportInput {
  sourceAnalysisRunId?: string | null
  sourceLayerId?: string | null
  format: ExportFormat
  status: ExportOutcome
  featureCount?: number | null
  errorMessage?: string | null
  // specs/005-import-export (T046) — all optional, so every existing 007
  // caller compiles and behaves identically. `scope` defaults to "layer",
  // which is what every pre-existing row actually was.
  scope?: ExportScope | null
  outputCrs?: string | null
  layerCount?: number | null
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

  // specs/005-import-export (T046) — a project-scope export covers every layer,
  // so naming a single source would misdescribe it.
  const scope = input.scope ?? "layer"
  if (scope === "project" && (input.sourceAnalysisRunId || input.sourceLayerId)) {
    throw new ValidationError("A project-scope export may not reference a source analysis run or layer.")
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
      scope,
      outputCrs: input.outputCrs ?? null,
      layerCount: input.layerCount ?? null,
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
