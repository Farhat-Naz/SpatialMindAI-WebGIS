"use client"

/**
 * Result display for Summarize and the individual Statistics operations
 * (US6, FR-016) — one labelled card per statistic.
 *
 * Cards are filtered by the layer's own geometry types rather than shown
 * unconditionally: area is meaningless for a point layer, and rendering
 * "0 m²" there reads as a measured zero instead of "not applicable". When
 * a run's payload carries no `geometryTypes` (the single-statistic
 * operations return just their one value), whatever statistics are present
 * are shown as-is.
 */

/** The `resultData` shape `buildSummarySql` produces; every field is optional so a single-statistic run renders through the same component. */
export interface StatisticsResult {
  featureCount?: number
  geometryTypes?: string[]
  totalAreaSquareMeters?: number
  averageAreaSquareMeters?: number
  totalLengthMeters?: number
  averageLengthMeters?: number
  boundingBox?: unknown
  centroid?: unknown
  convexHull?: unknown
  extent?: unknown
  /** densityAnalysis's own payload. */
  convexHullAreaSquareMeters?: number
  densityPerSquareMeter?: number
}

interface StatisticsCardsProps {
  result: StatisticsResult
}

/** Which geometry family a statistic needs before it is worth showing. */
type AppliesTo = "always" | "POLYGON" | "LINESTRING"

interface CardSpec {
  key: keyof StatisticsResult
  label: string
  appliesTo: AppliesTo
  format: (value: unknown) => string
}

const NUMBER_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

/** Formats a numeric statistic with an optional unit suffix; anything non-numeric renders as an em dash rather than "NaN". */
function numberFormatter(suffix = ""): (value: unknown) => string {
  return (value) => (typeof value === "number" ? `${NUMBER_FORMAT.format(value)}${suffix}` : "—")
}

/** GeoJSON statistics are shown as their coordinates rather than raw JSON, which is unreadable at card size. */
function formatGeometry(value: unknown): string {
  if (!value || typeof value !== "object") return "—"
  const geometry = value as { type?: string; coordinates?: unknown }
  if (!geometry.type) return "—"
  return `${geometry.type}: ${JSON.stringify(geometry.coordinates)}`
}

const CARD_SPECS: CardSpec[] = [
  { key: "featureCount", label: "Feature count", appliesTo: "always", format: numberFormatter() },
  { key: "totalAreaSquareMeters", label: "Total area", appliesTo: "POLYGON", format: numberFormatter(" m²") },
  { key: "averageAreaSquareMeters", label: "Average area", appliesTo: "POLYGON", format: numberFormatter(" m²") },
  { key: "totalLengthMeters", label: "Total length", appliesTo: "LINESTRING", format: numberFormatter(" m") },
  { key: "averageLengthMeters", label: "Average length", appliesTo: "LINESTRING", format: numberFormatter(" m") },
  { key: "densityPerSquareMeter", label: "Density (features/m²)", appliesTo: "always", format: numberFormatter() },
  {
    key: "convexHullAreaSquareMeters",
    label: "Convex hull area",
    appliesTo: "always",
    format: numberFormatter(" m²"),
  },
  { key: "boundingBox", label: "Bounding box", appliesTo: "always", format: formatGeometry },
  { key: "centroid", label: "Centroid", appliesTo: "always", format: formatGeometry },
  { key: "convexHull", label: "Convex hull", appliesTo: "always", format: formatGeometry },
  { key: "extent", label: "Extent", appliesTo: "always", format: formatGeometry },
]

function isApplicable(spec: CardSpec, geometryTypes: string[] | undefined): boolean {
  if (spec.appliesTo === "always") return true
  // Without a geometry-type hint (single-statistic runs) a present value is
  // shown — the user asked for that statistic specifically.
  if (!geometryTypes) return true
  return geometryTypes.includes(spec.appliesTo)
}

export function StatisticsCards({ result }: StatisticsCardsProps) {
  const visible = CARD_SPECS.filter(
    (spec) => result[spec.key] !== undefined && result[spec.key] !== null && isApplicable(spec, result.geometryTypes),
  )

  if (visible.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground">This run produced no statistics.</p>
    )
  }

  return (
    <dl aria-label="Statistics" className="grid grid-cols-2 gap-2 p-3">
      {visible.map((spec) => (
        <div key={spec.key} className="rounded-md border border-input p-2">
          <dt className="text-xs text-muted-foreground">{spec.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">{spec.format(result[spec.key])}</dd>
        </div>
      ))}
    </dl>
  )
}
