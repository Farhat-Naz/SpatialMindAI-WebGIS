import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { getVersionById, restoreVersion } from "@/server/repositories/versionRepository"
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

/** `POST /api/versions/:versionId/restore` — Editor or above (FR-028/FR-029). Returns the new pre-restore version. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { versionId } = await params

    const target = await getVersionById(versionId)
    await assertProjectRole(target.projectId, user.id, "Editor")

    const restoredTo = await restoreVersion(target.projectId, versionId, user.id)
    return respond(request, startedAt, 201, { version: restoredTo })
  } catch (error) {
    return handleRouteError(error)
  }
}
