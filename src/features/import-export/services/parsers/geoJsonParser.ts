import { WGS84_CODE } from "@/shared/contracts/crs.schema"
import type { ParseFile } from "../../types/importExport.types"
import { normalizeFeatures } from "./normalizeFeatures"

/**
 * GeoJSON parser (specs/005-import-export, T076; FR-014–FR-016).
 *
 * **Adds no dependency**: `JSON.parse` is the whole parser. The five source
 * formats cost six new packages between them, and GeoJSON contributes none of
 * them (research.md Decision 10).
 *
 * Geometry is emitted **in the source CRS, untransformed** — the persisted
 * transform is `ST_Transform`, server-side (research.md Decision 4).
 */

/**
 * Resolves the file's coordinate system.
 *
 * RFC 7946 mandates WGS84 and removed the `crs` member, so EPSG:4326 is the
 * correct default. A legacy `crs` member from the 2008 draft is still honoured
 * when present, because older tooling continues to emit projected GeoJSON with
 * one, and silently reading those coordinates as degrees is exactly the
 * wrong-hemisphere failure FR-065 exists to catch. The user can always override
 * the detected value in `CrsSelector` (FR-062).
 */
function detectCrs(root: Record<string, unknown>): string {
  const crs = root.crs
  if (!crs || typeof crs !== "object") return WGS84_CODE

  const name = (crs as { properties?: { name?: unknown } }).properties?.name
  if (typeof name !== "string") return WGS84_CODE

  // Accepted forms: "EPSG:27700", "urn:ogc:def:crs:EPSG::27700", "EPSG::27700".
  const match = /EPSG:{1,2}(\d{4,6})/i.exec(name)
  return match ? `EPSG:${match[1]}` : WGS84_CODE
}

/**
 * Parses a GeoJSON file into normalized features.
 *
 * A non-`FeatureCollection` root is rejected with a message naming both what was
 * expected and what was found (FR-014), rather than a generic parse failure: a
 * bare `Feature` or a raw geometry is by far the most common mistake, and the
 * user needs to know which of the three they supplied to fix it.
 */
export const parseGeoJson: ParseFile = async (file, options) => {
  const text = await file.text()
  options.signal?.throwIfAborted()

  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    throw new Error("This file is not valid JSON, so it cannot be read as GeoJSON.")
  }

  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("A GeoJSON import must be a FeatureCollection object at the top level.")
  }

  const rootObject = root as Record<string, unknown>
  const rootType = rootObject.type

  if (rootType !== "FeatureCollection") {
    const found = typeof rootType === "string" ? `a ${rootType}` : "an object with no type"
    throw new Error(
      `A GeoJSON import must be a FeatureCollection at the top level, but this file is ${found}. ` +
        'Wrap it in { "type": "FeatureCollection", "features": [ … ] } and try again.',
    )
  }

  if (!Array.isArray(rootObject.features)) {
    throw new Error('This FeatureCollection has no "features" array.')
  }

  const { features, warnings } = normalizeFeatures(rootObject.features as unknown[], {
    signal: options.signal,
  })

  return { features, detectedCrs: detectCrs(rootObject), warnings }
}
