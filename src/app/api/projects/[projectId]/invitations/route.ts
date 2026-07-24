import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createInvitation, listInvitationsForProject } from "@/server/repositories/invitationRepository"
import { inviteMemberSchema } from "@/shared/contracts/membership.schema"
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

/** `GET /api/projects/:projectId/invitations` — any member may view pending invitations. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Viewer")

    const invitations = await listInvitationsForProject(projectId)
    return respond(request, startedAt, 200, { invitations })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/projects/:projectId/invitations` — Owner-only (US1). */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { projectId } = await params
    await assertProjectRole(projectId, user.id, "Owner")

    const parsed = inviteMemberSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const invitation = await createInvitation(
      projectId,
      user.id,
      parsed.data.invitedUserId,
      parsed.data.role,
    )
    return respond(request, startedAt, 201, { invitation })
  } catch (error) {
    return handleRouteError(error)
  }
}
