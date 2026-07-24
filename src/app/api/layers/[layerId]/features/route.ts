import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import {
  createFeature,
  listFeaturesForLayer,
  type ListFeaturesParams,
} from "@/server/repositories/featureRepository"
import { createFeatureSchema } from "@/shared/contracts/feature.schema"
import { toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ layerId: string }>
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

function parseBbox(raw: string | null): [number, number, number, number] | undefined {
  if (!raw) return undefined
  const parts = raw.split(",").map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new Error("bbox must be 'minLng,minLat,maxLng,maxLat'")
  }
  return parts as [number, number, number, number]
}

/** `GET /api/layers/:layerId/features` — cursor-paginated, optional bbox filter. */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { layerId } = await params

    const url = new URL(request.url)
    const cursor = url.searchParams.get("cursor") ?? undefined
    const limitParam = url.searchParams.get("limit")
    const limit = limitParam ? Number(limitParam) : undefined

    if (limitParam && (Number.isNaN(limit) || (limit ?? 0) <= 0)) {
      const { status, body } = toErrorResponse("INVALID_INPUT", "limit must be a positive number.")
      return respond(request, startedAt, status, body)
    }

    let bbox: [number, number, number, number] | undefined
    try {
      bbox = parseBbox(url.searchParams.get("bbox"))
    } catch (error) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        error instanceof Error ? error.message : "Invalid bbox.",
      )
      return respond(request, startedAt, status, body)
    }

    const listParams: ListFeaturesParams = { cursor, limit, bbox }
    const { features, nextCursor } = await listFeaturesForLayer(layerId, user.id, listParams)
    return respond(request, startedAt, 200, { features, nextCursor })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `POST /api/layers/:layerId/features` — create a feature. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "features:write")
    const { layerId } = await params

    const parsed = createFeatureSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const feature = await createFeature(layerId, user.id, parsed.data)
    return respond(request, startedAt, 201, { feature })
  } catch (error) {
    return handleRouteError(error)
  }
}
