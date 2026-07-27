import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createFilter, listFilters } from "@/server/repositories/dashboardFilterRepository"
import { createFilterRequestSchema } from "@/shared/contracts/dashboardFilter.schema"
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

/** `GET /api/dashboards/:dashboardId/filters` — global and widget-scoped filters (US6/FR-020). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { dashboardId } = await params
    const filters = await listFilters(dashboardId, user.id)
    return respond(request, startedAt, 200, { filters })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/dashboards/:dashboardId/filters` — creates a global (no `widgetId`) or widget-scoped filter (US6/FR-021). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId } = await params

    const parsed = createFilterRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request body.")
      return respond(request, startedAt, status, body)
    }

    const filter = await createFilter(dashboardId, user.id, parsed.data)
    return respond(request, startedAt, 201, { filter })
  } catch (error) {
    return handleRouteError(error)
  }
}
