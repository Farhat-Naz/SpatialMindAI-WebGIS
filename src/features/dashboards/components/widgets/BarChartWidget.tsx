import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { ChartWidgetBase, toChartData } from "./ChartWidgetBase"

export function BarChartWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { groupByAttribute?: string }
  const chartData = data && !data.dataSourceUnavailable ? toChartData(data.data, config.groupByAttribute) : []

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
