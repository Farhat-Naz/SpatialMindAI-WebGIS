import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { handleRouteError } from "@/server/http/handleRouteError"
import { getSnapshot, type SnapshotType } from "@/server/repositories/dashboardAnalyticsRepository"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ projectId: string; snapshotType: string }>
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

const VALID_SNAPSHOT_TYPES: SnapshotType[] = ["projectStats", "layerStats", "featureStats", "systemStats", "storageStats"]

/** `GET /api/projects/:projectId/analytics/:snapshotType` — a (possibly cached) analytics aggregate (US4). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId, snapshotType } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    if (!VALID_SNAPSHOT_TYPES.includes(snapshotType as SnapshotType)) {
      const { status, body } = toErrorResponse("INVALID_INPUT", `Unknown snapshotType "${snapshotType}".`)
      return respond(request, startedAt, status, body)
    }

    const scopeId = new URL(request.url).searchParams.get("scopeId") ?? undefined
    if (snapshotType === "layerStats" && !scopeId) {
      const { status, body } = toErrorResponse("INVALID_INPUT", "layerStats requires a scopeId query param.")
      return respond(request, startedAt, status, body)
    }

    const snapshot = await getSnapshot(projectId, snapshotType as SnapshotType, scopeId)
    return respond(request, startedAt, 200, snapshot)
  } catch (error) {
    return handleRouteError(error)
  }
}
