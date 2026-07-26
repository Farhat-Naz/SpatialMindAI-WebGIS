import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import {
  createAnalysisRun,
  listAnalysisRunsForProject,
  type ListAnalysisRunsParams,
} from "@/server/repositories/analysisRepository"
import { analysisRequestSchema, type AnalysisRequestInput } from "@/shared/contracts/analysis.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ projectId: string }>
}

/** Raster operations named in spec.md US7 that have no server implementation yet (FR-017 — visibly present, explicitly unavailable). Heatmap is absent because it is client-only and never reaches this endpoint. */
const UNIMPLEMENTED_RASTER_OPERATIONS: ReadonlySet<string> = new Set([
  "elevationDem",
  "slope",
  "aspect",
  "hillshade",
])

function respond(request: NextRequest, startedAt: number, status: number, body: unknown): NextResponse {
  logger.request({
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    durationMs: Date.now() - startedAt,
  })
  return NextResponse.json(body, { status })
}

/** `GET /api/projects/:projectId/analysis` — cursor-paginated Analysis History, newest first. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor") ?? undefined
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : undefined
    const batchId = url.searchParams.get("batchId") ?? undefined
    const statusParam = url.searchParams.get("status") ?? undefined
    const status = statusParam ? statusParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined

    if (limitParam && (Number.isNaN(limit) || (limit ?? 0) <= 0)) {
      const { status: errStatus, body } = toErrorResponse("INVALID_INPUT", "limit must be a positive number.")
      return respond(request, startedAt, errStatus, body)
    }

    const listParams: ListAnalysisRunsParams = { cursor, limit, batchId, status }
    const { runs, nextCursor } = await listAnalysisRunsForProject(projectId, user.id, listParams)
    return respond(request, startedAt, 200, { runs, nextCursor })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/projects/:projectId/analysis` — submit a single Analysis Run. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "analysis:write")
    const { projectId } = await params

    const rawBody = await request.json()

    // US7/T244 — the raster operations exist in the Toolbox but have no
    // request contract yet, so the schema below would reject them with a
    // generic "invalid operationType". Naming them explicitly means a
    // caller hitting the API directly learns the operation is planned but
    // unimplemented, rather than that it is unrecognized.
    const requestedOperation = (rawBody as { operationType?: unknown } | null)?.operationType
    if (typeof requestedOperation === "string" && UNIMPLEMENTED_RASTER_OPERATIONS.has(requestedOperation)) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        `"${requestedOperation}" is not yet implemented. Heatmap is the only raster-category operation currently available, and it renders client-side.`,
      )
      return respond(request, startedAt, status, body)
    }

    const parsed = analysisRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const run = await createAnalysisRun(projectId, user.id, parsed.data as unknown as AnalysisRequestInput)
    // 202: the row always exists by response time, but `status` may still
    // be "queued"/"running" for a background-execution operation
    // (research.md Decision 5) — the client always checks `run.status`,
    // never assumes a fixed timing.
    return respond(request, startedAt, 202, { run })
  } catch (error) {
    return handleRouteError(error)
  }
}
