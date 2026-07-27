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
import { useDashboardBuilderStore } from "../store/dashboardBuilderStore"
import type { WidgetDataSourceType, WidgetType } from "../types/widget.types"

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
  const draftWidgetConfig = useDashboardBuilderStore((state) => state.draftWidgetConfig)
  const setDraftWidgetConfig = useDashboardBuilderStore((state) => state.setDraftWidgetConfig)
  const clearSelectedWidget = useDashboardBuilderStore((state) => state.clearSelectedWidget)

  const [type, setType] = useState<WidgetType>("text")
  const [title, setTitle] = useState("")
  const [dataSourceType, setDataSourceType] = useState<WidgetDataSourceType | "">("")
  const [dataSourceId, setDataSourceId] = useState("")

  const addWidget = useAddWidget(dashboardId)
  const updateWidget = useUpdateWidget(dashboardId)
  const { data: layersData } = useLayers(projectId)
  const { data: runsData } = useAnalysisRuns(projectId)

  const isEditing = selectedWidgetId !== null
  const isDataDriven = !NON_DATA_DRIVEN.includes(type)

  useEffect(() => {
    if (open && !isEditing) {
      setType("text")
      setTitle("")
      setDataSourceType("")
      setDataSourceId("")
      setDraftWidgetConfig({})
    }
  }, [open, isEditing, setDraftWidgetConfig])

  function handleSubmit() {
    const config = draftWidgetConfig ?? {}
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {isEditing ? "Save changes" : "Add widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
