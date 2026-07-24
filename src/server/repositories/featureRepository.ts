import { randomUUID } from "node:crypto"
import { Prisma, type FeatureAttribute, type FeatureStyle } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { NotFoundError, ValidationError } from "@/shared/errors/apiError"
import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"

export interface StyleInput {
  color: string
  strokeWidth?: number
  fillOpacity?: number
}

export interface AttributeInput {
  key: string
  value: string
}

export interface FeatureRecord {
  id: string
  layerId: string
  geometry: GeoJSONGeometry
  attributes: AttributeInput[]
  style: StyleInput | null
  createdAt: Date
  updatedAt: Date
}

interface RawFeatureRow {
  id: string
  layerId: string
  geometry: string
  createdAt: Date
  updatedAt: Date
}

/** Returns the layer only if it belongs to a project owned by `ownerId`. */
async function getLayerScopedToOwner(layerId: string, ownerId: string) {
  return prismaClient.layer.findFirst({
    where: { id: layerId, project: { ownerId } },
  })
}

/** Returns the bare feature row only if it belongs to a layer owned (via its project) by `ownerId`. */
async function getFeatureScopedToOwner(featureId: string, ownerId: string) {
  const rows = await prismaClient.$queryRaw<RawFeatureRow[]>`
    SELECT f.id, f."layerId", ST_AsGeoJSON(f.geometry) AS geometry, f."createdAt", f."updatedAt"
    FROM "Feature" f
    JOIN "Layer" l ON l.id = f."layerId"
    JOIN "Project" p ON p.id = l."projectId"
    WHERE f.id = ${featureId} AND p."ownerId" = ${ownerId}
  `
  return rows[0] ?? null
}

function toAttributeInput(rows: FeatureAttribute[]): AttributeInput[] {
  return rows.map((row) => ({ key: row.key, value: row.value }))
}

function toStyleInput(row: FeatureStyle | null): StyleInput | null {
  if (!row) return null
  return {
    color: row.color,
    strokeWidth: row.strokeWidth ?? undefined,
    fillOpacity: row.fillOpacity ?? undefined,
  }
}

/**
 * Reads a feature's attributes/style and assembles the full `FeatureRecord`.
 * Accepts either the module-level `prismaClient` (default, for read paths
 * outside a transaction) or an open `Prisma.TransactionClient` — callers
 * inside `$transaction` MUST pass `tx` here, since a read via a *different*
 * connection cannot see that transaction's own uncommitted writes (Postgres
 * read-committed isolation): passing the wrong client silently returns
 * `style: null`/empty `attributes` for a feature just created/updated with
 * a style in the same transaction, even though the write itself succeeded.
 */
