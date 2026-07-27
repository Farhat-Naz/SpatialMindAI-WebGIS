import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { ChartWidgetBase, toChartData } from "./ChartWidgetBase"

export function LineChartWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { groupByAttribute?: string }
  const chartData = data && !data.dataSourceUnavailable ? toChartData(data.data, config.groupByAttribute) : []

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
