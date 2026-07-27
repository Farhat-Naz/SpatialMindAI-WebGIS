import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import { respond } from "@/server/http/importRouteHelpers"
import { createImportJob } from "@/server/repositories/importJobRepository"
import { createImportJobSchema } from "@/shared/contracts/importJob.schema"
import { toErrorResponse } from "@/shared/errors/apiError"

interface RouteParams {
  params: Promise<{ layerId: string }>
}

/**
 * `POST /api/layers/:layerId/imports` — creates an import job
 * (specs/005-import-export, contracts/api-contracts.md §1).
 *
 * Called only **after** the client's preflight has validated the whole file
 * and the user has confirmed (FR-005). Abandoning at the confirmation gate
 * simply never issues this request, which is what makes FR-011's "nothing is
 * written" guarantee trivially true.
 *
 * `totalFeatures` is trusted as a display denominator only — the authoritative
 * counts accumulate from what chunks actually commit.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "import:write")
    const { layerId } = await params

    const parsed = createImportJobSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    const importJob = await createImportJob(layerId, user.id, {
      sourceFormat: parsed.data.sourceFormat,
      fileName: parsed.data.fileName,
      fileSizeBytes: parsed.data.fileSizeBytes,
      mimeType: parsed.data.mimeType,
      fileHash: parsed.data.fileHash,
      sourceCrs: parsed.data.sourceCrs,
      customCrsDefinition: parsed.data.customCrsDefinition,
      mode: parsed.data.mode,
      totalFeatures: parsed.data.totalFeatures,
      columnMapping: parsed.data.columnMapping,
      preflightIssues: parsed.data.preflightIssues,
      preflightCounts: parsed.data.preflightCounts,
    })

    return respond(request, startedAt, 201, { importJob })
  } catch (error) {
    return handleRouteError(error)
  }
}
