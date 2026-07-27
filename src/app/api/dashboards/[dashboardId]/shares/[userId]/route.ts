import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { revokeShare } from "@/server/repositories/dashboardShareRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ dashboardId: string; userId: string }>
}

/** `DELETE /api/dashboards/:dashboardId/shares/:userId` — revokes a share (FR-027). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId, userId } = await params
    await revokeShare(dashboardId, user.id, userId)
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
