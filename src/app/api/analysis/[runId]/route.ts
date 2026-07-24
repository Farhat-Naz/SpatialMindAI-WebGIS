import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { deleteAnalysisRun, getAnalysisRunById } from "@/server/repositories/analysisRepository"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ runId: string }>
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

/** `GET /api/analysis/:runId` — fetch one Analysis Run's current detail/status. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { runId } = await params

    const run = await getAnalysisRunById(runId, user.id)
    if (!run) {
      const { status, body } = toErrorResponse("NOT_FOUND", `No analysis run found with id "${runId}".`)
      return respond(request, startedAt, status, body)
    }
    return respond(request, startedAt, 200, { run })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/analysis/:runId` — deletes an Analysis History entry; never affects its result layer (FR-026). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { runId } = await params

    await deleteAnalysisRun(runId, user.id)
    return respond(request, startedAt, 204, null)
  } catch (error) {
    return handleRouteError(error)
  }
}
