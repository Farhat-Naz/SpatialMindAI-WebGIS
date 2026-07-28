import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { getUsageAnalytics, listDashboardsForAdmin } from "@/server/repositories/dashboardAdminRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ projectId: string }>
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
 * `GET /api/projects/:projectId/dashboards/admin` — Dashboard Administration
 * (US10/T284/T285): every dashboard in the project plus usage analytics,
 * Project-Owner-only (FR-038, enforced inside both repository calls, not
 * just here — T288's "server-side check on the underlying admin-scoped
 * queries").
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const [dashboards, usage] = await Promise.all([
      listDashboardsForAdmin(projectId, user.id),
      getUsageAnalytics(projectId, user.id),
    ])
    return respond(request, startedAt, 200, { dashboards, usage })
  } catch (error) {
    return handleRouteError(error)
  }
}
