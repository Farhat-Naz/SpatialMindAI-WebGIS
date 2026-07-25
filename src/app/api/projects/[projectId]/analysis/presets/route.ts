import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createPreset, listPresetsForProject } from "@/server/repositories/analysisPresetRepository"
import { createPresetRequestSchema } from "@/shared/contracts/presetRequest.schema"
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

/** `GET /api/projects/:projectId/analysis/presets` — lists presets visible in a project (US8/FR-021). */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const presets = await listPresetsForProject(projectId, user.id)
    return respond(request, startedAt, 200, { presets })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/projects/:projectId/analysis/presets` — saves a named parameter set. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { projectId } = await params

    const parsed = createPresetRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const preset = await createPreset(projectId, user.id, parsed.data)
    return respond(request, startedAt, 201, { preset })
  } catch (error) {
    return handleRouteError(error)
  }
}
