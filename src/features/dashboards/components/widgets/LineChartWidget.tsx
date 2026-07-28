import { useMemo } from "react"
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { ChartWidgetBase, toChartData } from "./ChartWidgetBase"

export function LineChartWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { groupByAttribute?: string }
  // T303 — memoized so an unrelated re-render doesn't recompute this transform.
  const chartData = useMemo(
    () => (data && !data.dataSourceUnavailable ? toChartData(data.data, config.groupByAttribute) : []),
    [data, config.groupByAttribute],
  )

  return (
    <ChartWidgetBase data={chartData}>
      {(values) => (
        <LineChart data={values}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="var(--primary)" />
        </LineChart>
      )}
    </ChartWidgetBase>
  )
}
