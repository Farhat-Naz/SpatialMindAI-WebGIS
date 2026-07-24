/**
 * PostGIS SQL-fragment builders for every geoprocessing operation (spec
 * 005-spatial-analysis-geoprocessing). This file never imports
 * `prismaClient` or opens a database connection — it only constructs
 * `Prisma.Sql` fragments via the `Prisma.sql` tagged template, which
 * `analysisRepository.ts` (the only file in this feature holding a live
 * connection) executes inside its own transaction. Kept separate from the
 * repository purely for the readability of 22 operations' worth of SQL,
 * per plan.md's Repository Layer section — not a second repository.
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

// Populated by each user story phase (T030+): one exported `buildXSql`
// function per operation, added here without modifying this file's own
// existing exports.
