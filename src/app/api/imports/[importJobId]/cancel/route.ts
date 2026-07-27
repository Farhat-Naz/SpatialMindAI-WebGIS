import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { respond } from "@/server/http/importRouteHelpers"
import { cancelImportJob } from "@/server/repositories/importJobRepository"

interface RouteParams {
  params: Promise<{ importJobId: string }>
}

/**
 * `POST /api/imports/:importJobId/cancel` — requests cancellation
 * (specs/005-import-export, contracts/api-contracts.md §4).
 *
 * This is the **server-side half** of cancellation: setting `cancelRequestedAt`
 * makes every subsequent chunk POST fail with `CONFLICT`, so a stale or
 * hostile client cannot keep writing after the user stopped the import
 * (research.md Decision 13). The client's own `AbortController` is the fast
 * path; this is the guarantee.
 *
 * Chunks already committed **remain** — the confirmed design decision
 * (spec.md Assumptions). The response's `importedCount` is exactly what
 * FR-070 requires the summary to state, and rollback stays available.
 *
 * Cancelling an already-terminal job is a **no-op success, not an error**,
 * deliberately matching `POST /api/analysis/:runId/cancel`'s documented
 * behavior.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "import:write")
    const { importJobId } = await params

    const importJob = await cancelImportJob(importJobId, user.id)
    return respond(request, startedAt, 200, { importJob })
  } catch (error) {
    return handleRouteError(error)
  }
}
