import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { compareVersions, getVersionById } from "@/server/repositories/versionRepository"
import { NotFoundError, toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

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
 * `GET /api/versions/compare?a=&b=` — both versions must belong to the same
 * project the caller can access, or `404` (never discloses cross-project
 * version existence).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const url = new URL(request.url)
    const versionAId = url.searchParams.get("a")
    const versionBId = url.searchParams.get("b")

    if (!versionAId || !versionBId) {
      const { status, body } = toErrorResponse("INVALID_INPUT", "Both 'a' and 'b' query parameters are required.")
      return respond(request, startedAt, status, body)
    }

    const versionA = await getVersionById(versionAId)
    await assertProjectRole(versionA.projectId, user.id, "Viewer")

    const versionB = await getVersionById(versionBId)
    if (versionB.projectId !== versionA.projectId) {
      throw new NotFoundError(`No version found with id "${versionBId}" in this project.`)
    }

    const diff = await compareVersions(versionAId, versionBId)
    return respond(request, startedAt, 200, { diff })
  } catch (error) {
    return handleRouteError(error)
  }
}
