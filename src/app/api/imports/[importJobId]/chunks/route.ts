import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { assertWriteRateLimit } from "@/server/http/assertWriteRateLimit"
import { handleRouteError } from "@/server/http/handleRouteError"
import {
  findOutOfRangeFeature,
  respond,
  toRepositoryFeature,
} from "@/server/http/importRouteHelpers"
import {
  commitImportChunk,
  getImportJobById,
} from "@/server/repositories/importJobRepository"
import {
  IMPORT_CHUNK_MAX_BYTES,
  commitImportChunkSchema,
} from "@/shared/contracts/importChunk.schema"
import { toErrorResponse } from "@/shared/errors/apiError"

interface RouteParams {
  params: Promise<{ importJobId: string }>
}

/**
 * `POST /api/imports/:importJobId/chunks` — commits one chunk of features
 * (specs/005-import-export, contracts/api-contracts.md §2).
 *
 * **This is the feature's security boundary.** Because all five formats are
 * parsed in the browser (research.md Decision 2), nothing the client claims to
 * have validated can be trusted here: the body size, the feature count, the
 * geometry structure, the coordinate ranges, and every attribute key and value
 * are all re-checked server-side (research.md Decision 18, Constitution
 * Principles II and VI).
 *
 * Idempotent on `chunkIndex`, so a retry after a network blip commits nothing
 * new — retries are routine across the ~100 requests a large import makes.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    assertWriteRateLimit(user.id, "import:write")
    const { importJobId } = await params

    // Body-size guard before parsing: a caller must not be able to make the
    // server materialize an arbitrarily large JSON document (FR-083).
    const contentLength = Number(request.headers.get("content-length") ?? 0)
    if (contentLength > IMPORT_CHUNK_MAX_BYTES) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        `A chunk may be at most ${Math.floor(IMPORT_CHUNK_MAX_BYTES / (1024 * 1024))} MB.`,
      )
      return respond(request, startedAt, status, body)
    }

    const parsed = commitImportChunkSchema.safeParse(await request.json())
    if (!parsed.success) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid request body.",
      )
      return respond(request, startedAt, status, body)
    }

    // The job's source CRS decides whether WGS84 coordinate ranges apply: a
    // projected easting of 530000 is valid input and must not be range-checked
    // here — those bounds belong to ST_Transform's output (research.md D4).
    const job = await getImportJobById(importJobId, user.id)
    if (!job) {
      const { status, body } = toErrorResponse(
        "NOT_FOUND",
        `No import job found with id "${importJobId}".`,
      )
      return respond(request, startedAt, status, body)
    }

    const outOfRange = findOutOfRangeFeature(parsed.data.features, job.sourceCrs)
    if (outOfRange) {
      const { status, body } = toErrorResponse(
        "INVALID_INPUT",
        `Feature at position ${outOfRange.sourcePosition}: ${outOfRange.message}`,
      )
      return respond(request, startedAt, status, body)
    }

    const result = await commitImportChunk(
      importJobId,
      user.id,
      parsed.data.chunkIndex,
      parsed.data.features.map(toRepositoryFeature),
    )

    return respond(request, startedAt, 200, result)
  } catch (error) {
    return handleRouteError(error)
  }
}
