import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { ChartWidgetBase, toChartData } from "./ChartWidgetBase"

export function AreaChartWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { groupByAttribute?: string }
  const chartData = data && !data.dataSourceUnavailable ? toChartData(data.data, config.groupByAttribute) : []

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
