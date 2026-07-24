import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { listVersionsForProject, saveVersion } from "@/server/repositories/versionRepository"
import { saveVersionSchema } from "@/shared/contracts/version.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ projectId: string }>
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

/** `GET /api/projects/:projectId/versions` — any member may list (metadata only, FR-030). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    const versions = await listVersionsForProject(projectId)
    return respond(request, startedAt, 200, { versions })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/projects/:projectId/versions` — Editor or above may save (FR-026). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Editor")

    const parsed = saveVersionSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const version = await saveVersion(projectId, user.id, parsed.data.note)
    return respond(request, startedAt, 201, { version })
  } catch (error) {
    return handleRouteError(error)
  }
}
