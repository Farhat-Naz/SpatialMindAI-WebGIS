import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { acquireOrRefreshLock, releaseLock } from "@/server/repositories/featureLockRepository"
import { getProjectIdForFeature } from "@/server/repositories/featureRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ featureId: string }>
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

/** `POST /api/features/:featureId/lock` — Editor or above; `409` when held by a different, unexpired user (US3). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { featureId } = await params
    const projectId = await getProjectIdForFeature(featureId)
    await assertProjectRole(projectId, user.id, "Editor")

    const lock = await acquireOrRefreshLock(featureId, user.id)
    return respond(request, startedAt, 200, { lock })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/features/:featureId/lock` — releases the caller's own lock (FR-020). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { featureId } = await params
    const projectId = await getProjectIdForFeature(featureId)
    await assertProjectRole(projectId, user.id, "Editor")

    await releaseLock(featureId, user.id)

    logger.request({
      method: request.method,
      path: new URL(request.url).pathname,
      status: 204,
      durationMs: Date.now() - startedAt,
    })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleRouteError(error)
  }
}
