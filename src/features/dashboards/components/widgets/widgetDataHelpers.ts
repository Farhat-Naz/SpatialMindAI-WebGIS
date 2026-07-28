/**
 * Extracts a named statistic from a resolved widget data payload. For the
 * `projectStats`/`layerStats`/`featureStats`/`systemStats`/`storageStats`
 * source types, `useWidgetData` resolves to an `AnalyticsSnapshotResponse`
 * (`{ data, computedAt, isCached }`) — the actual numbers live one level
 * down, in `data.data`. Shared by every widget that reads one named
 * statistic (Metric Card, Statistics, Gauge) so none re-derives this
 * unwrapping independently.
 */
/**
 * Maps a `statisticType` enum value (widget.schema.ts) to the actual output
 * field name(s) its underlying builder uses. `analysisOperations.ts`'s
 * `buildStatisticsSql`/`buildSummarySql` (007) name their JSON output after
 * the *measurement*, not the *operation selector* — e.g. `totalLength`
 * selects the operation, but its result key is `totalLengthMeters` — so
 * most enum values don't literally appear as keys in the response.
 * `projectStats`/`featureStats`/`storageStats` (this feature's own
 * platform-count aggregates, dashboardAnalyticsRepository.ts) have no
 * per-stat selection at all; `totalFeatures` is their closest analog to
 * `featureCount`, included as a fallback. `systemStats`
 * (`dashboardCount`/`widgetCount`) has no analog to any enum value and is
 * intentionally not aliased — a Gauge/Metric Card bound to it has no single
 * value to show regardless of `statType`.
 */
const STAT_FIELD_ALIASES: Record<string, string[]> = {
  featureCount: ["totalFeatures"],
  totalLength: ["totalLengthMeters"],
  averageLength: ["averageLengthMeters"],
  averageArea: ["averageAreaSquareMeters"],
  areaCalculation: ["totalAreaSquareMeters"],
  lengthCalculation: ["totalLengthMeters"],
  densityAnalysis: ["densityPerSquareMeter"],
}

export function extractStatValue(payload: unknown, statType: string): number | string | undefined {
  if (payload === null || typeof payload !== "object") return undefined

  const record = payload as Record<string, unknown>
  const nested = record.data !== null && typeof record.data === "object" ? (record.data as Record<string, unknown> | null) : null

  for (const key of [statType, ...(STAT_FIELD_ALIASES[statType] ?? [])]) {
    const fromTop = record[key]
    if (typeof fromTop === "number" || typeof fromTop === "string") return fromTop

    const fromNested = nested?.[key]
    if (typeof fromNested === "number" || typeof fromNested === "string") return fromNested
  }

  return undefined
}

/** Formats a numeric statistic value for display, with sensible decimal rounding for large/measured values. */
export function formatStatValue(value: number | string | undefined): string {
  if (value === undefined) return "—"
  if (typeof value === "string") return value
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)
}
