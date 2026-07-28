import type { DashboardWidgetRecord } from "./dashboard.types"

/**
 * Every widget kind this feature renders (data-model.md `DashboardWidget.type`).
 * Adding a 13th type requires touching only this union plus one new
 * `WidgetRenderer` case and component (research.md Decision 1).
 */
export type WidgetType =
  | "map"
  | "statistics"
  | "table"
  | "chartBar"
  | "chartLine"
  | "chartArea"
  | "chartPie"
  | "gauge"
  | "metricCard"
  | "text"
  | "image"
  | "html"

/** The five data-source kinds a data-driven widget can be bound to (data-model.md `dataSourceType`). */
export type WidgetDataSourceType =
  | "layer"
  | "analysisRun"
  | "projectStats"
  | "layerStats"
  | "featureStats"
  | "activity"
  | "systemStats"
  | "storageStats"

/** Text/Image/HTML widgets have no data source; every other type requires one. */
export const NON_DATA_DRIVEN_WIDGET_TYPES: readonly WidgetType[] = ["text", "image", "html"]

/**
 * Result shape every `useWidgetData`-backed hook resolves to. `dataSourceUnavailable`
 * is data, not a thrown error (research.md Decision 13) — a widget renders its
 * "unavailable" state as an ordinary branch when this is `true`.
 *
 * `filteredEmpty` (US6/FR-022, T257) marks a *successful* fetch that an
 * active filter (date/layer/project/attribute/spatial) narrowed to zero
 * results — distinct from `dataSourceUnavailable` (a deleted source, not a
 * filtered-to-zero result).
 */
export type WidgetDataResult<T = unknown> =
  | { dataSourceUnavailable: true }
  | { dataSourceUnavailable: false; data: T; filteredEmpty?: boolean }

/** One active filter as sent from client to `GET .../widgets/:widgetId/data` (US6) — a plain `{filterType, config}` pair, global or resolved for this widget. */
export interface ActiveWidgetFilter {
  filterType: "date" | "layer" | "project" | "attribute" | "spatial"
  config: unknown
}

/**
 * Props every per-type widget component receives from `WidgetRenderer`
 * (Phase 9) — the contract each of the twelve widget components implements.
 */
export interface WidgetProps<T = unknown> {
  widget: DashboardWidgetRecord
  data: WidgetDataResult<T> | undefined
  isLoading: boolean
  isEditMode: boolean
}
