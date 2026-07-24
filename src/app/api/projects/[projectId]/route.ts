import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import {
  deleteProject,
  getProjectById,
  updateProject,
} from "@/server/repositories/projectRepository"
import { updateProjectSchema } from "@/shared/contracts/project.schema"
import { NotFoundError, toErrorResponse } from "@/shared/errors/apiError"
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

/** `GET /api/projects/:projectId` */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const project = await getProjectById(projectId, user.id)
    if (!project) {
      throw new NotFoundError(`No project found with id "${projectId}".`)
    }

    return respond(request, startedAt, 200, { project })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `PATCH /api/projects/:projectId` */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "projects:write")
    const { projectId } = await params

    const parsed = updateProjectSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const project = await updateProject(projectId, user.id, parsed.data)
    return respond(request, startedAt, 200, { project })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/projects/:projectId` — cascades to every layer/feature/attribute/style. */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "projects:write")
    const { projectId } = await params

    await deleteProject(projectId, user.id)

    logger.request({
      method: request.method,
      path: new URL(request.url).pathname,
      status: 204,
      durationMs: Date.now() - startedAt,
    })
    // A 204 response must have a null body (not a JSON-serialized "null"
    // string) per the Fetch spec, so this bypasses the `respond()` helper.
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleRouteError(error)
  }
}
