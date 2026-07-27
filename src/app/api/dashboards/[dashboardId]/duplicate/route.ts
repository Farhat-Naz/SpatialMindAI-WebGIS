import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { duplicateDashboard } from "@/server/repositories/dashboardRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ dashboardId: string }>
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

/** `POST /api/dashboards/:dashboardId/duplicate` — deep-copies a dashboard into a new, independent one (FR-002). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId } = await params
    const dashboard = await duplicateDashboard(dashboardId, user.id)
    return respond(request, startedAt, 201, { dashboard })
  } catch (error) {
    return handleRouteError(error)
  }
}
