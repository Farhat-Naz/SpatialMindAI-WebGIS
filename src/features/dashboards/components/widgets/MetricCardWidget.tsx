import type { WidgetProps } from "../../types/widget.types"
import { extractStatValue, formatStatValue } from "./widgetDataHelpers"

/** A single prominent value display (US2/FR-012 live refresh via `useWidgetData`'s poll, T162's "last updated" indicator lives in `WidgetRenderer`'s chrome). */
export function MetricCardWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { statType?: string; label?: string }
  const value = data && !data.dataSourceUnavailable ? extractStatValue(data.data, config.statType ?? "") : undefined

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
      {config.label && <span className="text-sm text-muted-foreground">{config.label}</span>}
      <span className="text-3xl font-semibold tabular-nums">{formatStatValue(value)}</span>
    </div>
  )
}
