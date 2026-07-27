import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { parsePagingParams, respond } from "@/server/http/importRouteHelpers"
import { listIssuesForJob } from "@/server/repositories/importJobRepository"
import { toErrorResponse } from "@/shared/errors/apiError"

interface RouteParams {
  params: Promise<{ importJobId: string }>
}

/**
 * `GET /api/imports/:importJobId/issues` — a job's validation findings
 * (specs/005-import-export, contracts/api-contracts.md §7).
 *
 * Default limit 100, which is FR-058's inline count. `truncated` in the
 * response is how the UI states honestly that history holds the first 1,000
 * issues of a larger set — the complete report is available in-session from
 * the client's preflight, which is uncapped (research.md Decision 16).
 *
 * Readable by a project `Viewer` (FR-080).
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { importJobId } = await params

    const paging = parsePagingParams(request)
    if ("error" in paging) {
      const { status, body } = toErrorResponse("INVALID_INPUT", paging.error)
      return respond(request, startedAt, status, body)
    }

    const result = await listIssuesForJob(importJobId, user.id, paging)
    return respond(request, startedAt, 200, result)
  } catch (error) {
    return handleRouteError(error)
  }
}
