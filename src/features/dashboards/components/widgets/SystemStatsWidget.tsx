import type { WidgetProps } from "../../types/widget.types"
import { formatStatValue } from "./widgetDataHelpers"

/** System Activity / Storage Usage widget (US4/FR-015) — `dataSourceType: "systemStats" | "storageStats"`, visible to any project member, values scoped to their accessible project. */
export function SystemStatsWidget({ data }: WidgetProps) {
  if (!data || data.dataSourceUnavailable) return null

  const payload = data.data as { data?: Record<string, unknown> } | undefined
  const stats = payload?.data ?? {}
  const entries = Object.entries(stats).filter(([, value]) => typeof value === "number")

  if (entries.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No statistics available.</p>
  }

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 p-3 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="text-right tabular-nums">{formatStatValue(value as number)}</dd>
        </div>
      ))}
    </dl>
  )
}
