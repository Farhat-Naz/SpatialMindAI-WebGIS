import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { deleteComment, updateComment } from "@/server/repositories/commentRepository"
import { prismaClient } from "@/server/db/prismaClient"
import { updateCommentSchema } from "@/shared/contracts/comment.schema"
import { NotFoundError, toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ commentId: string }>
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

/** Resolves a comment's `projectId` via feature→layer→project, for the membership check every method needs. */
async function getProjectIdForComment(commentId: string): Promise<string> {
  const comment = await prismaClient.comment.findUnique({
    where: { id: commentId },
    select: { feature: { select: { layer: { select: { projectId: true } } } } },
  })
  if (!comment) {
    throw new NotFoundError(`No comment found with id "${commentId}".`)
  }
  return comment.feature.layer.projectId
}

/**
 * `PATCH /api/comments/:commentId` — body edits are author-only (FR-035,
 * enforced by `updateComment`); toggling `resolved` is any member's
 * privilege, so the entry gate here is just membership (`Viewer`).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { commentId } = await params
    const projectId = await getProjectIdForComment(commentId)
    await assertProjectRole(projectId, user.id, "Viewer")

    const parsed = updateCommentSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const comment = await updateComment(commentId, user.id, parsed.data)
    return respond(request, startedAt, 200, { comment })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/comments/:commentId` — author-only (FR-035). */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { commentId } = await params
    const projectId = await getProjectIdForComment(commentId)
    await assertProjectRole(projectId, user.id, "Viewer")

    await deleteComment(commentId, user.id)

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
