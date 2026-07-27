import proj4 from "proj4"
import parseWkt from "wkt-parser"
import { WEB_MERCATOR_CODE, WGS84_CODE } from "@/shared/contracts/crs.schema"
import type { BBox, CrsEntry, Position } from "../types/importExport.types"

/**
 * Coordinate reference system catalog and preview transforms
 * (specs/005-import-export, T008/T211–T212/T218; FR-060–FR-065).
 *
 * **This module is preview-and-export only.** The transform that produces
 * persisted geometry is PostGIS `ST_Transform`, applied inside the
 * chunk-commit statement (research.md Decision 4) — Constitution Principle IV
 * requires any spatial calculation whose result is persisted to be computed in
 * PostGIS. proj4 is used here for two things Principle IV explicitly permits:
 * transient UI feedback (the FR-064 preview), and export output, which is a
 * downloaded file rather than platform state.
 *
 * Every definition below is a **bundled literal**. A runtime lookup against
 * epsg.io or spatialreference.org is impossible in this application regardless
 * of preference: `next.config.ts` sets `connect-src 'self'`, so the request
 * would be blocked by CSP. Server-side `ST_Transform` is what gives access to
 * the full ~9,000-entry EPSG registry without bundling any of it.
 */

const WGS84_PROJ4 = "+proj=longlat +datum=WGS84 +no_defs"

/**
 * Selectable coordinate systems (FR-060). WGS84 and Web Mercator are required
 * by the spec; the rest are the national and continental grids most likely to
 * appear in a real Shapefile or CSV. A system outside this list is supported
 * through the custom-definition path (FR-063).
 */
