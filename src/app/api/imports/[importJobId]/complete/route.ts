import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { respond } from "@/server/http/importRouteHelpers"
import { completeImportJob } from "@/server/repositories/importJobRepository"
import { completeImportJobSchema } from "@/shared/contracts/importJob.schema"
import { toErrorResponse } from "@/shared/errors/apiError"

interface RouteParams {
  params: Promise<{ importJobId: string }>
}

/**
 * `POST /api/imports/:importJobId/complete` — finalizes an import
 * (specs/005-import-export, contracts/api-contracts.md §3).
 *
 * Transitions `running` to a terminal state and freezes the counters. Returns
 * `409 CONFLICT` if the job already finished — a double-complete is a client
 * bug worth surfacing rather than swallowing.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "import:write")
    const { importJobId } = await params

    const parsed = completeImportJobSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const importJob = await completeImportJob(
      importJobId,
      user.id,
      parsed.data.outcome,
      parsed.data.errorMessage,
    )
    return respond(request, startedAt, 200, { importJob })
  } catch (error) {
    return handleRouteError(error)
  }
}
