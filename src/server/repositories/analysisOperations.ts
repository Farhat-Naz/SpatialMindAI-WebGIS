import { Prisma } from "@prisma/client"

/**
 * PostGIS SQL-fragment builders for every geoprocessing operation (spec
 * 005-spatial-analysis-geoprocessing, extended by 007-spatial-analysis).
 * This file never imports `prismaClient` or opens a database connection —
 * it only constructs `Prisma.Sql` fragments via the `Prisma.sql` tagged
 * template, which `analysisRepository.ts` (the only file in this feature
 * holding a live connection) executes inside its own transaction. Kept
 * separate from the repository purely for the readability of this many
 * operations' worth of SQL, per plan.md's Repository Layer section — not a
 * second repository.
 */

/** Every builder receives the already ownership-verified input layer ids it needs. */
export interface OperationContext {
  inputLayerIds: string[]
}

/** Converts a user-facing distance + unit into meters, the unit every PostGIS `geography` function in this file expects. */
export function toMeters(distance: number, unit: "meters" | "kilometers" | "feet" | "miles"): number {
  switch (unit) {
    case "meters":
      return distance
    case "kilometers":
      return distance * 1000
    case "feet":
      return distance * 0.3048
    case "miles":
      return distance * 1609.344
  }
}

/** Converts a user-facing area + unit into square meters, the unit every PostGIS `ST_Area(geography)` call in this file returns (007, Phase 13). */
export function toSquareMeters(
  area: number,
  unit: "squareMeters" | "squareKilometers" | "squareFeet" | "squareMiles",
): number {
  switch (unit) {
    case "squareMeters":
      return area
    case "squareKilometers":
      return area * 1_000_000
    case "squareFeet":
      return area * 0.09290304
    case "squareMiles":
      return area * 2_589_988.110336
  }
}

/**
 * One keyset-paginated page of a layer's feature ids, ordered by `id`
 * ascending (research.md Decision 5) — every chunked operation builder in
 * later phases starts its chunk with this fragment, bounding per-chunk
 * memory/query cost regardless of the layer's total size (spec Performance,
 * 100,000-feature target). Pass `afterId: null` for the first page; the
 * caller re-invokes with the previous page's last returned id until a page
 * comes back shorter than `pageSize`.
 */
export function buildChunkPageSql(layerId: string, afterId: string | null, pageSize: number): Prisma.Sql {
  const cursor = afterId ? Prisma.sql`AND id > ${afterId}` : Prisma.empty
  return Prisma.sql`
    SELECT id FROM "Feature"
    WHERE "layerId" = ${layerId} ${cursor}
    ORDER BY id ASC
    LIMIT ${pageSize}
  `
}

// Populated by each user story phase (T030+/T121+): one exported `buildXSql`
// function per operation, added here without modifying this file's own
// existing exports.
