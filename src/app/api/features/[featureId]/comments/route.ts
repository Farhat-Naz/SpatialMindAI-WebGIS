import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createComment, listCommentsForFeature } from "@/server/repositories/commentRepository"
import { getProjectIdForFeature } from "@/server/repositories/featureRepository"
import { createCommentSchema } from "@/shared/contracts/comment.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ featureId: string }>
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

/** `GET /api/features/:featureId/comments` — any member (including Viewer) may read. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { featureId } = await params
    const projectId = await getProjectIdForFeature(featureId)
    await assertProjectRole(projectId, user.id, "Viewer")

    const comments = await listCommentsForFeature(featureId)
    return respond(request, startedAt, 200, { comments })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/features/:featureId/comments` — Editor or above may post. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { featureId } = await params
    const projectId = await getProjectIdForFeature(featureId)
    await assertProjectRole(projectId, user.id, "Editor")

    const parsed = createCommentSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const comment = await createComment(
      featureId,
      user.id,
      parsed.data.body,
      parsed.data.parentCommentId,
    )
    return respond(request, startedAt, 201, { comment })
  } catch (error) {
    return handleRouteError(error)
  }
}
