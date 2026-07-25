import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertProjectRole } from "@/server/auth/assertProjectRole"
import { NotFoundError, ValidationError } from "@/shared/errors/apiError"
import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"

export type MeasurementType = "distance" | "area" | "perimeter" | "radius" | "bearing" | "azimuth" | "coordinates"

export interface MeasurementHistoryRecord {
  id: string
  projectId: string
  userId: string
  measurementType: MeasurementType
  geometry: GeoJSONGeometry
  value: number | null
  unit: string | null
  label: string | null
  createdAt: Date
}

interface RawMeasurementRow {
  id: string
  projectId: string
  userId: string
  measurementType: string
  geometry: string
  value: number | null
  unit: string | null
  label: string | null
  createdAt: Date
}

function toRecord(row: RawMeasurementRow): MeasurementHistoryRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    measurementType: row.measurementType as MeasurementType,
    geometry: JSON.parse(row.geometry) as GeoJSONGeometry,
    value: row.value,
    unit: row.unit,
    label: row.label,
    createdAt: row.createdAt,
  }
}

/**
 * The PostGIS expression (and resulting unit) that recomputes `value` for
 * each measurement type (research.md Decision 8) — always derived from the
 * submitted geometry server-side, never trusted from the client's live
 * readout. `coordinates` has no scalar value (data-model.md).
 */
function buildValueExpression(measurementType: MeasurementType): { expr: Prisma.Sql; unit: string | null } {
  switch (measurementType) {
    case "distance":
    case "radius":
      return { expr: Prisma.sql`ST_Length(geometry::geography)`, unit: "meters" }
    case "area":
      return { expr: Prisma.sql`ST_Area(geometry::geography)`, unit: "squareMeters" }
    case "perimeter":
      return { expr: Prisma.sql`ST_Perimeter(geometry::geography)`, unit: "meters" }
    case "bearing":
    case "azimuth":
      return {
        expr: Prisma.sql`degrees(ST_Azimuth(ST_StartPoint(geometry), ST_EndPoint(geometry)))`,
        unit: "degrees",
      }
    case "coordinates":
      return { expr: Prisma.sql`NULL`, unit: null }
  }
}

/**
 * Saves a measurement (US3/FR-008). Validates the submitted geometry via
 * `ST_IsValid` (Constitution Principle IV) and recomputes `value`
 * server-side via PostGIS before insert — the persisted number is never
 * simply the client's live estimate taken on faith (research.md Decision 8).
 */
export async function saveMeasurement(
  projectId: string,
  userId: string,
  input: { measurementType: MeasurementType; geometry: GeoJSONGeometry; label?: string | null },
): Promise<MeasurementHistoryRecord> {
  await assertProjectRole(projectId, userId, "Editor")

  const geometryJson = JSON.stringify(input.geometry)
  const id = randomUUID()
  const { expr, unit } = buildValueExpression(input.measurementType)

  return prismaClient.$transaction(async (tx) => {
    const [{ valid }] = await tx.$queryRaw<{ valid: boolean }[]>`
      SELECT ST_IsValid(ST_GeomFromGeoJSON(${geometryJson})) AS valid
    `
    if (!valid) {
      throw new ValidationError("The submitted measurement geometry is not valid.")
    }

    await tx.$executeRaw`
      INSERT INTO "MeasurementHistory" (id, "projectId", "userId", "measurementType", geometry, value, unit, label, "createdAt")
      SELECT ${id}, ${projectId}, ${userId}, ${input.measurementType}, geometry, ${expr}, ${unit}, ${input.label ?? null}, NOW()
      FROM (SELECT ST_GeomFromGeoJSON(${geometryJson}) AS geometry) AS g
    `

    const rows = await tx.$queryRaw<RawMeasurementRow[]>`
      SELECT id, "projectId", "userId", "measurementType", ST_AsGeoJSON(geometry) AS geometry, value, unit, label, "createdAt"
      FROM "MeasurementHistory"
      WHERE id = ${id}
    `
    return toRecord(rows[0])
  })
}

export interface ListMeasurementsParams {
  cursor?: string
  limit?: number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Cursor-paginated measurement history for a project, newest first — same shape as `listAnalysisRunsForProject`. Any project member (Viewer+) may read. */
export async function listMeasurementsForProject(
  projectId: string,
  userId: string,
  params: ListMeasurementsParams,
): Promise<{ measurements: MeasurementHistoryRecord[]; nextCursor: string | null }> {
  await assertProjectRole(projectId, userId, "Viewer")

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)
  const cursorClause = params.cursor
    ? Prisma.sql`AND ("createdAt", id) < (SELECT "createdAt", id FROM "MeasurementHistory" WHERE id = ${params.cursor})`
    : Prisma.empty

  const rows = await prismaClient.$queryRaw<RawMeasurementRow[]>`
    SELECT id, "projectId", "userId", "measurementType", ST_AsGeoJSON(geometry) AS geometry, value, unit, label, "createdAt"
    FROM "MeasurementHistory"
    WHERE "projectId" = ${projectId} ${cursorClause}
    ORDER BY "createdAt" DESC, id DESC
    LIMIT ${limit + 1}
  `

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1].id : null

  return { measurements: pageRows.map(toRecord), nextCursor }
}

/** Deletes a saved measurement — creator or project Owner only, same rule as preset delete. */
export async function deleteMeasurement(measurementId: string, userId: string): Promise<void> {
  const existing = await prismaClient.measurementHistory.findUnique({ where: { id: measurementId } })
  if (!existing) {
    throw new NotFoundError(`No measurement found with id "${measurementId}".`)
  }

  if (existing.userId !== userId) {
    await assertProjectRole(existing.projectId, userId, "Owner")
  } else {
    await assertProjectRole(existing.projectId, userId, "Viewer")
  }

  await prismaClient.measurementHistory.delete({ where: { id: measurementId } })
}