export const CRS_CATALOG: readonly CrsEntry[] = [
  { code: WGS84_CODE, name: "WGS 84 (latitude/longitude)", proj4: WGS84_PROJ4 },
  {
    code: WEB_MERCATOR_CODE,
    name: "WGS 84 / Pseudo-Mercator (Web Mercator)",
    proj4:
      "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m " +
      "+nadgrids=@null +wktext +no_defs",
  },
  {
    code: "EPSG:27700",
    name: "OSGB36 / British National Grid",
    proj4:
      "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
      "+ellps=airy +datum=OSGB36 +units=m +no_defs",
  },
  {
    code: "EPSG:2154",
    name: "RGF93 / Lambert-93 (France)",
    proj4:
      "+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 " +
      "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  {
    code: "EPSG:25831",
    name: "ETRS89 / UTM zone 31N",
    proj4: "+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  {
    code: "EPSG:25832",
    name: "ETRS89 / UTM zone 32N",
    proj4: "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  {
    code: "EPSG:25833",
    name: "ETRS89 / UTM zone 33N",
    proj4: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  {
    code: "EPSG:31370",
    name: "Belge 1972 / Belgian Lambert 72",
    proj4:
      "+proj=lcc +lat_1=51.16666723333333 +lat_2=49.8333339 +lat_0=90 +lon_0=4.367486666666666 " +
      "+x_0=150000.013 +y_0=5400088.438 +ellps=intl +units=m +no_defs",
  },
  {
    code: "EPSG:28992",
    name: "Amersfoort / RD New (Netherlands)",
    proj4:
      "+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 " +
      "+x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs",
  },
  {
    code: "EPSG:3035",
    name: "ETRS89 / LAEA Europe",
    proj4:
      "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 " +
      "+towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
  {
    code: "EPSG:32633",
    name: "WGS 84 / UTM zone 33N",
    proj4: "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
  },
  {
    code: "EPSG:32644",
    name: "WGS 84 / UTM zone 44N",
    proj4: "+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs",
  },
  {
    code: "EPSG:24378",
    name: "Kalianpur 1975 / India zone I",
    proj4:
      "+proj=lcc +lat_1=32.5 +lat_0=32.5 +lon_0=68 +k_0=0.99878641 +x_0=2743196.4 " +
      "+y_0=914398.8 +ellps=evrstSS +units=m +no_defs",
  },
  {
    code: "EPSG:3395",
    name: "WGS 84 / World Mercator",
    proj4: "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs",
  },
  {
    code: "EPSG:5070",
    name: "NAD83 / Conus Albers (USA)",
    proj4:
      "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=23 +lon_0=-96 +x_0=0 +y_0=0 " +
      "+datum=NAD83 +units=m +no_defs",
  },
  {
    code: "EPSG:26910",
    name: "NAD83 / UTM zone 10N",
    proj4: "+proj=utm +zone=10 +datum=NAD83 +units=m +no_defs",
  },
  {
    code: "EPSG:28356",
    name: "GDA94 / MGA zone 56 (Australia)",
    proj4: "+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  },
] as const

/** Looks up a catalog entry by authority code. */
export function findCrs(code: string): CrsEntry | undefined {
  return CRS_CATALOG.find((entry) => entry.code === code)
}

/**
 * Parses a user-supplied coordinate system definition (FR-063). Accepts either a
 * proj4 string or a WKT definition of the kind found in a Shapefile `.prj`.
 *
 * Returns `null` rather than throwing when the definition is unusable, so the
 * caller can reject it with a clear message and **never apply it partially**.
 *
 * **The returned `proj4` field carries the definition in whichever of the two
 * formats was supplied** — it is not converted to proj4 syntax. Both consumers
 * accept both forms: proj4.js takes a WKT string directly, and PostGIS's
 * three-argument `ST_Transform(geometry, from_proj text, to_srid int)` does too.
 * The field is named for its role (the thing you hand a transformer), not for its
 * syntax.
 *
 * The two-argument `ST_Transform(geometry, to_proj text)` is the one form that
 * does **not** tolerate WKT — it returns the geometry unchanged instead of
 * erroring. `importJobRepository`'s `toCanonicalGeometry` therefore uses the
 * three-argument form; see its comment.
 */
export function parseCustomCrs(definition: string, name = "Custom coordinate system"): CrsEntry | null {
  const trimmed = definition.trim()
  if (trimmed.length === 0) return null

  // A proj4 string is recognized by its leading parameter token.
  if (trimmed.startsWith("+proj=") || trimmed.startsWith("+init=")) {
    return isUsableProj4(trimmed) ? { code: "CUSTOM", name, proj4: trimmed } : null
  }

  try {
    // `wkt-parser` returns a parameter object rather than a proj4 string;
    // proj4's published types accept only a registered definition name, so the
    // parsed object is registered under a stable key and used by that name —
    // the same technique `features/database/utils/reprojection.ts` established.
    const parsed = parseWkt(trimmed) as unknown as proj4.ProjectionDefinition
    proj4.defs("SPATIALMIND_CUSTOM_SOURCE", parsed)
    return isUsableProj4("SPATIALMIND_CUSTOM_SOURCE")
      ? { code: "CUSTOM", name, proj4: trimmed }
      : null
  } catch {
    return null
  }
}

/** Confirms a definition actually transforms, rather than merely parsing. */
function isUsableProj4(definition: string): boolean {
  try {
    const [x, y] = proj4(definition, WGS84_PROJ4, [0, 0])
    return Number.isFinite(x) && Number.isFinite(y)
  } catch {
    return false
  }
}

/** Resolves a code or custom definition to something proj4 can transform with. */
function toProj4(code: string, customDefinition?: string): string | null {
  if (code === "CUSTOM") {
    if (!customDefinition) return null
    const parsed = parseCustomCrs(customDefinition)
    return parsed?.proj4 ?? null
  }
  return findCrs(code)?.proj4 ?? null
}

/** Transforms one position from a source CRS to WGS84. Returns null if the CRS is unusable. */
export function transformToWgs84(
  position: Position,
  sourceCode: string,
  customDefinition?: string,
): Position | null {
  const definition = toProj4(sourceCode, customDefinition)
  if (!definition) return null
  try {
    const [lng, lat] = proj4(definition, WGS84_PROJ4, position)
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  } catch {
    return null
  }
}

/** Transforms one position from WGS84 to an output CRS — the export direction (FR-041). */
export function transformFromWgs84(
  position: Position,
  targetCode: string,
): Position | null {
  const definition = toProj4(targetCode)
  if (!definition) return null
  try {
    const [x, y] = proj4(WGS84_PROJ4, definition, position)
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  } catch {
    return null
  }
}

/**
 * Recursively transforms every `[x, y]` pair in a nested coordinate array,
 * preserving the nesting structure. Used by the export writers (FR-041) and by
 * the preview; never on the persisted import path.
 */
export function transformCoordinates<T>(coordinates: T, transform: (position: Position) => Position | null): T {
  if (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    const result = transform(coordinates as unknown as Position)
    return (result ?? coordinates) as unknown as T
  }
  if (Array.isArray(coordinates)) {
    return coordinates.map((entry) => transformCoordinates(entry, transform)) as unknown as T
  }
  return coordinates
}

export interface TransformPreview {
  positions: Position[]
  bbox: BBox | null
  /** False when the CRS could not be resolved or every sample failed to transform. */
  usable: boolean
}

/**
 * Transforms a sample of source positions and reports the resulting bounding
 * box, for the confirmation-gate preview (FR-064). Transient UI feedback —
 * never persisted, and re-run whenever the user changes the CRS selection.
 */
export function previewTransform(
  sample: Position[],
  sourceCode: string,
  customDefinition?: string,
): TransformPreview {
  const positions: Position[] = []
  for (const position of sample) {
    const transformed = transformToWgs84(position, sourceCode, customDefinition)
    if (transformed) positions.push(transformed)
  }

  if (positions.length === 0) {
    return { positions: [], bbox: null, usable: false }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const [x, y] of positions) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  return { positions, bbox: [minX, minY, maxX, maxY], usable: true }
}

/**
 * Reports whether a transformed bounding box falls inside valid geographic
 * bounds (FR-065).
 *
 * A false result is the single most valuable signal this feature produces: it
 * catches projected coordinates about to be imported as if they were degrees —
 * the failure mode that silently places data in the wrong hemisphere. The
 * import may still proceed, but only behind an explicit second confirmation
 * (SC-010). It also catches reversed latitude/longitude ordering.
 */
export function isBboxPlausible(bbox: BBox | null): boolean {
  if (!bbox) return false
  const [minX, minY, maxX, maxY] = bbox
  return (
    minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90 && minX <= maxX && minY <= maxY
  )
}
