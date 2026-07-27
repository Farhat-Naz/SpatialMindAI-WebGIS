import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createDashboard, listDashboardsForProject } from "@/server/repositories/dashboardRepository"
import { createDashboardRequestSchema, listDashboardsQuerySchema } from "@/shared/contracts/dashboard.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
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

/** `GET /api/projects/:projectId/dashboards` — cursor-paginated dashboard list (US1). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const url = new URL(request.url)
    const parsedQuery = listDashboardsQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      favoritesOnly: url.searchParams.get("favoritesOnly") ?? undefined,
    })
    if (!parsedQuery.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsedQuery.error.issues[0]?.message ?? "Invalid query.")
      return respond(request, startedAt, status, body)
    }

    const result = await listDashboardsForProject(projectId, user.id, parsedQuery.data)
    return respond(request, startedAt, 200, result)
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/projects/:projectId/dashboards` — create a dashboard, optionally from a template (FR-001, US8). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { projectId } = await params

    const parsed = createDashboardRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request body.")
      return respond(request, startedAt, status, body)
    }

    const dashboard = await createDashboard(projectId, user.id, parsed.data)
    return respond(request, startedAt, 201, { dashboard })
  } catch (error) {
    return handleRouteError(error)
  }
}
