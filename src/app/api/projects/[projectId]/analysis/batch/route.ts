import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { createBatchRun } from "@/server/repositories/analysisRepository"
import { analysisBatchRequestSchema } from "@/shared/contracts/analysis.schema"
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

/**
 * `POST /api/projects/:projectId/analysis/batch` — submit a Batch Run: one
 * operation/parameter set applied independently across 1–20 input sets
 * (FR-022). Each item's own outcome is independent (FR-023) — this
 * endpoint itself only returns a non-201 error for a malformed batch
 * shape, never because one item among many failed.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { projectId } = await params

    const parsed = analysisBatchRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const { operationType, parameters, items } = parsed.data
    const { batchId, runs } = await createBatchRun(projectId, user.id, operationType, parameters, items)
    return respond(request, startedAt, 201, { batchId, runs })
  } catch (error) {
    return handleRouteError(error)
  }
}
