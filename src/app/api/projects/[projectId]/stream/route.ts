import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ projectId: string }>
}

/**
 * `GET /api/projects/:projectId/stream` — Server-Sent Events (research.md
 * Decisions 1–2). This phase (T064) wires the access check only — a
 * non-member request is rejected before any stream would open. The actual
 * `ReadableStream`/SSE body is completed in Phase 8 (T107), once
 * `src/server/realtime/channel.ts`'s `subscribe` is wired to a real event
 * flow worth streaming.
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    logger.request({
      method: request.method,
      path: new URL(request.url).pathname,
      status: 501,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json(
      { error: { code: "NOT_IMPLEMENTED", message: "The realtime stream is not yet available." } },
      { status: 501 },
    )
  } catch (error) {
    return handleRouteError(error)
  }
}
