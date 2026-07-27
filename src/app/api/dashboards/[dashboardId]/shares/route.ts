import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { grantShare, listShares } from "@/server/repositories/dashboardShareRepository"
import { grantShareRequestSchema } from "@/shared/contracts/dashboard.schema"
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

/** `GET /api/dashboards/:dashboardId/shares` — owner/project-Owner only (FR-023). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { dashboardId } = await params
    const shares = await listShares(dashboardId, user.id)
    return respond(request, startedAt, 200, { shares })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/dashboards/:dashboardId/shares` — grants/updates a share (upserts on `(dashboardId, userId)`). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId } = await params

    const parsed = grantShareRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request body.")
      return respond(request, startedAt, status, body)
    }

    const share = await grantShare(dashboardId, user.id, parsed.data)
    return respond(request, startedAt, 201, { share })
  } catch (error) {
    return handleRouteError(error)
  }
}
