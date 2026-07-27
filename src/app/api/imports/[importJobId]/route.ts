import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { respond } from "@/server/http/importRouteHelpers"
import { getImportJobById } from "@/server/repositories/importJobRepository"
import { toErrorResponse } from "@/shared/errors/apiError"

interface RouteParams {
  params: Promise<{ importJobId: string }>
}

/**
 * `GET /api/imports/:importJobId` — one job's current detail and progress
 * (specs/005-import-export, contracts/api-contracts.md §6).
 *
 * Polled **only** when a running job is viewed without an in-memory driver —
 * after a reload, or from another device. The tab actually running an import
 * reads progress from `importStore`, because it already holds both numerator
 * and denominator, so the common case costs zero round trips (research.md
 * Decision 12).
 *
 * Applies the abandoned-job sweep on read: a `running` job whose heartbeat has
 * gone stale is returned as `failed` rather than showing "running" forever
 * (FR-074). Reading is the only moment anyone can observe a stale job, so it
 * is the moment one is resolved — no cron, no scheduler.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { importJobId } = await params

    const importJob = await getImportJobById(importJobId, user.id)
    if (!importJob) {
      const { status, body } = toErrorResponse(
        "NOT_FOUND",
        `No import job found with id "${importJobId}".`,
      )
      return respond(request, startedAt, status, body)
    }

    return respond(request, startedAt, 200, { importJob })
  } catch (error) {
    return handleRouteError(error)
  }
}
