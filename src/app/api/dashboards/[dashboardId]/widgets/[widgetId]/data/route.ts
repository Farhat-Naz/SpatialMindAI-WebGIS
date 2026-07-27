import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { resolveWidgetData } from "@/server/repositories/widgetRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ dashboardId: string; widgetId: string }>
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
 * `GET /api/dashboards/:dashboardId/widgets/:widgetId/data` — resolves one
 * widget's current data. A deleted/unresolvable data source returns `200`
 * with `{ dataSourceUnavailable: true }`, never a `4xx` (research.md
 * Decision 13, FR-040).
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { dashboardId, widgetId } = await params
    const result = await resolveWidgetData(dashboardId, widgetId, user.id)
    return respond(request, startedAt, 200, result)
  } catch (error) {
    return handleRouteError(error)
  }
}
