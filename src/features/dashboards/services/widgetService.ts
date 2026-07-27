import type { CreateWidgetRequestInput, SaveLayoutRequestInput, UpdateWidgetRequestInput } from "@/shared/contracts/widget.schema"
import type { DashboardWidgetRecord, WidgetLayoutRecord } from "../types/dashboard.types"
import type { WidgetDataResult } from "../types/widget.types"
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

  getWidgetData(dashboardId: string, widgetId: string): Promise<WidgetDataResult> {
    return apiFetch(`/api/dashboards/${dashboardId}/widgets/${widgetId}/data`)
  },

  saveLayout(dashboardId: string, input: SaveLayoutRequestInput): Promise<{ layout: WidgetLayoutRecord[] }> {
    return apiFetch(`/api/dashboards/${dashboardId}/layout`, { method: "PUT", body: JSON.stringify(input) })
  },
}
