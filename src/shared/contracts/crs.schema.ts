import { z } from "zod"

/**
 * Coordinate reference system selection (specs/005-import-export, FR-060–FR-063).
 *
 * A CRS is identified either by its authority code (`EPSG:4326`) or by the
 * sentinel `CUSTOM`, in which case a parseable proj4 or WKT definition must
 * accompany it. PostGIS accepts a proj4 text target directly, so a custom
 * definition needs no `spatial_ref_sys` entry (research.md Decision 4).
 */

/** The sentinel used when the user supplies a definition outside the catalog. */
export const CUSTOM_CRS_CODE = "CUSTOM"

/** WGS84 — the platform's canonical storage SRID (Constitution Principle IV). */
export const WGS84_CODE = "EPSG:4326"

/** Web Mercator — the basemap projection, offered in the catalog (FR-060). */
export const WEB_MERCATOR_CODE = "EPSG:3857"

/** An `EPSG:` authority code, or the `CUSTOM` sentinel. */
export const crsCodeSchema = z.union([
  z.string().regex(/^EPSG:\d{4,6}$/, "Expected an authority code such as EPSG:4326"),
  z.literal(CUSTOM_CRS_CODE),
])
export type CrsCode = z.infer<typeof crsCodeSchema>

/** An output-CRS code for an export — `CUSTOM` is not offered on the export side. */
export const outputCrsCodeSchema = z
  .string()
  .regex(/^EPSG:\d{4,6}$/, "Expected an authority code such as EPSG:4326")

/**
 * A complete CRS selection. The `.refine` enforces the one rule that cannot be
 * expressed structurally: a `CUSTOM` code is meaningless without its
 * definition, and a definition is meaningless without the `CUSTOM` code.
 */
export const crsSelectionSchema = z
  .object({
    code: crsCodeSchema,
    customDefinition: z.string().trim().min(1).optional(),
  })
  .refine((value) => (value.code === CUSTOM_CRS_CODE) === (value.customDefinition !== undefined), {
    message: 'A custom coordinate system requires a definition, and a definition requires code "CUSTOM".',
    path: ["customDefinition"],
  })
export type CrsSelection = z.infer<typeof crsSelectionSchema>

/** Returns the numeric SRID for an authority code, or `null` for `CUSTOM`. */
export function toSrid(code: CrsCode): number | null {
  if (code === CUSTOM_CRS_CODE) return null
  return Number.parseInt(code.slice("EPSG:".length), 10)
}
