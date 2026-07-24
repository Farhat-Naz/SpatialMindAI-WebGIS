import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { getVersionById } from "@/server/repositories/versionRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ versionId: string }>
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

/** `GET /api/versions/:versionId` — full detail including `snapshot`; non-member → 404. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { versionId } = await params

    const version = await getVersionById(versionId)
    await assertProjectRole(version.projectId, user.id, "Viewer")

    return respond(request, startedAt, 200, { version })
  } catch (error) {
    return handleRouteError(error)
  }
}
