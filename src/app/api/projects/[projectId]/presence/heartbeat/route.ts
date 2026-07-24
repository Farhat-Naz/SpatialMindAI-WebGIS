import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { upsertPresence } from "@/server/repositories/presenceRepository"
import { presenceHeartbeatSchema } from "@/shared/contracts/presence.schema"
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

/** `POST /api/projects/:projectId/presence/heartbeat` — any member (Viewer or above) has presence (US9). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    const parsed = presenceHeartbeatSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const presence = await upsertPresence(projectId, user.id, parsed.data)
    return respond(request, startedAt, 200, { presence })
  } catch (error) {
    return handleRouteError(error)
  }
}
