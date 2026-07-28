"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog"
import { Button } from "@/shared/components/ui/button"
// Deep imports, not the feature barrels: `database`'s barrel re-exports
// Leaflet-dependent map components, and `analysis`'s pulls in its panel UI —
// this widget-config surface only needs the plain data hooks
// (`import-export`/`analysis` document the same hazard for the same reason).
import { useLayers } from "@/features/database/hooks/useLayers"
import { useAnalysisRuns } from "@/features/analysis/hooks/useAnalysis"
import { useAddWidget, useUpdateWidget } from "../hooks/useWidgets"
import { useCreateFilter, useDashboardFilters, useDeleteFilter } from "../hooks/useDashboardFilters"
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import type { WidgetDataSourceType, WidgetType } from "../types/widget.types"
import type { AttributeFilterOperatorInput } from "@/shared/contracts/dashboardFilter.schema"

const ATTRIBUTE_OPERATORS: AttributeFilterOperatorInput[] = ["eq", "neq", "contains", "gt", "lt", "gte", "lte"]

const WIDGET_TYPES: WidgetType[] = [
  "map",
  "statistics",
  "table",
  "chartBar",
  "chartLine",
  "chartArea",
  "chartPie",
  "gauge",
  "metricCard",
  "text",
  "image",
  "html",
]

const NON_DATA_DRIVEN: WidgetType[] = ["text", "image", "html"]
const DATA_SOURCE_TYPES: WidgetDataSourceType[] = [
  "layer",
  "analysisRun",
  "projectStats",
  "layerStats",
  "featureStats",
  "activity",
  "systemStats",
  "storageStats",
]
const LAYER_BOUND_SOURCE_TYPES = new Set<WidgetDataSourceType>(["layer", "layerStats"])

/** Mirrors `shared/contracts/widget.schema.ts`'s `statisticType` enum. */
const STAT_TYPES = [
  "featureCount",
  "totalLength",
  "averageLength",
  "averageArea",
  "extent",
  "areaCalculation",
  "lengthCalculation",
  "centroid",
  "convexHull",
  "boundingBox",
  "densityAnalysis",
] as const

// Widget types whose `config` schema (widget.schema.ts) has at least one
// required field with no default — creating one of these with an empty
// `config: {}` fails server-side Zod validation (400), so this form must
// collect that field before submit is allowed.
const REQUIRES_STAT_TYPE = new Set<WidgetType>(["statistics", "gauge", "metricCard"])
const REQUIRES_CONTENT = new Set<WidgetType>(["text", "html"])
const REQUIRES_IMAGE_URL = new Set<WidgetType>(["image"])
const SHOWS_CHART_FIELDS = new Set<WidgetType>(["chartBar", "chartLine", "chartArea", "chartPie"])

