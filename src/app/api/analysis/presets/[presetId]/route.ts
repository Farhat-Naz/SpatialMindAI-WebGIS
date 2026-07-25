import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { deletePreset } from "@/server/repositories/analysisPresetRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ presetId: string }>
}

function respond(request: NextRequest, startedAt: number, status: number, body: unknown): NextResponse {
  logger.request({
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    durationMs: Date.now() - startedAt,
  })
  // A 204 response MUST NOT have a body (Fetch/Response spec) — NextResponse.json
  // would otherwise still serialize `null` as a "null" body and throw.
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(body, { status })
}

/** `DELETE /api/analysis/presets/:presetId` — creator or project Owner only (US8/FR-021). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { presetId } = await params

    await deletePreset(presetId, user.id)
    return respond(request, startedAt, 204, null)
  } catch (error) {
    return handleRouteError(error)
  }
}
