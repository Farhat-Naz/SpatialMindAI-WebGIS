import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { listTemplates } from "@/server/repositories/dashboardTemplateRepository"
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

/** `GET /api/dashboard-templates` — the five built-in templates (US8), platform-wide, no project-scoping. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    await getCurrentUser(request)
    const templates = await listTemplates()
    return respond(request, startedAt, 200, { templates })
  } catch (error) {
    return handleRouteError(error)
  }
}
