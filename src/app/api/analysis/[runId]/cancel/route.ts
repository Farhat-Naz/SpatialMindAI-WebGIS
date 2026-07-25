import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { cancelRun } from "@/server/repositories/analysisRepository"
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

/**
 * `POST /api/analysis/:runId/cancel` — requests cancellation of a queued or
 * running run (FR-028). A no-op success (not an error) if the run had
 * already reached a terminal state before the request arrived
 * (contracts/api-contracts.md).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { runId } = await params

    const run = await cancelRun(runId, user.id)
    return respond(request, startedAt, 200, { run })
  } catch (error) {
    return handleRouteError(error)
  }
}
