import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { listNotificationsForUser } from "@/server/repositories/notificationRepository"
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

/** `GET /api/notifications` — the caller's own notifications only, cursor-paginated, plus `unreadCount` (FR-038). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)

    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor") ?? undefined
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : undefined
    const unreadOnly = url.searchParams.get("unreadOnly") === "true"

    const { notifications, nextCursor, unreadCount } = await listNotificationsForUser(user.id, {
      cursor,
      limit,
      unreadOnly,
    })
    return respond(request, startedAt, 200, { notifications, nextCursor, unreadCount })
  } catch (error) {
    return handleRouteError(error)
  }
}
