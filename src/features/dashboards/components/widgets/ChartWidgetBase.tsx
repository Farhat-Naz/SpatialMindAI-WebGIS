"use client"

import { useState, type ReactNode } from "react"
import { ResponsiveContainer } from "recharts"
import { Button } from "@/shared/components/ui/button"

export interface ChartDatum {
  name: string
  value: number
}

interface ChartWidgetBaseProps {
  data: ChartDatum[]
  children: (data: ChartDatum[]) => ReactNode
}

/**
 * Shared chart container every variant (Bar/Line/Area/Pie/Gauge) composes —
 * responsive sizing plus the accessible data-table fallback research.md
 * Decision 14 requires (a chart is inherently visual; the toggle gives a
 * screen reader user the same numbers a sighted user reads off the chart).
 * The fallback renders the *exact* `data` the chart itself was given, never
 * a re-derived copy, so the two can never disagree.
 */
export function ChartWidgetBase({ data, children }: ChartWidgetBaseProps) {
  const [showTable, setShowTable] = useState(false)

  if (data.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No data to chart.</p>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end p-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowTable((value) => !value)}>
          {showTable ? "Show chart" : "Show data table"}
        </Button>
      </div>
      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-1 text-left font-medium">Name</th>
              <th className="p-1 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.name} className="border-b last:border-0">
                <td className="p-1">{datum.name}</td>
                <td className="p-1 text-right tabular-nums">{datum.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            {children(data) as never}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

/**
 * Best-effort transform of a resolved widget data payload into chart-ready
 * `{name, value}` pairs: a flat stats object's numeric keys become one bar
 * per key; a feature/row list groups by `groupByAttribute`, counting
 * occurrences per distinct value.
 */
export function toChartData(payload: unknown, groupByAttribute?: string): ChartDatum[] {
  if (payload === null || typeof payload !== "object") return []

  const record = payload as Record<string, unknown>
  const nested = "data" in record && typeof record.data === "object" && record.data !== null ? record.data : record

  if (Array.isArray(nested)) {
    if (!groupByAttribute) return []
    const counts = new Map<string, number>()
    for (const row of nested as Record<string, unknown>[]) {
      const key = String(row[groupByAttribute] ?? "unknown")
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value }))
  }

  if (Array.isArray((nested as Record<string, unknown>).features)) {
    return toChartData({ data: (nested as Record<string, unknown>).features }, groupByAttribute)
  }

  return Object.entries(nested as Record<string, unknown>)
    .filter(([, value]) => typeof value === "number")
    .map(([name, value]) => ({ name, value: value as number }))
}