interface WidgetConfigPanelProps {
  projectId: string
  dashboardId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Add/edit widget form (US2) — a type picker whose selection determines
 * which per-type config fields render (Phase 10 supplies each type's real
 * fields; this shell renders a generic JSON-shaped config editor for now)
 * and a data-source picker (T160) narrowed to valid choices per
 * `dataSourceType`.
 */
export function WidgetConfigPanel({ projectId, dashboardId, open, onOpenChange }: WidgetConfigPanelProps) {
  const selectedWidgetId = useDashboardBuilderStore((state) => state.selectedWidgetId)
  const selectedWidgetType = useDashboardBuilderStore((state) => state.selectedWidgetType)
  const draftWidgetConfig = useDashboardBuilderStore((state) => state.draftWidgetConfig)
  const setDraftWidgetConfig = useDashboardBuilderStore((state) => state.setDraftWidgetConfig)
  const clearSelectedWidget = useDashboardBuilderStore((state) => state.clearSelectedWidget)

  const [type, setType] = useState<WidgetType>("text")
  const [title, setTitle] = useState("")
  const [dataSourceType, setDataSourceType] = useState<WidgetDataSourceType | "">("")
  const [dataSourceId, setDataSourceId] = useState("")
  const [attributeKey, setAttributeKey] = useState("")
  const [attributeOperator, setAttributeOperator] = useState<AttributeFilterOperatorInput>("eq")
  const [attributeValue, setAttributeValue] = useState("")

  // Type-specific `config` fields (statistics/gauge/metricCard/text/html/image
  // each require at least one of these — see REQUIRES_* above).
  const [statType, setStatType] = useState("")
  const [statLabel, setStatLabel] = useState("")
  const [content, setContent] = useState("")
  const [gaugeMin, setGaugeMin] = useState("")
  const [gaugeMax, setGaugeMax] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [imageAlt, setImageAlt] = useState("")
  const [chartStatType, setChartStatType] = useState("")
  const [chartGroupBy, setChartGroupBy] = useState("")

  const addWidget = useAddWidget(dashboardId)
  const updateWidget = useUpdateWidget(dashboardId)
  const { data: layersData } = useLayers(projectId)
  const { data: runsData } = useAnalysisRuns(projectId)
  const { data: filtersData } = useDashboardFilters(dashboardId)
  const createFilter = useCreateFilter(dashboardId)
  const deleteFilter = useDeleteFilter(dashboardId)

  const isEditing = selectedWidgetId !== null
  const isDataDriven = !NON_DATA_DRIVEN.includes(type)
  const existingAttributeFilter = filtersData?.filters.find(
    (filter) => filter.widgetId === selectedWidgetId && filter.filterType === "attribute",
  )

  useEffect(() => {
    if (open && !isEditing) {
      setType("text")
      setTitle("")
      setDataSourceType("")
      setDataSourceId("")
      setDraftWidgetConfig({})
      setAttributeKey("")
      setAttributeOperator("eq")
      setAttributeValue("")
      setStatType("")
      setStatLabel("")
      setContent("")
      setGaugeMin("")
      setGaugeMax("")
      setImageUrl("")
      setImageAlt("")
      setChartStatType("")
      setChartGroupBy("")
    }
  }, [open, isEditing, setDraftWidgetConfig])

  // Syncs `type` from the widget actually being edited — the `!isEditing`
  // reset effect above never runs while editing, and `type`'s own picker UI
  // is hidden then too (only a *new* widget lets the user choose a type), so
  // without this `isDataDriven` would stay pinned to the "text" default and
  // hide the data-source picker (T160) and attribute filter (T252) for every
  // data-driven widget being edited.
  //
  // T252 also prefills the per-widget attribute filter form from its
  // persisted row here (distinct from the global filter bar's
  // draft-in-store lifecycle; a widget-scoped attribute filter saves
  // immediately, same as this form's other fields).
  useEffect(() => {
    if (open && isEditing) {
      if (selectedWidgetType) setType(selectedWidgetType)
      const config = existingAttributeFilter?.config as { key?: string; operator?: AttributeFilterOperatorInput; value?: string } | undefined
      setAttributeKey(config?.key ?? "")
      setAttributeOperator(config?.operator ?? "eq")
      setAttributeValue(config?.value ?? "")

      // Prefill the type-specific config fields from the widget's existing
      // `config` (seeded into `draftWidgetConfig` by `selectWidget`).
      const widgetConfig = (draftWidgetConfig ?? {}) as Record<string, unknown>
      setStatType(typeof widgetConfig.statType === "string" ? widgetConfig.statType : "")
      setStatLabel(typeof widgetConfig.label === "string" ? widgetConfig.label : "")
      setContent(typeof widgetConfig.content === "string" ? widgetConfig.content : "")
      setGaugeMin(typeof widgetConfig.min === "number" ? String(widgetConfig.min) : "")
      setGaugeMax(typeof widgetConfig.max === "number" ? String(widgetConfig.max) : "")
      setImageUrl(typeof widgetConfig.url === "string" ? widgetConfig.url : "")
      setImageAlt(typeof widgetConfig.alt === "string" ? widgetConfig.alt : "")
      setChartStatType(typeof widgetConfig.statType === "string" ? widgetConfig.statType : "")
      setChartGroupBy(typeof widgetConfig.groupByAttribute === "string" ? widgetConfig.groupByAttribute : "")
    }
    // Only re-sync when the panel opens for a (possibly new) selected widget — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, selectedWidgetId, selectedWidgetType])

  async function saveAttributeFilter() {
    if (!selectedWidgetId) return
    if (existingAttributeFilter) {
      await deleteFilter.mutateAsync(existingAttributeFilter.id)
    }
    if (attributeKey.trim()) {
      await createFilter.mutateAsync({
        widgetId: selectedWidgetId,
        filterType: "attribute",
        config: { key: attributeKey.trim(), operator: attributeOperator, value: attributeValue },
      })
    }
  }

  /** Builds `config` for the currently-selected `type` (widget.schema.ts's per-type shape) from this form's fields; falls back to the existing/draft config for types with no dedicated fields above (map, table). */
  function buildTypeConfig(): Record<string, unknown> {
    switch (type) {
      case "statistics":
      case "metricCard":
        return { statType, ...(statLabel.trim() ? { label: statLabel.trim() } : {}) }
      case "gauge":
        return { statType, min: Number(gaugeMin), max: Number(gaugeMax) }
      case "text":
      case "html":
        return { content }
      case "image":
        return { url: imageUrl.trim(), ...(imageAlt.trim() ? { alt: imageAlt.trim() } : {}) }
      case "chartBar":
      case "chartLine":
      case "chartArea":
      case "chartPie":
        return {
          ...(chartGroupBy.trim() ? { groupByAttribute: chartGroupBy.trim() } : {}),
          ...(chartStatType ? { statType: chartStatType } : {}),
        }
      default:
        return draftWidgetConfig ?? {}
    }
  }

  const canSubmit =
    (!REQUIRES_STAT_TYPE.has(type) || statType !== "") &&
    (!REQUIRES_CONTENT.has(type) || content.trim() !== "") &&
    (!REQUIRES_IMAGE_URL.has(type) || imageUrl.trim() !== "") &&
    (type !== "gauge" || (gaugeMin.trim() !== "" && gaugeMax.trim() !== ""))

  function handleSubmit() {
    const config = buildTypeConfig()
    if (isEditing && selectedWidgetId) {
      updateWidget.mutate({
        widgetId: selectedWidgetId,
        input: {
          title: title || null,
          dataSourceType: dataSourceType || null,
          dataSourceId: dataSourceId || null,
          config,
        },
      })
      if (isDataDriven) {
        void saveAttributeFilter()
      }
    } else {
      addWidget.mutate({
        type,
        title: title || undefined,
        dataSourceType: dataSourceType || undefined,
        dataSourceId: dataSourceId || undefined,
        config,
      })
    }
    onOpenChange(false)
    clearSelectedWidget()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit widget" : "Add widget"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {!isEditing && (
            <div className="flex flex-col gap-1">
              <label htmlFor="widget-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="widget-type"
                value={type}
                onChange={(event) => setType(event.target.value as WidgetType)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
              >
                {WIDGET_TYPES.map((widgetType) => (
                  <option key={widgetType} value={widgetType}>
                    {widgetType}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="widget-title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="widget-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
            />
          </div>

          {REQUIRES_STAT_TYPE.has(type) && (
            <div className="flex flex-col gap-1">
              <label htmlFor="widget-stat-type" className="text-sm font-medium">
                Statistic
              </label>
              <select
                id="widget-stat-type"
                value={statType}
                onChange={(event) => setStatType(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
              >
                <option value="">Choose a statistic…</option>
                {STAT_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(type === "statistics" || type === "metricCard") && (
            <div className="flex flex-col gap-1">
              <label htmlFor="widget-stat-label" className="text-sm font-medium">
                Label (optional)
              </label>
              <input
                id="widget-stat-label"
                type="text"
                value={statLabel}
                onChange={(event) => setStatLabel(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
              />
            </div>
          )}

          {type === "gauge" && (
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="widget-gauge-min" className="text-sm font-medium">
                  Min
                </label>
                <input
                  id="widget-gauge-min"
                  type="number"
                  value={gaugeMin}
                  onChange={(event) => setGaugeMin(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="widget-gauge-max" className="text-sm font-medium">
                  Max
                </label>
                <input
                  id="widget-gauge-max"
                  type="number"
                  value={gaugeMax}
                  onChange={(event) => setGaugeMax(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                />
              </div>
            </div>
          )}

          {REQUIRES_CONTENT.has(type) && (
            <div className="flex flex-col gap-1">
              <label htmlFor="widget-content" className="text-sm font-medium">
                Content
              </label>
              <textarea
                id="widget-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={4}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
              />
            </div>
          )}

          {type === "image" && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="widget-image-url" className="text-sm font-medium">
                  Image URL
                </label>
                <input
                  id="widget-image-url"
                  type="text"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="widget-image-alt" className="text-sm font-medium">
                  Alt text (optional)
                </label>
                <input
                  id="widget-image-alt"
                  type="text"
                  value={imageAlt}
                  onChange={(event) => setImageAlt(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                />
              </div>
            </>
          )}

          {SHOWS_CHART_FIELDS.has(type) && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="widget-chart-stat-type" className="text-sm font-medium">
                  Statistic (optional)
                </label>
                <select
                  id="widget-chart-stat-type"
                  value={chartStatType}
                  onChange={(event) => setChartStatType(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                >
                  <option value="">None</option>
                  {STAT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="widget-chart-group-by" className="text-sm font-medium">
                  Group by attribute (optional)
                </label>
                <input
                  id="widget-chart-group-by"
                  type="text"
                  value={chartGroupBy}
                  onChange={(event) => setChartGroupBy(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                />
              </div>
            </>
          )}

          {isDataDriven && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="widget-data-source-type" className="text-sm font-medium">
                  Data source
                </label>
                <select
                  id="widget-data-source-type"
                  value={dataSourceType}
                  onChange={(event) => {
                    setDataSourceType(event.target.value as WidgetDataSourceType)
                    setDataSourceId("")
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                >
                  <option value="">None</option>
                  {DATA_SOURCE_TYPES.map((sourceType) => (
                    <option key={sourceType} value={sourceType}>
                      {sourceType}
                    </option>
                  ))}
                </select>
              </div>

              {dataSourceType && LAYER_BOUND_SOURCE_TYPES.has(dataSourceType) ? (
                <div className="flex flex-col gap-1">
                  <label htmlFor="widget-data-source-id" className="text-sm font-medium">
                    Layer
                  </label>
                  <select
                    id="widget-data-source-id"
                    value={dataSourceId}
                    onChange={(event) => setDataSourceId(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                  >
                    <option value="">Choose a layer…</option>
                    {layersData?.map((layer) => (
                      <option key={layer.id} value={layer.id}>
                        {layer.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : dataSourceType === "analysisRun" ? (
                <div className="flex flex-col gap-1">
                  <label htmlFor="widget-data-source-id" className="text-sm font-medium">
                    Analysis run
                  </label>
                  <select
                    id="widget-data-source-id"
                    value={dataSourceId}
                    onChange={(event) => setDataSourceId(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                  >
                    <option value="">Choose a run…</option>
                    {runsData?.runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.operationType} — {new Date(run.createdAt).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {isEditing && (
                <div className="flex flex-col gap-1 border-t pt-3">
                  <span className="text-sm font-medium">Attribute filter</span>
                  <p className="text-xs text-muted-foreground">
                    Only this widget shows data matching this condition (US6 Acceptance Scenario 3) — separate from the dashboard&apos;s global filters.
                  </p>
                  <div className="flex gap-2">
                    <input
                      aria-label="Attribute key"
                      placeholder="Attribute key"
                      type="text"
                      value={attributeKey}
                      onChange={(event) => setAttributeKey(event.target.value)}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                    />
                    <select
                      aria-label="Attribute operator"
                      value={attributeOperator}
                      onChange={(event) => setAttributeOperator(event.target.value as AttributeFilterOperatorInput)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                    >
                      {ATTRIBUTE_OPERATORS.map((operator) => (
                        <option key={operator} value={operator}>
                          {operator}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Attribute value"
                      placeholder="Value"
                      type="text"
                      value={attributeValue}
                      onChange={(event) => setAttributeValue(event.target.value)}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {isEditing ? "Save changes" : "Add widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
