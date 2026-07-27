import { type NextRequest, type NextResponse } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { parsePagingParams, respond } from "@/server/http/importRouteHelpers"
import {
  listImportsForProject,
  type ImportStatus,
} from "@/server/repositories/importJobRepository"
import { importStatusSchema } from "@/shared/contracts/importJob.schema"
import { toErrorResponse } from "@/shared/errors/apiError"

interface RouteParams {
  params: Promise<{ projectId: string }>
}

/**
 * `GET /api/projects/:projectId/imports` — cursor-paginated import history,
 * newest first (specs/005-import-export, contracts/api-contracts.md §8).
 *
 * Structurally mirrors the existing `GET /api/projects/:projectId/exports`,
 * including its `limit` validation branch — `ImportJob` rows *are* the import
 * history, exactly as `ExportJob` rows are the export history (research.md
 * Decision 15).
 *
 * Readable by a project `Viewer`: FR-080 requires view-only members to read
 * history while every mutating action requires `Editor`. An entry whose target
 * layer was deleted returns `targetLayerId: null` with `targetLayerName`
 * intact (FR-079).
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { projectId } = await params

    const paging = parsePagingParams(request)
    if ("error" in paging) {
      const { status, body } = toErrorResponse("INVALID_INPUT", paging.error)
      return respond(request, startedAt, status, body)
    }

    const statusParam = new URL(request.url).searchParams.get("status")
    let status: ImportStatus | undefined
    if (statusParam) {
      const parsed = importStatusSchema.safeParse(statusParam)
      if (!parsed.success) {
        const { status: httpStatus, body } = toErrorResponse(
          "INVALID_INPUT",
          `"${statusParam}" is not a valid import status.`,
        )
        return respond(request, startedAt, httpStatus, body)
      }
      status = parsed.data
    }

    const { imports, nextCursor } = await listImportsForProject(projectId, user.id, {
      ...paging,
      status,
    })
    return respond(request, startedAt, 200, { imports, nextCursor })
  } catch (error) {
    return handleRouteError(error)
  }
}
