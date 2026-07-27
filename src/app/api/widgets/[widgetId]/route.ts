import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { deleteWidget, updateWidget } from "@/server/repositories/widgetRepository"
import { updateWidgetRequestSchema } from "@/shared/contracts/widget.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ widgetId: string }>
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

/** `PATCH /api/widgets/:widgetId` — updates title/dataSource/config/groupId/isCollapsed. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { widgetId } = await params

    const parsed = updateWidgetRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request body.")
      return respond(request, startedAt, status, body)
    }

    const widget = await updateWidget(widgetId, user.id, parsed.data)
    return respond(request, startedAt, 200, { widget })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/widgets/:widgetId` — removes a widget (`WidgetLayout`/`DashboardFilter` cascade). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { widgetId } = await params
    await deleteWidget(widgetId, user.id)
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
