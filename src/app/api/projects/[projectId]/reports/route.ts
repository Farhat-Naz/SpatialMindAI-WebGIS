import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { listReportsForUser } from "@/server/repositories/reportRepository"
import { listReportsQuerySchema } from "@/shared/contracts/report.schema"
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

/** `GET /api/projects/:projectId/reports` — the requesting user's Generated Reports, cursor-paginated (FR-018/FR-033). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    const url = new URL(request.url)
    const parsed = listReportsQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    })
    if (!parsed.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid query.")
      return respond(request, startedAt, status, body)
    }

    const result = await listReportsForUser(projectId, user.id, parsed.data)
    return respond(request, startedAt, 200, result)
  } catch (error) {
    return handleRouteError(error)
  }
}
