import type { ImportIssueCategory } from "@/shared/contracts/importIssue.schema"
import { IMPORT_ISSUE_MESSAGE_MAX_LENGTH } from "@/shared/contracts/importIssue.schema"

/**
 * User-safe message builders for every import failure category
 * (specs/005-import-export, T010; FR-057, FR-086).
 *
 * **No new `ApiErrorCode` is introduced by this feature.** The nine codes in
 * `src/shared/errors/apiError.ts` already cover every situation import
 * produces, and that file's own doc comment records that each addition beyond
 * the original five was made only when no existing code could carry the
 * meaning (research.md Decision 19). The mapping is documented below rather
 * than implemented as new types.
 *
 * | Situation                                                  | Code            |
 * |------------------------------------------------------------|-----------------|
 * | Malformed chunk body, bad CRS, oversized chunk               | `INVALID_INPUT` |
 * | Unknown job/layer, or no project access at all               | `NOT_FOUND`     |
 * | Viewer attempting an import or rollback                      | `FORBIDDEN`     |
 * | Chunk after cancel; complete/rollback on a terminal job       | `CONFLICT`      |
 * | Rate limit exceeded                                          | `RATE_LIMITED`  |
 * | Anything unrecognized                                        | `DATABASE_ERROR`|
 *
 * Every message below describes the defect without exposing internal detail —
 * no stack trace, no driver string, no identifier the user cannot act on.
 */

/** Truncates to the persisted message length so a builder can never produce an unstorable value. */
function clamp(message: string): string {
  return message.length <= IMPORT_ISSUE_MESSAGE_MAX_LENGTH
    ? message
    : `${message.slice(0, IMPORT_ISSUE_MESSAGE_MAX_LENGTH - 1)}…`
}

export const importIssueMessages = {
  invalidGeometry: (detail?: string) =>
    clamp(detail ? `The geometry could not be read: ${detail}` : "The feature has no readable geometry."),

  outOfRangeCoordinate: (value: number, axis: "longitude" | "latitude") =>
    clamp(
      `${axis === "longitude" ? "Longitude" : "Latitude"} ${value} is outside the valid range ` +
        `${axis === "longitude" ? "-180 to 180" : "-90 to 90"}.`,
    ),

  unsupportedGeometryType: (type: string) =>
    clamp(
      `Geometry type "${type}" is not supported. Supported types are Point, MultiPoint, ` +
        "LineString, MultiLineString, Polygon, and MultiPolygon.",
    ),

  invalidTopology: (reason?: string) =>
    clamp(reason ? `The geometry is not valid: ${reason}` : "The geometry is not topologically valid."),

  missingCoordinate: (column?: string) =>
    clamp(
      column
        ? `The "${column}" column is empty or not a number on this row.`
        : "This row has no usable coordinate.",
    ),

  duplicateInFile: (firstSeenAt: number) =>
    clamp(`Identical to the feature at position ${firstSeenAt} in this file.`),

  duplicateInLayer: () => "An identical feature already exists in this layer.",

  sanitizedAttribute: (key: string, reason: string) =>
    clamp(`The attribute "${key}" was adjusted before storage: ${reason}`),

  repairedGeometry: () => "The polygon ring was not closed and was closed automatically.",

  unsupportedContent: (what: string) => clamp(`${what} is not supported and was skipped.`),

  truncatedValue: (key: string, limit: number) =>
    clamp(`The value of "${key}" was longer than ${limit} characters and was truncated.`),
} satisfies Record<string, (...args: never[]) => string>

/** Short, human-readable label per category, for grouping in the validation report (FR-058). */
export const importIssueCategoryLabels: Record<ImportIssueCategory, string> = {
  invalid_geometry: "Invalid geometry",
  out_of_range_coordinate: "Coordinate out of range",
  unsupported_geometry_type: "Unsupported geometry type",
  invalid_topology: "Invalid topology",
  missing_coordinate: "Missing coordinate",
  duplicate_in_file: "Duplicate in file",
  duplicate_in_layer: "Duplicate in layer",
  sanitized_attribute: "Attribute adjusted",
  repaired_geometry: "Geometry repaired",
  unsupported_content: "Unsupported content skipped",
  truncated_value: "Value truncated",
}

/**
 * Categories that count as **rejections** — the feature was not imported.
 * Everything else is reported and counted separately, which is what keeps
 * SC-006's "imported + rejected + duplicate sums to total read" true.
 */
export const REJECTION_CATEGORIES: ReadonlySet<ImportIssueCategory> = new Set([
  "invalid_geometry",
  "out_of_range_coordinate",
  "unsupported_geometry_type",
  "invalid_topology",
  "missing_coordinate",
])

/** Categories that count as duplicates, tallied separately from rejections (FR-056). */
export const DUPLICATE_CATEGORIES: ReadonlySet<ImportIssueCategory> = new Set([
  "duplicate_in_file",
  "duplicate_in_layer",
])
