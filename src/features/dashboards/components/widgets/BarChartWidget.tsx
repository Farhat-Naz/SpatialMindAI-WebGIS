import { useMemo } from "react"
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { ChartWidgetBase, toChartData } from "./ChartWidgetBase"

export function BarChartWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { groupByAttribute?: string }
  // T303 — memoized so an unrelated re-render (e.g. a sibling widget's own
  // poll tick, or edit-mode toggling) doesn't recompute this transform.
  const chartData = useMemo(
    () => (data && !data.dataSourceUnavailable ? toChartData(data.data, config.groupByAttribute) : []),
    [data, config.groupByAttribute],
  )

  return (
    <ChartWidgetBase data={chartData}>
      {(values) => (
        <BarChart data={values}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="var(--primary)" />
        </BarChart>
      )}
    </ChartWidgetBase>
  )
}
