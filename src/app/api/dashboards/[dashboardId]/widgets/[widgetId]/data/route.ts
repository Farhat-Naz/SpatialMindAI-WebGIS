import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/server/auth/getCurrentUser"
import { handleRouteError } from "@/server/http/handleRouteError"
import { resolveWidgetData } from "@/server/repositories/widgetRepository"
import type { ActiveWidgetFilter } from "@/features/dashboards/types/widget.types"
import { logger } from "@/shared/lib/logger"

const FILTER_TYPES = new Set(["date", "layer", "project", "attribute", "spatial"])

/** Parses the `?filters=` query param (US6/FR-020) — malformed/absent input is treated as "no active filters" rather than a `4xx`, since filtering is a client-convenience concern, not a contract the request must satisfy. */
function parseActiveFilters(request: NextRequest): ActiveWidgetFilter[] {
  const raw = new URL(request.url).searchParams.get("filters")
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is ActiveWidgetFilter =>
        typeof entry === "object" && entry !== null && FILTER_TYPES.has((entry as { filterType?: unknown }).filterType as string),
    )
  } catch {
    return []
  }
}

interface RouteParams {
  params: Promise<{ dashboardId: string; widgetId: string }>
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
 * `GET /api/dashboards/:dashboardId/widgets/:widgetId/data` — resolves one
 * widget's current data. A deleted/unresolvable data source returns `200`
 * with `{ dataSourceUnavailable: true }`, never a `4xx` (research.md
 * Decision 13, FR-040).
 */
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const startedAt = Date.now()
  try {
    const user = await getCurrentUser(request)
    const { dashboardId, widgetId } = await params
    const activeFilters = parseActiveFilters(request)
    const result = await resolveWidgetData(dashboardId, widgetId, user.id, activeFilters)
    return respond(request, startedAt, 200, result)
  } catch (error) {
    return handleRouteError(error)
  }
}