async function assembleFeature(
  row: RawFeatureRow,
  client: Prisma.TransactionClient | typeof prismaClient = prismaClient,
): Promise<FeatureRecord> {
  const [attributes, style] = await Promise.all([
    client.featureAttribute.findMany({ where: { featureId: row.id } }),
    client.featureStyle.findUnique({ where: { featureId: row.id } }),
  ])

  return {
    id: row.id,
    layerId: row.layerId,
    geometry: JSON.parse(row.geometry) as GeoJSONGeometry,
    attributes: toAttributeInput(attributes),
    style: toStyleInput(style),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Checks PostGIS topological validity for a GeoJSON geometry (Research Decision 3). */
async function assertGeometryIsValid(
  tx: Prisma.TransactionClient,
  geometryJson: string,
): Promise<void> {
  const result = await tx.$queryRaw<{ valid: boolean }[]>`
    SELECT ST_IsValid(ST_GeomFromGeoJSON(${geometryJson})) AS valid
  `
  if (!result[0]?.valid) {
    throw new ValidationError(
      "The submitted geometry is not topologically valid (e.g., a self-intersecting polygon or unclosed ring).",
    )
  }
}

/** Returns a feature (with its attributes and style) only if it belongs to a layer/project owned by `ownerId`. */
export async function getFeatureById(
  featureId: string,
  ownerId: string,
): Promise<FeatureRecord | null> {
  const row = await getFeatureScopedToOwner(featureId, ownerId)
  if (!row) return null
  return assembleFeature(row)
}

/**
 * Creates a feature: validates layer ownership, checks geometry validity via
 * PostGIS `ST_IsValid` inside the same transaction as the insert (Research
 * Decision 3), and writes geometry via raw SQL (Research Decision 1) since
 * the column is `Unsupported` in the Prisma Client.
 */
export async function createFeature(
  layerId: string,
  ownerId: string,
  input: { geometry: GeoJSONGeometry; attributes?: AttributeInput[]; style?: StyleInput },
): Promise<FeatureRecord> {
  const layer = await getLayerScopedToOwner(layerId, ownerId)
  if (!layer) {
    throw new NotFoundError(`No layer found with id "${layerId}".`)
  }

  const geometryJson = JSON.stringify(input.geometry)
  const featureId = randomUUID()

  return prismaClient.$transaction(async (tx) => {
    await assertGeometryIsValid(tx, geometryJson)

    await tx.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (${featureId}, ${layerId}, ST_GeomFromGeoJSON(${geometryJson}), NOW(), NOW())
    `

    if (input.attributes?.length) {
      await tx.featureAttribute.createMany({
        data: input.attributes.map((attribute) => ({
          featureId,
          key: attribute.key,
          value: attribute.value,
        })),
      })
    }

    if (input.style) {
      await tx.featureStyle.create({
        data: { featureId, ...input.style },
      })
    }

    const rows = await tx.$queryRaw<RawFeatureRow[]>`
      SELECT id, "layerId", ST_AsGeoJSON(geometry) AS geometry, "createdAt", "updatedAt"
      FROM "Feature"
      WHERE id = ${featureId}
    `
    return assembleFeature(rows[0], tx)
  })
}

/**
 * Updates a feature's geometry, attributes, and/or style independently —
 * an omitted facet is left completely unchanged (FR-017/FR-021/FR-024).
 */
export async function updateFeature(
  featureId: string,
  ownerId: string,
  input: { geometry?: GeoJSONGeometry; attributes?: AttributeInput[]; style?: StyleInput },
): Promise<FeatureRecord> {
  const existing = await getFeatureScopedToOwner(featureId, ownerId)
  if (!existing) {
    throw new NotFoundError(`No feature found with id "${featureId}".`)
  }

  return prismaClient.$transaction(async (tx) => {
    if (input.geometry) {
      const geometryJson = JSON.stringify(input.geometry)
      await assertGeometryIsValid(tx, geometryJson)
      await tx.$executeRaw`
        UPDATE "Feature"
        SET geometry = ST_GeomFromGeoJSON(${geometryJson}), "updatedAt" = NOW()
        WHERE id = ${featureId}
      `
    } else {
      await tx.$executeRaw`
        UPDATE "Feature" SET "updatedAt" = NOW() WHERE id = ${featureId}
      `
    }

    if (input.attributes) {
      await tx.featureAttribute.deleteMany({ where: { featureId } })
      if (input.attributes.length) {
        await tx.featureAttribute.createMany({
          data: input.attributes.map((attribute) => ({
            featureId,
            key: attribute.key,
            value: attribute.value,
          })),
        })
      }
    }

    if (input.style) {
      await tx.featureStyle.upsert({
        where: { featureId },
        update: input.style,
        create: { featureId, ...input.style },
      })
    }

    const rows = await tx.$queryRaw<RawFeatureRow[]>`
      SELECT id, "layerId", ST_AsGeoJSON(geometry) AS geometry, "createdAt", "updatedAt"
      FROM "Feature"
      WHERE id = ${featureId}
    `
    return assembleFeature(rows[0], tx)
  })
}

export async function deleteFeature(featureId: string, ownerId: string): Promise<void> {
  const existing = await getFeatureScopedToOwner(featureId, ownerId)
  if (!existing) {
    throw new NotFoundError(`No feature found with id "${featureId}".`)
  }
  await prismaClient.feature.delete({ where: { id: featureId } })
}

export interface ImportFeatureInput {
  geometry: GeoJSONGeometry
  attributes?: AttributeInput[]
}

/**
 * Bulk feature import (used by both GeoJSON and, after client-side
 * conversion, Shapefile import — Research Decisions 5, 19). Every feature's
 * geometry is validated via PostGIS `ST_IsValid` and inserted inside one
 * transaction; a single invalid feature rolls back the entire batch
 * (spec FR-034/FR-035/FR-036/FR-037, all-or-nothing).
 */
export async function importFeatures(
  layerId: string,
  ownerId: string,
  features: ImportFeatureInput[],
): Promise<{ importedCount: number }> {
  const layer = await getLayerScopedToOwner(layerId, ownerId)
  if (!layer) {
    throw new NotFoundError(`No layer found with id "${layerId}".`)
  }

  await prismaClient.$transaction(async (tx) => {
    for (const feature of features) {
      const geometryJson = JSON.stringify(feature.geometry)
      await assertGeometryIsValid(tx, geometryJson)

      const featureId = randomUUID()
      await tx.$executeRaw`
        INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
        VALUES (${featureId}, ${layerId}, ST_GeomFromGeoJSON(${geometryJson}), NOW(), NOW())
      `

      if (feature.attributes?.length) {
        await tx.featureAttribute.createMany({
          data: feature.attributes.map((attribute) => ({
            featureId,
            key: attribute.key,
            value: attribute.value,
          })),
        })
      }
    }
  })

  return { importedCount: features.length }
}

export interface ListFeaturesParams {
  cursor?: string
  limit?: number
  bbox?: [number, number, number, number]
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

/**
 * Cursor (keyset) pagination ordered by `id`, with an optional PostGIS
 * `ST_Intersects` bbox filter using the GiST index (Research Decision 5).
 */
export async function listFeaturesForLayer(
  layerId: string,
  ownerId: string,
  params: ListFeaturesParams,
): Promise<{ features: FeatureRecord[]; nextCursor: string | null }> {
  const layer = await getLayerScopedToOwner(layerId, ownerId)
  if (!layer) {
    throw new NotFoundError(`No layer found with id "${layerId}".`)
  }

  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT)

  const conditions: Prisma.Sql[] = [Prisma.sql`f."layerId" = ${layerId}`]
  if (params.cursor) {
    conditions.push(Prisma.sql`f.id > ${params.cursor}`)
  }
  if (params.bbox) {
    const [minLng, minLat, maxLng, maxLat] = params.bbox
    conditions.push(
      Prisma.sql`ST_Intersects(f.geometry, ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))`,
    )
  }
  const whereClause = Prisma.join(conditions, " AND ")

  const rows = await prismaClient.$queryRaw<RawFeatureRow[]>`
    SELECT f.id, f."layerId", ST_AsGeoJSON(f.geometry) AS geometry, f."createdAt", f."updatedAt"
    FROM "Feature" f
    WHERE ${whereClause}
    ORDER BY f.id ASC
    LIMIT ${limit + 1}
  `

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1].id : null

  const features = await Promise.all(pageRows.map((row) => assembleFeature(row)))

  return { features, nextCursor }
}
