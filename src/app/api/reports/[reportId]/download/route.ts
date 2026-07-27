import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { getReportFileForDownload } from "@/server/repositories/reportRepository"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ reportId: string }>
}

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
  pdf: "application/pdf",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  html: "text/html",
}

const EXTENSION_BY_FORMAT: Record<string, string> = {
  pdf: "pdf",
  excel: "xlsx",
  csv: "csv",
  html: "html",
}

/** `GET /api/reports/:reportId/download` — streams the stored `fileContent` with the correct `Content-Type`/`Content-Disposition`. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { reportId } = await params

    const file = await getReportFileForDownload(reportId, user.id)
    if (!file) {
      const { status, body } = toErrorResponse("NOT_FOUND", `No downloadable report found with id "${reportId}".`)
      logger.request({ method: request.method, path: new URL(request.url).pathname, status, durationMs: Date.now() - startedAt })
      return NextResponse.json(body, { status })
    }

    logger.request({
      method: request.method,
      path: new URL(request.url).pathname,
      status: 200,
      durationMs: Date.now() - startedAt,
    })
    return new NextResponse(new Blob([new Uint8Array(file.fileContent)]), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE_BY_FORMAT[file.format] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="report-${reportId}.${EXTENSION_BY_FORMAT[file.format] ?? "bin"}"`,
      },
    })
  } catch (error) {
    return handleRouteError(error)
  }
}
