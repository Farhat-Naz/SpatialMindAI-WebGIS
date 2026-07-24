import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createProject, listProjectsForOwner } from "@/server/repositories/projectRepository"
import { createProjectSchema } from "@/shared/contracts/project.schema"
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

/** `GET /api/projects` — list the current user's projects. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const projects = await listProjectsForOwner(user.id)
    return respond(request, startedAt, 200, { projects })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/projects` — create a project owned by the current user. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "projects:write")

    const parsed = createProjectSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const project = await createProject(user.id, parsed.data.name, parsed.data.description)
    return respond(request, startedAt, 201, { project })
  } catch (error) {
    return handleRouteError(error)
  }
}
