"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ErrorBoundary } from "@/shared/components/ErrorBoundary"
import { Button } from "@/shared/components/ui/button"
import { useDeleteWidget, useUpdateWidget, useWidgetData } from "../hooks/useWidgets"
import { queryKeys } from "../services/queryKeys"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import type { DashboardWidgetRecord } from "../types/dashboard.types"
import type { WidgetProps, WidgetType } from "../types/widget.types"
import { WidgetErrorFallback } from "./WidgetErrorFallback"
import { WidgetUnavailableState } from "./WidgetUnavailableState"

/**
 * The one place `DashboardWidget.type` dispatches to a concrete component
 * (research.md Decision 1). Adding a 13th widget type requires touching only
 * this map plus one new component file (T146). Phase 10 replaces each
 * placeholder below with its real renderer, one file at a time.
 */
function PlaceholderWidget({ widget }: WidgetProps) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
      {widget.type} widget — renderer not yet implemented
    </div>
  )
}

export const WIDGET_REGISTRY: Record<WidgetType, (props: WidgetProps) => React.ReactElement> = {
  map: PlaceholderWidget,
  statistics: PlaceholderWidget,
  table: PlaceholderWidget,
  chartBar: PlaceholderWidget,
  chartLine: PlaceholderWidget,
  chartArea: PlaceholderWidget,
  chartPie: PlaceholderWidget,
  gauge: PlaceholderWidget,
  metricCard: PlaceholderWidget,
  text: PlaceholderWidget,
  image: PlaceholderWidget,
  html: PlaceholderWidget,
}

interface WidgetRendererProps {
  dashboardId: string
  widget: DashboardWidgetRecord
  /** Lazy-mount gate (research.md Decision 16) — `false` while scrolled out of view; `DashboardGrid`'s intersection-observer state (Phase 17 tunes the observer itself) supplies this. */
  isInView?: boolean
  canEdit: boolean
}

/**
 * Dispatches one widget to its concrete component, wrapped in its own error
 * boundary (research.md Decision 13 — one widget's failure never blanks the
 * rest of the dashboard) and toolbar (edit/remove/collapse, visible only in
 * edit mode with write permission).
 */
export function WidgetRenderer({ dashboardId, widget, isInView = true, canEdit }: WidgetRendererProps) {
  const isEditMode = useDashboardBuilderStore((state) => state.isEditMode)
  const selectWidget = useDashboardBuilderStore((state) => state.selectWidget)
  const queryClient = useQueryClient()
  const updateWidget = useUpdateWidget(dashboardId)
  const deleteWidget = useDeleteWidget(dashboardId)

  const { data, isLoading, dataUpdatedAt } = useWidgetData(dashboardId, widget.id, {
    enabled: isInView && !widget.isCollapsed,
  })

  const Component = WIDGET_REGISTRY[widget.type as WidgetType] ?? PlaceholderWidget
  const showToolbar = isEditMode && canEdit

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.widgetData(dashboardId, widget.id) })
  }

  return (
    <div className="flex h-full flex-col rounded-md border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1">
        <span className="truncate text-xs font-medium">{widget.title ?? widget.type}</span>
        <div className="flex items-center gap-1">
          {dataUpdatedAt > 0 && !widget.isCollapsed && (
            <span className="text-[10px] text-muted-foreground" title="Last updated">
              {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Refresh now" onClick={handleRefresh}>
            ↻
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={widget.isCollapsed ? `Expand ${widget.title ?? widget.type}` : `Collapse ${widget.title ?? widget.type}`}
            onClick={() => updateWidget.mutate({ widgetId: widget.id, input: { isCollapsed: !widget.isCollapsed } })}
          >
            {widget.isCollapsed ? "▸" : "▾"}
          </Button>
          {showToolbar && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Edit ${widget.title ?? widget.type}`}
                onClick={() => selectWidget(widget.id, widget.config as Record<string, unknown>)}
              >
                ✎
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={`Remove ${widget.title ?? widget.type}`}
                onClick={() => deleteWidget.mutate(widget.id)}
              >
                ✕
              </Button>
            </>
          )}
        </div>
      </div>

      {!widget.isCollapsed && (
        <div className="flex-1 overflow-auto">
          <ErrorBoundary fallback={<WidgetErrorFallback />}>
            {isLoading ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground" role="status">
                Loading…
              </div>
            ) : data?.dataSourceUnavailable ? (
              <WidgetUnavailableState />
            ) : (
              <Component widget={widget} data={data} isLoading={isLoading} isEditMode={isEditMode} />
            )}
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}
