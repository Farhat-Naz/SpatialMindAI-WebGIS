import { useMemo } from "react"
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { ChartWidgetBase, toChartData } from "./ChartWidgetBase"

export function AreaChartWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { groupByAttribute?: string }
  // T303 — memoized so an unrelated re-render doesn't recompute this transform.
  const chartData = useMemo(
    () => (data && !data.dataSourceUnavailable ? toChartData(data.data, config.groupByAttribute) : []),
    [data, config.groupByAttribute],
  )

  return (
    <ChartWidgetBase data={chartData}>
      {(values) => (
        <AreaChart data={values}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="value" fill="var(--primary)" stroke="var(--primary)" />
        </AreaChart>
      )}
    </ChartWidgetBase>
  )
}
