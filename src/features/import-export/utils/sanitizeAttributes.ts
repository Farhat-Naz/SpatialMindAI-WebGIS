import type { ImportIssueCategory } from "@/shared/contracts/importIssue.schema"
import { importIssueMessages } from "./importErrors"

/**
 * Attribute normalization during preflight (specs/005-import-export, T083;
 * FR-054).
 *
 * **This is the reporting tier, not the guarantee.** The chunk endpoint
 * re-applies the same normalization server-side in
 * `src/server/http/importRouteHelpers.ts` before anything is stored, because
 * parsing happens in the browser and the endpoint must assume a hostile caller
 * (research.md Decision 18, FR-084). Two tiers with two different jobs, stated
 * explicitly in plan.md's Security table:
 *
 * - here: tell the user what will be adjusted, *before* they confirm
 * - server: make it actually true, whatever the client sent
 *
 * That is why this function returns the list of transformations while the server
 * one returns only the cleaned entries. This module must never become the only
 * place sanitization happens.
 *
 * Composes with — and does not modify — `propertiesToAttributes` from
 * `src/shared/contracts/geoJsonImport.schema.ts`, so Map Editing's existing
 * import path is untouched (research.md Decision 20).
 */

/**
 * C0 and C1 control characters. Stripped from every key and value because they
 * corrupt rendering, break structured log output, and can smuggle terminal
 * escape sequences into an operator's console.
 *
 * Kept numerically identical to the server-side constant of the same name; the
 * two are asserted to agree by `sanitizeAttributes.test.ts`.
 */
const CONTROL_CHARACTERS = /[\x00-\x1F\x7F-\x9F]/g

/** Maximum attribute value length before truncation (FR-054). */
export const ATTRIBUTE_VALUE_MAX_LENGTH = 2000

/** Maximum attribute key length; DBF and most GIS formats are far shorter. */
export const ATTRIBUTE_KEY_MAX_LENGTH = 255

/** Placeholder for a key that sanitizes down to nothing. */
const UNNAMED_KEY = "unnamed"

/** One adjustment made to one attribute, surfaced to the user as an issue (FR-054). */
export interface AttributeTransformation {
  category: Extract<ImportIssueCategory, "sanitized_attribute" | "truncated_value">
  key: string
  message: string
}

export interface SanitizeResult {
  properties: Record<string, string>
  transformations: AttributeTransformation[]
}

/**
 * Flattens one source property value to the string form `FeatureAttribute`
 * stores (FR-015, FR-016).
 *
 * `null` and `undefined` return null so the caller **omits** the key entirely
 * rather than storing the text `"null"` — a stored `"null"` is
 * indistinguishable from a genuine string and silently corrupts the data
 * (FR-015).
 *
 * Objects and arrays become compact JSON: a nested value has no scalar
 * representation, and compact JSON at least round-trips (FR-016).
 */
function flattenValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    // A circular structure cannot be serialized. Dropping the attribute is
    // better than storing "[object Object]", which carries no information.
    return null
  }
}

/**
 * Normalizes one feature's raw properties into the stored attribute set,
 * reporting every adjustment made.
 *
 * Duplicate keys are resolved deterministically (`ward`, `ward_2`, `ward_3`)
 * **before** insert rather than after: `FeatureAttribute` carries
 * `@@unique([featureId, key])`, so an unresolved collision would abort the whole
 * chunk transaction rather than affecting one feature (research.md Decision 20).
 */
export function sanitizeAttributes(properties: Record<string, unknown> | null | undefined): SanitizeResult {
  const result: Record<string, string> = {}
  const transformations: AttributeTransformation[] = []
  if (!properties) return { properties: result, transformations }

  for (const [rawKey, rawValue] of Object.entries(properties)) {
    const flattened = flattenValue(rawValue)
    if (flattened === null) continue

    let key = rawKey.replace(CONTROL_CHARACTERS, "").trim()
    if (key !== rawKey) {
      transformations.push({
        category: "sanitized_attribute",
        key: rawKey,
        message: importIssueMessages.sanitizedAttribute(rawKey, "unsupported characters were removed"),
      })
    }
    if (key.length === 0) {
      key = UNNAMED_KEY
      transformations.push({
        category: "sanitized_attribute",
        key: rawKey,
        message: importIssueMessages.sanitizedAttribute(rawKey, `renamed to "${UNNAMED_KEY}" because it was empty`),
      })
    }
    if (key.length > ATTRIBUTE_KEY_MAX_LENGTH) {
      key = key.slice(0, ATTRIBUTE_KEY_MAX_LENGTH)
      transformations.push({
        category: "sanitized_attribute",
        key: rawKey,
        message: importIssueMessages.sanitizedAttribute(rawKey, "the name was shortened"),
      })
    }

    let value = flattened.replace(CONTROL_CHARACTERS, "")
    if (value.length > ATTRIBUTE_VALUE_MAX_LENGTH) {
      value = value.slice(0, ATTRIBUTE_VALUE_MAX_LENGTH)
      transformations.push({
        category: "truncated_value",
        key,
        message: importIssueMessages.truncatedValue(key, ATTRIBUTE_VALUE_MAX_LENGTH),
      })
    }

    let candidate = key
    let suffix = 2
    while (Object.prototype.hasOwnProperty.call(result, candidate)) {
      candidate = `${key}_${suffix}`
      suffix += 1
    }
    if (candidate !== key) {
      transformations.push({
        category: "sanitized_attribute",
        key,
        message: importIssueMessages.sanitizedAttribute(key, `renamed to "${candidate}" because the name repeated`),
      })
    }

    result[candidate] = value
  }

  return { properties: result, transformations }
}
