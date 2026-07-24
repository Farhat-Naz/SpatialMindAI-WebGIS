import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { listActivityForProject } from "@/server/repositories/activityRepository"
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

/** `GET /api/projects/:projectId/activity` — cursor-paginated, read-only (FR-047, no write method exists). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor") ?? undefined
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : undefined

    const { activities, nextCursor } = await listActivityForProject(projectId, { cursor, limit })
    return respond(request, startedAt, 200, { activities, nextCursor })
  } catch (error) {
    return handleRouteError(error)
  }
}
