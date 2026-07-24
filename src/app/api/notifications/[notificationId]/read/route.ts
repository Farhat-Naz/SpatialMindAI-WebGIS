import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { markNotificationRead } from "@/server/repositories/notificationRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ notificationId: string }>
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

/** `PATCH /api/notifications/:notificationId/read` — marking another user's notification → 404 (non-disclosing). */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { notificationId } = await params

    const notification = await markNotificationRead(notificationId, user.id)
    return respond(request, startedAt, 200, { notification })
  } catch (error) {
    return handleRouteError(error)
  }
}
