import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { deleteScheduledReport, updateScheduledReport } from "@/server/repositories/reportRepository"
import { updateScheduledReportRequestSchema } from "@/shared/contracts/report.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ scheduledReportId: string }>
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

/** `PATCH /api/scheduled-reports/:scheduledReportId` — updates `recurrence`/`isActive` (pause/resume). */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { scheduledReportId } = await params

    const parsed = updateScheduledReportRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request body.")
      return respond(request, startedAt, status, body)
    }

    const scheduledReport = await updateScheduledReport(scheduledReportId, user.id, parsed.data)
    return respond(request, startedAt, 200, { scheduledReport })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/scheduled-reports/:scheduledReportId` — deletes a schedule; past `Report` rows survive with `scheduledReportId` set-null. */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { scheduledReportId } = await params
    await deleteScheduledReport(scheduledReportId, user.id)
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
