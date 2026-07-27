import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createReport } from "@/server/repositories/reportRepository"
import { createReportRequestSchema } from "@/shared/contracts/report.schema"
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

/**
 * `POST /api/dashboards/:dashboardId/reports` — logs+persists a report
 * (US5). `multipart/form-data` when the client already generated the file
 * (e.g. a client-rendered PDF, `fileContent` field); JSON body otherwise,
 * letting the server generate Excel/CSV/HTML itself.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "dashboard:write")
    const { dashboardId } = await params

    const contentType = request.headers.get("content-type") ?? ""
    let format: string | undefined
    let fileContent: Buffer | undefined

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      format = form.get("format")?.toString()
      const blob = form.get("fileContent")
      if (blob instanceof Blob) {
        fileContent = Buffer.from(await blob.arrayBuffer())
      }
    } else {
      const json = await request.json()
      const parsed = createReportRequestSchema.safeParse(json)
      if (!parsed.success) {
        const { status, body } = toErrorResponse("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid request body.")
        return respond(request, startedAt, status, body)
      }
      format = parsed.data.format
      fileContent = parsed.data.fileContent ? Buffer.from(parsed.data.fileContent, "base64") : undefined
    }

    if (!format || !["pdf", "excel", "csv", "html"].includes(format)) {
      const { status, body } = toErrorResponse("INVALID_INPUT", `Unknown report format "${format}".`)
      return respond(request, startedAt, status, body)
    }

    const report = await createReport(dashboardId, user.id, {
      format: format as "pdf" | "excel" | "csv" | "html",
      fileContent,
    })
    return respond(request, startedAt, 201, { report })
  } catch (error) {
    return handleRouteError(error)
  }
}
