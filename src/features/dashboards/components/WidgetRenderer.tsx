"use client"

import { useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ErrorBoundary } from "@/shared/components/ErrorBoundary"
import { Button } from "@/shared/components/ui/button"
import { useDeleteWidget, useUpdateWidget, useWidgetData } from "../hooks/useWidgets"
import { queryKeys } from "../services/queryKeys"
import { dashboardExportService } from "../services/dashboardExportService"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import type { DashboardWidgetRecord } from "../types/dashboard.types"
import type { WidgetProps, WidgetType } from "../types/widget.types"
import { ActivityWidget } from "./widgets/ActivityWidget"
import { AreaChartWidget } from "./widgets/AreaChartWidget"
import { BarChartWidget } from "./widgets/BarChartWidget"
import { GaugeWidget } from "./widgets/GaugeWidget"
import { HtmlWidget } from "./widgets/HtmlWidget"
import { ImageWidget } from "./widgets/ImageWidget"
import { LineChartWidget } from "./widgets/LineChartWidget"
import { MapWidget } from "./widgets/MapWidget"
import { MetricCardWidget } from "./widgets/MetricCardWidget"
import { PieChartWidget } from "./widgets/PieChartWidget"
import { StatisticsWidget } from "./widgets/StatisticsWidget"
import { SystemStatsWidget } from "./widgets/SystemStatsWidget"
import { TableWidget } from "./widgets/TableWidget"
import { TextWidget } from "./widgets/TextWidget"
import { WidgetErrorFallback } from "./WidgetErrorFallback"
import { WidgetUnavailableState } from "./WidgetUnavailableState"
import { WidgetEmptyFilterState } from "./WidgetEmptyFilterState"

/**
 * The one place `DashboardWidget.type` dispatches to a concrete component
 * (research.md Decision 1). Adding a 13th widget type requires touching only
 * this map plus one new component file (T146).
 *
 * `dataSourceType: "systemStats" | "storageStats"` both dispatch through
 * `statistics`'s `SystemStatsWidget` when the widget's own `type` is
 * `statistics`/`metricCard` and the data source is platform-scoped — the
 * registry key is `DashboardWidget.type` (visual shape), not
 * `dataSourceType` (data origin), so System/Storage widgets are ordinary
 * `statistics`-typed widgets pointed at a platform-scoped source, not a
 * 13th visual type.
 */
export const WIDGET_REGISTRY: Record<WidgetType, (props: WidgetProps) => React.ReactNode> = {
  map: MapWidget,
  statistics: StatisticsWidget,
  table: TableWidget,
  chartBar: BarChartWidget,
  chartLine: LineChartWidget,
  chartArea: AreaChartWidget,
  chartPie: PieChartWidget,
  gauge: GaugeWidget,
  metricCard: MetricCardWidget,
  text: TextWidget,
  image: ImageWidget,
  html: HtmlWidget,
}

/** Widgets bound to `dataSourceType: "activity" | "systemStats" | "storageStats"` render via these dedicated components regardless of `WIDGET_REGISTRY`'s type-based entry, since those data sources need a distinctly-shaped display no single visual `type` naturally covers. */
export function resolveWidgetComponent(widget: DashboardWidgetRecord): (props: WidgetProps) => React.ReactNode {
  if (widget.dataSourceType === "activity") return ActivityWidget
  if (widget.dataSourceType === "systemStats" || widget.dataSourceType === "storageStats") return SystemStatsWidget
  return WIDGET_REGISTRY[widget.type as WidgetType] ?? TextWidget
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

  const Component = resolveWidgetComponent(widget)
  const showToolbar = isEditMode && canEdit
  const contentRef = useRef<HTMLDivElement>(null)

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.widgetData(dashboardId, widget.id) })
  }

  /** T263 — exports just this widget's own rendering, scoped to its content DOM node (not the whole dashboard, T262's job). */
  async function handleExportImage() {
    if (!contentRef.current) return
    const safeTitle = (widget.title ?? widget.type).trim() || "widget"
    await dashboardExportService.exportWidgetAsImage(contentRef.current, `${safeTitle}.png`)
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
          {!widget.isCollapsed && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={`Export ${widget.title ?? widget.type} as image`}
              onClick={() => void handleExportImage()}
            >
              ⤓
            </Button>
          )}
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
                onClick={() => selectWidget(widget.id, widget.config as Record<string, unknown>, widget.type as WidgetType)}
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
        <div className="flex-1 overflow-auto" ref={contentRef}>
          <ErrorBoundary fallback={<WidgetErrorFallback />}>
            {isLoading ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground" role="status">
                Loading…
              </div>
            ) : data?.dataSourceUnavailable ? (
              <WidgetUnavailableState />
            ) : data && !data.dataSourceUnavailable && data.filteredEmpty ? (
              <WidgetEmptyFilterState />
            ) : (
              <Component widget={widget} data={data} isLoading={isLoading} isEditMode={isEditMode} />
            )}
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}
