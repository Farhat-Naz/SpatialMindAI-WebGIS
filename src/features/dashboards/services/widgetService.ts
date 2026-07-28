import type { CreateWidgetRequestInput, SaveLayoutRequestInput, UpdateWidgetRequestInput } from "@/shared/contracts/widget.schema"
import type { DashboardWidgetRecord, WidgetLayoutRecord } from "../types/dashboard.types"
import type { ActiveWidgetFilter, WidgetDataResult } from "../types/widget.types"
import { apiFetch } from "./apiFetch"

/** Client access to widget CRUD/layout/data endpoints (contracts/client-api.md `widgetService.ts`). */
export const widgetService = {
  addWidget(
    dashboardId: string,
    input: CreateWidgetRequestInput,
  ): Promise<{ widget: DashboardWidgetRecord; layout: WidgetLayoutRecord[] }> {
    return apiFetch(`/api/dashboards/${dashboardId}/widgets`, { method: "POST", body: JSON.stringify(input) })
  },

  updateWidget(widgetId: string, input: UpdateWidgetRequestInput): Promise<{ widget: DashboardWidgetRecord }> {
    return apiFetch(`/api/widgets/${widgetId}`, { method: "PATCH", body: JSON.stringify(input) })
  },

  deleteWidget(widgetId: string): Promise<void> {
    return apiFetch(`/api/widgets/${widgetId}`, { method: "DELETE" })
  },

  /** `filters` (US6) — the caller's currently-active global + widget-scoped filters, sent as `?filters=` so the server can narrow `dataSourceType: "layer"` widgets' results. */
  getWidgetData(dashboardId: string, widgetId: string, filters: ActiveWidgetFilter[] = []): Promise<WidgetDataResult> {
    const query = filters.length > 0 ? `?filters=${encodeURIComponent(JSON.stringify(filters))}` : ""
    return apiFetch(`/api/dashboards/${dashboardId}/widgets/${widgetId}/data${query}`)
  },

  saveLayout(dashboardId: string, input: SaveLayoutRequestInput): Promise<{ layout: WidgetLayoutRecord[] }> {
    return apiFetch(`/api/dashboards/${dashboardId}/layout`, { method: "PUT", body: JSON.stringify(input) })
  },
}
