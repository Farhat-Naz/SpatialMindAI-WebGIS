import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { listExportsForProject, logExport } from "@/server/repositories/exportLogRepository"
import { logExportRequestSchema } from "@/shared/contracts/exportLogRequest.schema"
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

/** `GET /api/projects/:projectId/exports` — cursor-paginated export history, newest first. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor") ?? undefined
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : undefined

    if (limitParam && (Number.isNaN(limit) || (limit ?? 0) <= 0)) {
      const { status, body } = toErrorResponse("INVALID_INPUT", "limit must be a positive number.")
      return respond(request, startedAt, status, body)
    }

    const { exports: history, nextCursor } = await listExportsForProject(projectId, user.id, { cursor, limit })
    return respond(request, startedAt, 200, { exports: history, nextCursor })
  } catch (error) {
    return handleRouteError(error)
  }
}

/**
 * `POST /api/projects/:projectId/exports` — logs a completed client-side
 * export (US9, research.md Decision 10) — called *after* the client has
 * already produced and downloaded the file; this endpoint never executes
 * or drives the export itself.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { projectId } = await params

    const parsed = logExportRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const exportJob = await logExport(projectId, user.id, parsed.data)
    return respond(request, startedAt, 201, { exportJob })
  } catch (error) {
    return handleRouteError(error)
  }
}
