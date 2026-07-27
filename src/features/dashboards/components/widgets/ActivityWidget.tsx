import type { WidgetProps } from "../../types/widget.types"

interface ActivityRow {
  id: string
  action: string
  targetType: string
  createdAt: string
}

/** User Activity widget (US4/FR-014) — `dataSourceType: "activity"` binding to 006's `Activity` feed via `useWidgetData`. */
export function ActivityWidget({ data }: WidgetProps) {
  if (!data || data.dataSourceUnavailable) return null

  const payload = data.data as { activities?: ActivityRow[] } | undefined
  const activities = payload?.activities ?? []

  if (activities.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No recent activity.</p>
  }

  return (
    <ul className="flex flex-col divide-y overflow-auto text-sm">
      {activities.map((activity) => (
        <li key={activity.id} className="flex items-center justify-between gap-2 p-2">
          <span>
            {activity.action} {activity.targetType}
          </span>
          <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  )
}
