import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import {
  deleteFeature,
  getFeatureById,
  updateFeature,
} from "@/server/repositories/featureRepository"
import { updateFeatureSchema } from "@/shared/contracts/feature.schema"
import { NotFoundError, toErrorResponse } from "@/shared/errors/apiError"
import { logger } from "@/shared/lib/logger"

interface RouteParams {
  params: Promise<{ featureId: string }>
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

/** `GET /api/features/:featureId` */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { featureId } = await params

    const feature = await getFeatureById(featureId, user.id)
    if (!feature) {
      throw new NotFoundError(`No feature found with id "${featureId}".`)
    }

    return respond(request, startedAt, 200, { feature })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `PATCH /api/features/:featureId` — geometry/attributes/style update independently. */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "features:write")
    const { featureId } = await params

    const parsed = updateFeatureSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const feature = await updateFeature(featureId, user.id, parsed.data)
    return respond(request, startedAt, 200, { feature })
  } catch (error) {
    return handleRouteError(error)
  }
}

/** `DELETE /api/features/:featureId` */
export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "features:write")
    const { featureId } = await params

    await deleteFeature(featureId, user.id)

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
