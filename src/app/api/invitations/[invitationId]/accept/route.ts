import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { acceptInvitation } from "@/server/repositories/invitationRepository"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ invitationId: string }>
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

/** `POST /api/invitations/:invitationId/accept` — only the invited user may accept their own invitation. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "collaboration:write")
    const { invitationId } = await params

    const invitation = await acceptInvitation(invitationId, user.id)
    return respond(request, startedAt, 200, { invitation })
  } catch (error) {
    return handleRouteError(error)
  }
}
