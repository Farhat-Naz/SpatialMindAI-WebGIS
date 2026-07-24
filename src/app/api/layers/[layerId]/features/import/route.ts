import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { importFeatures } from "@/server/repositories/featureRepository"
import {
  importFeatureCollectionSchema,
  propertiesToAttributes,
} from "@/shared/contracts/geoJsonImport.schema"
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

/**
 * `POST /api/layers/:layerId/features/import` — bulk feature import, used
 * by both GeoJSON import and (after client-side conversion) Shapefile
 * import. Append-only, all-or-nothing (Research Decisions 5, 19).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "features:write")
    const { layerId } = await params

    const parsed = importFeatureCollectionSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const features = parsed.data.features.map((feature) => ({
      geometry: feature.geometry,
      attributes: propertiesToAttributes(feature.properties),
    }))

    const result = await importFeatures(layerId, user.id, features)
    return respond(request, startedAt, 201, result)
  } catch (error) {
    return handleRouteError(error)
  }
}
