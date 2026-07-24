import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { rerunAnalysis } from "@/server/repositories/analysisRepository"
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

/** `POST /api/analysis/:runId/rerun` — re-runs a past analysis with its original inputs and parameters (FR-025). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { runId } = await params

    const run = await rerunAnalysis(runId, user.id)
    return respond(request, startedAt, 201, { run })
  } catch (error) {
    return handleRouteError(error)
  }
}
