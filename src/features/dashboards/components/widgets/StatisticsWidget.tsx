import type { WidgetProps } from "../../types/widget.types"
import { formatStatValue } from "./widgetDataHelpers"

/**
 * Multi-value statistics display (US2/FR-013) — every scalar key in the
 * resolved snapshot (`projectStats`/`layerStats`/`featureStats`) renders as
 * one labeled row; non-scalar values (e.g. `geometryTypes`, `layers`) are
 * omitted from this compact view (a Table Widget is the right widget for
 * tabular breakdowns).
 */
export function StatisticsWidget({ data }: WidgetProps) {
  if (!data || data.dataSourceUnavailable) return null

  const payload = data.data
  const nested =
    payload !== null && typeof payload === "object" && "data" in (payload as Record<string, unknown>)
      ? (payload as Record<string, unknown>).data
      : payload

  const entries =
    nested !== null && typeof nested === "object"
      ? Object.entries(nested as Record<string, unknown>).filter(
          ([, value]) => typeof value === "number" || typeof value === "string",
        )
      : []

  if (entries.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No statistics available.</p>
  }

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 p-3 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="text-right tabular-nums">{formatStatValue(value as number | string)}</dd>
        </div>
      ))}
    </dl>
  )
}
