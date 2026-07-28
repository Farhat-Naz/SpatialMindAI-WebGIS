"use client"

import { useEffect } from "react"
import { Button } from "@/shared/components/ui/button"
import { useLayers } from "@/features/database/hooks/useLayers"
import { useCreateFilter, useDashboardFilters, useDeleteFilter } from "../hooks/useDashboardFilters"
import { useDashboardFilterStore } from "../store/dashboardFilterStore"
import type { DashboardFilterRecord } from "../types/dashboard.types"

interface DashboardFilterBarProps {
  projectId: string
  dashboardId: string
}

type DateConfig = { from?: string; to?: string }
type LayerConfig = { layerIds?: string[] }
type ProjectConfig = { projectIds?: string[] }
type SpatialConfig = { geometry?: unknown }

function configFor(filters: DashboardFilterRecord[], filterType: DashboardFilterRecord["filterType"]) {
  return filters.find((filter) => filter.filterType === filterType)?.config
}

function toDateInputValue(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : ""
}

/**
 * Global filter control row (US6/T246–T251/T256) — date, layer, project,
 * and spatial filters, wired to `dashboardFilterStore` (T111) for live,
 * pre-save reactivity (Acceptance Scenario 1/2/4) and `useDashboardFilters`
 * (T103) for persistence (Acceptance Scenario 5). Deliberately independent
 * of `dashboardBuilderStore.isEditMode` — a read-only viewer can still
 * filter (Phase 7's store-split rationale).
 *
 * The per-widget attribute filter (Acceptance Scenario 3) lives in
 * `WidgetConfigPanel` instead (T252) — distinct from this global bar.
 */
export function DashboardFilterBar({ projectId, dashboardId }: DashboardFilterBarProps) {
  const { data } = useDashboardFilters(dashboardId)
  const activeGlobalFilters = useDashboardFilterStore((state) => state.activeGlobalFilters)
  const hasUnsavedFilterChanges = useDashboardFilterStore((state) => state.hasUnsavedFilterChanges)
  const setGlobalFilter = useDashboardFilterStore((state) => state.setGlobalFilter)
  const clearGlobalFilter = useDashboardFilterStore((state) => state.clearGlobalFilter)
  const resetToSaved = useDashboardFilterStore((state) => state.resetToSaved)
  const createFilter = useCreateFilter(dashboardId)
  const deleteFilter = useDeleteFilter(dashboardId)
  const { data: layers } = useLayers(projectId)

  // T256/FR-021/SC-005 — repopulate the working copy from the last-saved
  // rows whenever the dashboard's persisted filters (re)load, so reopening
  // the dashboard shows the previously-saved filters, not an empty bar.
  useEffect(() => {
    if (data) resetToSaved(data.filters)
  }, [data, resetToSaved])

  const dateConfig = configFor(activeGlobalFilters, "date") as DateConfig | undefined
  const layerConfig = configFor(activeGlobalFilters, "layer") as LayerConfig | undefined
  const projectConfig = configFor(activeGlobalFilters, "project") as ProjectConfig | undefined
  const spatialConfig = configFor(activeGlobalFilters, "spatial") as SpatialConfig | undefined

  function handleDateChange(field: "from" | "to", value: string) {
    const next: DateConfig = { ...dateConfig, [field]: value ? new Date(value).toISOString() : undefined }
    if (!next.from && !next.to) {
      clearGlobalFilter("date")
    } else {
      setGlobalFilter("date", next)
    }
  }

  function handleLayerChange(selected: string[]) {
    if (selected.length === 0) {
      clearGlobalFilter("layer")
    } else {
      setGlobalFilter("layer", { layerIds: selected } satisfies LayerConfig)
    }
  }

  function handleProjectToggle(checked: boolean) {
    if (checked) {
      setGlobalFilter("project", { projectIds: [projectId] } satisfies ProjectConfig)
    } else {
      clearGlobalFilter("project")
    }
  }

  /** T256 — "Save filters": reconciles the working copy against the persisted rows. There is no update endpoint (contracts/client-api.md), so a changed filter is deleted and recreated rather than patched in place. */
  async function handleSaveFilters() {
    const saved = data?.filters.filter((filter) => filter.widgetId === null) ?? []

    for (const savedFilter of saved) {
      const stillActive = activeGlobalFilters.some((filter) => filter.filterType === savedFilter.filterType)
      if (!stillActive) {
        await deleteFilter.mutateAsync(savedFilter.id)
      }
    }

    for (const draft of activeGlobalFilters) {
      const existing = saved.find((filter) => filter.filterType === draft.filterType)
      if (existing) {
        await deleteFilter.mutateAsync(existing.id)
      }
      await createFilter.mutateAsync({ filterType: draft.filterType, config: draft.config as Record<string, unknown> })
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-4 border-b bg-muted/40 px-4 py-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-from" className="text-xs font-medium text-muted-foreground">
          From
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={toDateInputValue(dateConfig?.from)}
          onChange={(event) => handleDateChange("from", event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-to" className="text-xs font-medium text-muted-foreground">
          To
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={toDateInputValue(dateConfig?.to)}
          onChange={(event) => handleDateChange("to", event.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-layers" className="text-xs font-medium text-muted-foreground">
          Layers
        </label>
        <select
          id="filter-layers"
          multiple
          value={layerConfig?.layerIds ?? []}
          onChange={(event) => handleLayerChange(Array.from(event.target.selectedOptions).map((option) => option.value))}
          className="h-16 min-w-40 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
        >
          {layers?.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <input
          type="checkbox"
          checked={Boolean(projectConfig?.projectIds?.includes(projectId))}
          onChange={(event) => handleProjectToggle(event.target.checked)}
        />
        This project only
      </label>

      {Boolean(spatialConfig?.geometry) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Spatial filter active</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => clearGlobalFilter("spatial")}>
            Clear
          </Button>
        </div>
      )}

      <Button type="button" size="sm" onClick={() => void handleSaveFilters()} disabled={!hasUnsavedFilterChanges}>
        Save filters
      </Button>
    </div>
  )
}
