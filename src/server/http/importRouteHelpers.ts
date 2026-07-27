import { NextResponse, type NextRequest } from "next/server"
import { assertWgs84Ranges, type ChunkFeature } from "@/shared/contracts/importChunk.schema"
import { propertiesToAttributes } from "@/shared/contracts/geoJsonImport.schema"
import { WGS84_CODE } from "@/shared/contracts/crs.schema"
import type { ImportChunkFeature } from "@/server/repositories/importJobRepository"
import { logger } from "@/shared/lib/logger"

/**
 * Shared helpers for the eight import Route Handlers
 * (specs/005-import-export, Phase 4).
 *
 * Extracted rather than copy-pasted into each file: `respond` in particular is
 * identical across every handler in this codebase, and eight more copies of it
 * would be eight places to forget the structured request log.
 */

/**
 * Emits the structured `{ method, path, status, durationMs }` request log
 * every Route Handler in this codebase produces (Constitution: Logging), then
 * returns the response. A 204 gets a bodyless response — `NextResponse.json`
 * would serialize `null` and throw.
 */
export function respond(
  request: NextRequest,
  startedAt: number,
  status: number,
  body: unknown,
): NextResponse {
  logger.request({
    method: request.method,
    path: new URL(request.url).pathname,
    status,
    durationMs: Date.now() - startedAt,
  })
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(body, { status })
}

/** Parses `?cursor=&limit=` with the same validation the existing exports route uses. */
export function parsePagingParams(
  request: NextRequest,
): { cursor?: string; limit?: number } | { error: string } {
  const url = new URL(request.url)
  const cursor = url.searchParams.get("cursor") ?? undefined
  const limitParam = url.searchParams.get("limit")
  const limit = limitParam ? Number(limitParam) : undefined

  if (limitParam && (Number.isNaN(limit) || (limit ?? 0) <= 0)) {
    return { error: "limit must be a positive number." }
  }
  return { cursor, limit }
}

/**
 * C0 and C1 control characters. Stripped from every imported attribute key and
 * value because they corrupt rendering, break structured log output, and can
 * smuggle terminal escape sequences into an operator's console.
 */
const CONTROL_CHARACTERS = /[\x00-\x1F\x7F-\x9F]/g

/**
 * Maximum attribute value length before truncation (FR-054). Generous enough
 * that a normal description survives, bounded enough that a pathological cell
 * cannot bloat the attribute table.
 */
const ATTRIBUTE_VALUE_MAX_LENGTH = 2000

/** Maximum attribute key length; DBF and most GIS formats are far shorter. */
const ATTRIBUTE_KEY_MAX_LENGTH = 255

/**
 * Server-side attribute sanitization (FR-084).
 *
 * Deliberately **re-applied here** even though the client's preflight already
 * sanitized: because parsing happens in the browser, the chunk endpoint is a
 * public API that must assume a hostile caller (research.md Decision 18). The
 * client-side pass exists for the summary and the user's benefit; this pass is
 * the actual guarantee.
 *
 * Duplicate keys are resolved before insert rather than after: `FeatureAttribute`
 * carries `@@unique([featureId, key])`, so an unresolved collision would abort
 * the whole chunk transaction rather than affecting one feature.
 */
export function sanitizeAttributeEntries(
  entries: { key: string; value: string }[],
): { key: string; value: string }[] {
  const seen = new Set<string>()
  const result: { key: string; value: string }[] = []

  for (const entry of entries) {
    let key = entry.key.replace(CONTROL_CHARACTERS, "").trim()
    const value = entry.value.replace(CONTROL_CHARACTERS, "").slice(0, ATTRIBUTE_VALUE_MAX_LENGTH)

    if (key.length === 0) key = "unnamed"
    if (key.length > ATTRIBUTE_KEY_MAX_LENGTH) key = key.slice(0, ATTRIBUTE_KEY_MAX_LENGTH)

    // Deterministic de-duplication: `ward`, `ward_2`, `ward_3`.
    let candidate = key
    let suffix = 2
    while (seen.has(candidate)) {
      candidate = `${key}_${suffix}`
      suffix += 1
    }
    seen.add(candidate)
    result.push({ key: candidate, value })
  }

  return result
}

/**
 * Converts a validated chunk feature into the repository's input shape.
 *
 * Reuses `propertiesToAttributes` from `geoJsonImport.schema.ts` for the
 * flattening rule — the same function Map Editing's import path uses — then
 * layers sanitization on top. That module is not modified (research.md
 * Decision 20).
 */
export function toRepositoryFeature(feature: ChunkFeature): ImportChunkFeature {
  return {
    sourcePosition: feature.sourcePosition,
    geometry: feature.geometry,
    attributes: sanitizeAttributeEntries(propertiesToAttributes(feature.properties)),
  }
}

/**
 * Applies WGS84 coordinate-range validation when — and only when — the job's
 * source CRS is EPSG:4326.
 *
 * For any projected source, range checking the *input* would be wrong: an
 * EPSG:27700 easting of 530000 is perfectly valid and would fail a plus/minus
 * 180 test. Those bounds belong to `ST_Transform`'s output, which PostGIS
 * produces.
 *
 * Returns the first offending feature's position and message, or null.
 */
export function findOutOfRangeFeature(
  features: ChunkFeature[],
  sourceCrs: string,
): { sourcePosition: number; message: string } | null {
  if (sourceCrs !== WGS84_CODE) return null

  for (const feature of features) {
    const result = assertWgs84Ranges(feature.geometry)
    if (!result.valid) {
      return { sourcePosition: feature.sourcePosition, message: result.message }
    }
  }
  return null
}
