import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { respond } from "@/server/http/importRouteHelpers"
import { rollbackImportJob } from "@/server/repositories/importJobRepository"

interface RouteParams {
  params: Promise<{ importJobId: string }>
}

/**
 * `POST /api/imports/:importJobId/rollback` — "Undo this import"
 * (specs/005-import-export, contracts/api-contracts.md §5).
 *
 * Deletes exactly the features this job committed and nothing else, including
 * when other users have since added features to the same layer (FR-072,
 * SC-011). That guarantee comes from row-level provenance on
 * `Feature.importJobId` — a timestamp window would take a concurrent user's
 * work with it (research.md Decision 14).
 *
 * Available from `succeeded`, `failed`, and `cancelled`. A second rollback
 * returns `409 CONFLICT` rather than silently succeeding: the features are
 * already gone, so a repeat call is a client bug.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "import:write")
    const { importJobId } = await params

    const { job, deletedFeatureCount } = await rollbackImportJob(importJobId, user.id)
    return respond(request, startedAt, 200, { importJob: job, deletedFeatureCount })
  } catch (error) {
    return handleRouteError(error)
  }
}
