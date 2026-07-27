import { sourceGeometrySchema } from "@/shared/contracts/importChunk.schema"
import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import type { NormalizedFeature } from "../../types/importExport.types"
import { importIssueMessages } from "../../utils/importErrors"
import { sanitizeAttributes } from "../../utils/sanitizeAttributes"

/**
 * The shared GeoJSON-feature normalization step (specs/005-import-export).
 *
 * Three of the four parsers — GeoJSON, Shapefile (via `shpjs`), and KML (via
 * `@tmcw/togeojson`) — all end up holding an array of GeoJSON-shaped features
 * and need the identical next step: validate the geometry structurally, flatten
 * and sanitize the properties, and record an issue for anything adjusted or
 * dropped. Only CSV differs, because it builds its geometry from columns rather
 * than reading one.
 *
 * Factored out so that step exists once. Writing it per parser would mean three
 * places for the geometry vocabulary and the lenient-vs-reject rule to drift
 * apart.
 */

/** The six supported geometry type names, for distinguishing "unsupported" from "malformed". */
const SUPPORTED_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
])

export interface NormalizeOptions {
  signal?: AbortSignal
  /**
   * Extra attributes merged into every feature before sanitization — the KML
   * parser's folder path (FR-025), or a Shapefile's source filename when an
   * archive held several.
   */
  extraProperties?: (index: number) => Record<string, unknown>
  /** Maps an array index to the position the user will recognize (CSV is 1-based; the rest are 0-based). */
  toSourcePosition?: (index: number) => number
}

export interface NormalizeResult {
  features: NormalizedFeature[]
  warnings: ImportIssueDraft[]
}

/**
 * Normalizes an array of GeoJSON-shaped features.
 *
 * Individual unreadable features become issues rather than aborting the whole
 * file: Lenient is the platform default (FR-006), and Strict is implemented as
 * auto-rollback after commit rather than as a different parse path
 * (research.md Decision 6). A parser that threw on the first bad feature would
 * make Lenient impossible.
 *
 * The abort signal is checked every 5,000 features rather than every one:
 * checking per feature measurably dominates the loop at 100,000 features, and a
 * 5,000-feature granularity still cancels well inside SC-004's 2-second target.
 */
export function normalizeFeatures(
  rawFeatures: readonly unknown[],
  options: NormalizeOptions = {},
): NormalizeResult {
  const features: NormalizedFeature[] = []
  const warnings: ImportIssueDraft[] = []
  const position = options.toSourcePosition ?? ((index: number) => index)

  for (let index = 0; index < rawFeatures.length; index += 1) {
    if (index % 5000 === 0) options.signal?.throwIfAborted()

    const sourcePosition = position(index)
    const raw = rawFeatures[index]

    if (!raw || typeof raw !== "object") {
      warnings.push({
        sourcePosition,
        category: "invalid_geometry",
        message: importIssueMessages.invalidGeometry("the entry is not an object"),
      })
      continue
    }

    const entry = raw as { geometry?: unknown; properties?: unknown }

    if (entry.geometry === null || entry.geometry === undefined) {
      // A null geometry is legal GeoJSON but cannot be stored: `Feature.geometry`
      // is NOT NULL, and a feature with no location has nothing to draw.
      warnings.push({
        sourcePosition,
        category: "invalid_geometry",
        message: importIssueMessages.invalidGeometry("the feature has a null geometry"),
      })
      continue
    }

    const declaredType = (entry.geometry as { type?: unknown }).type
    const parsed = sourceGeometrySchema.safeParse(entry.geometry)
    if (!parsed.success) {
      // An out-of-vocabulary type gets the specific "not supported" message; a
      // structurally broken member of a supported type gets the parser's reason.
      const known = typeof declaredType === "string" && SUPPORTED_TYPES.has(declaredType)
      warnings.push({
        sourcePosition,
        category: known ? "invalid_geometry" : "unsupported_geometry_type",
        message: known
          ? importIssueMessages.invalidGeometry(parsed.error.issues[0]?.message)
          : importIssueMessages.unsupportedGeometryType(
              typeof declaredType === "string" ? declaredType : "unknown",
            ),
      })
      continue
    }

    const merged = {
      ...((entry.properties ?? {}) as Record<string, unknown>),
      ...(options.extraProperties?.(index) ?? {}),
    }
    const { properties, transformations } = sanitizeAttributes(merged)
    for (const transformation of transformations) {
      warnings.push({ sourcePosition, category: transformation.category, message: transformation.message })
    }

    features.push({ sourcePosition, geometry: parsed.data, properties })
  }

  return { features, warnings }
}
