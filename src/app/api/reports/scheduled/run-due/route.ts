import { NextResponse, type NextRequest } from "next/server"
import { handleRouteError } from "@/server/http/handleRouteError"
import { runDueScheduledReports } from "@/server/repositories/reportRepository"
import { toErrorResponse } from "@/shared/errors/apiError"
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

/**
 * `POST /api/reports/scheduled/run-due` — the one endpoint each deployment
 * target's own scheduler (Vercel Cron, Railway Cron, a Docker host's
 * crontab, AWS EventBridge, Supabase `pg_cron`) calls (research.md Decision
 * 10). **Not** authenticated via `getCurrentUser` — no interactive user is
 * present when a schedule fires — instead via a shared-secret header
 * compared against the server-only `CRON_SECRET` environment variable.
 * Idempotent: safe to call more than once for the same due window.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const configuredSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get("x-cron-secret")

    if (!configuredSecret || !providedSecret || providedSecret !== configuredSecret) {
      const { status, body } = toErrorResponse("UNAUTHORIZED", "Missing or incorrect X-Cron-Secret header.")
      return respond(request, startedAt, status, body)
    }

    const summary = await runDueScheduledReports()
    return respond(request, startedAt, 200, summary)
  } catch (error) {
    return handleRouteError(error)
  }
}
