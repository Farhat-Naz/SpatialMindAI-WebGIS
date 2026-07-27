import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import {
  deleteDashboard,
  getDashboardById,
  renameDashboard,
  setDashboardVisibility,
} from "@/server/repositories/dashboardRepository"
import { updateDashboardRequestSchema } from "@/shared/contracts/dashboard.schema"
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

/** `GET /api/dashboards/:dashboardId` — single dashboard detail. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { dashboardId } = await params
    const dashboard = await getDashboardById(dashboardId, user.id)
    return respond(request, startedAt, 200, { dashboard })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `PATCH /api/dashboards/:dashboardId` — rename and/or change visibility (FR-024). */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId } = await params

    const parsed = updateDashboardRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request body.")
      return respond(request, startedAt, status, body)
    }

    let dashboard = await getDashboardById(dashboardId, user.id)
    if (parsed.data.name !== undefined) {
      dashboard = await renameDashboard(dashboardId, user.id, parsed.data.name)
    }
    if (parsed.data.visibility !== undefined) {
      dashboard = await setDashboardVisibility(dashboardId, user.id, parsed.data.visibility)
    }
    return respond(request, startedAt, 200, { dashboard })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/dashboards/:dashboardId` — deletes a dashboard and everything it cascades to (FR-001/FR-004). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId } = await params
    await deleteDashboard(dashboardId, user.id)
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
