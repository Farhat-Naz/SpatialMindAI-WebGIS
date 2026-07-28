import { useMemo } from "react"
import { Cell, Pie, PieChart, Tooltip } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { ChartWidgetBase, toChartData } from "./ChartWidgetBase"

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"]

export function PieChartWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { groupByAttribute?: string }
  // T303 — memoized so an unrelated re-render doesn't recompute this transform.
  const chartData = useMemo(
    () => (data && !data.dataSourceUnavailable ? toChartData(data.data, config.groupByAttribute) : []),
    [data, config.groupByAttribute],
  )

  return (
    <ChartWidgetBase data={chartData}>
      {(values) => (
        <PieChart>
          <Tooltip />
          <Pie data={values} dataKey="value" nameKey="name" outerRadius="80%">
            {values.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      )}
    </ChartWidgetBase>
  )
}
