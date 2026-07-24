import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import {
  createAnalysisRun,
  listAnalysisRunsForProject,
  type ListAnalysisRunsParams,
} from "@/server/repositories/analysisRepository"
import { analysisRequestSchema } from "@/shared/contracts/analysis.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ projectId: string }>
}

function respond(request: NextRequest, startedAt: number, status: number, body: unknown): NextResponse {
  logger.request({
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    durationMs: Date.now() - startedAt,
  })
  return NextResponse.json(body, { status })
}

/** `GET /api/projects/:projectId/analysis` — cursor-paginated Analysis History, newest first. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor") ?? undefined
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : undefined
    const batchId = url.searchParams.get("batchId") ?? undefined

    if (limitParam && (Number.isNaN(limit) || (limit ?? 0) <= 0)) {
      const { status, body } = toErrorResponse("INVALID_INPUT", "limit must be a positive number.")
      return respond(request, startedAt, status, body)
    }

    const listParams: ListAnalysisRunsParams = { cursor, limit, batchId }
    const { runs, nextCursor } = await listAnalysisRunsForProject(projectId, user.id, listParams)
    return respond(request, startedAt, 200, { runs, nextCursor })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/projects/:projectId/analysis` — submit a single Analysis Run. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { projectId } = await params

    const parsed = analysisRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const run = await createAnalysisRun(projectId, user.id, parsed.data)
    return respond(request, startedAt, 201, { run })
  } catch (error) {
    return handleRouteError(error)
  }
}
