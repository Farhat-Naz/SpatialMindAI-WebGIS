/**
 * Extracts a named statistic from a resolved widget data payload. For the
 * `projectStats`/`layerStats`/`featureStats`/`systemStats`/`storageStats`
 * source types, `useWidgetData` resolves to an `AnalyticsSnapshotResponse`
 * (`{ data, computedAt, isCached }`) — the actual numbers live one level
 * down, in `data.data`. Shared by every widget that reads one named
 * statistic (Metric Card, Statistics, Gauge) so none re-derives this
 * unwrapping independently.
 */
export function extractStatValue(payload: unknown, statType: string): number | string | undefined {
  if (payload === null || typeof payload !== "object") return undefined

  const record = payload as Record<string, unknown>
  if (statType in record) {
    const value = record[statType]
    return typeof value === "number" || typeof value === "string" ? value : undefined
  }

  const nested = record.data
  if (nested !== null && typeof nested === "object" && statType in (nested as Record<string, unknown>)) {
    const value = (nested as Record<string, unknown>)[statType]
    return typeof value === "number" || typeof value === "string" ? value : undefined
  }

  return undefined
}

/** Formats a numeric statistic value for display, with sensible decimal rounding for large/measured values. */
export function formatStatValue(value: number | string | undefined): string {
  if (value === undefined) return "—"
  if (typeof value === "string") return value
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)
}
