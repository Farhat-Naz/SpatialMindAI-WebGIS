import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { listActivePresenceForProject } from "@/server/repositories/presenceRepository"
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

/**
 * `GET /api/projects/:projectId/presence` — initial snapshot, used once on
 * page load before the SSE connection takes over. Only active (non-stale)
 * rows are returned.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    const presence = await listActivePresenceForProject(projectId)
    return respond(request, startedAt, 200, { presence })
  } catch (error) {
    return handleRouteError(error)
  }
}
