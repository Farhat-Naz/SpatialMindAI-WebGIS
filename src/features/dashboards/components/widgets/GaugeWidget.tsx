import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts"
import type { WidgetProps } from "../../types/widget.types"
import { extractStatValue, formatStatValue } from "./widgetDataHelpers"

interface GaugeThreshold {
  value: number
  color: string
}

/** Radial/progress gauge (US2/US4, research.md Decision 3 — built on Recharts primitives), configurable thresholds + live value via `useWidgetData`'s poll (FR-012). */
export function GaugeWidget({ widget, data }: WidgetProps) {
  const config = widget.config as { statType?: string; min: number; max: number; thresholds?: GaugeThreshold[] }
  const raw = data && !data.dataSourceUnavailable ? extractStatValue(data.data, config.statType ?? "") : undefined
  const numericValue = typeof raw === "number" ? raw : 0

  const clamped = Math.min(config.max, Math.max(config.min, numericValue))
  const percent = config.max > config.min ? ((clamped - config.min) / (config.max - config.min)) * 100 : 0

  const activeColor =
    [...(config.thresholds ?? [])].sort((a, b) => b.value - a.value).find((threshold) => numericValue >= threshold.value)
      ?.color ?? "var(--primary)"

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
      <ResponsiveContainer width="100%" height="80%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: "value", value: percent, fill: activeColor }]} startAngle={180} endAngle={0}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" background cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <span className="text-lg font-semibold tabular-nums">{formatStatValue(raw)}</span>
    </div>
  )
}
