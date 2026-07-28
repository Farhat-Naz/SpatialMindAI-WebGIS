import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { logDashboardExport } from "@/server/repositories/dashboardRepository"
import { toErrorResponse } from "@/shared/errors/apiError"
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

/**
 * `POST /api/dashboards/:dashboardId/export-log` — T340/research.md
 * Decision 9 & 11: records that an ad-hoc export happened (audit purposes
 * only, FR-042) without storing the exported file — `DashboardExportMenu`/
 * `WidgetRenderer`'s client-side export paths call this after a successful
 * capture, since neither has any other server round-trip to piggyback on.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId } = await params

    const body: unknown = await request.json()
    if (typeof body !== "object" || body === null || typeof (body as { format?: unknown }).format !== "string") {
      const { status, body: errorBody } = toErrorResponse("INVALID_INPUT", 'A string "format" is required.')
      return respond(request, startedAt, status, errorBody)
    }
    const { format, filters } = body as { format: string; filters?: unknown }

    await logDashboardExport(dashboardId, user.id, { format, filters })
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
