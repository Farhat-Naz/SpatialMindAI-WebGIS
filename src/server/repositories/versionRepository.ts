import type { Prisma, Version } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { recordActivity } from "@/server/repositories/activityRepository"
import { NotFoundError } from "@/shared/errors/apiError"
import type { GeoJSONGeometry } from "@/shared/contracts/geometry.schema"

interface SnapshotFeature {
  id: string
  geometry: GeoJSONGeometry
  attributes: Array<{ key: string; value: string }>
  style: { color: string; strokeWidth?: number; fillOpacity?: number } | null
}

interface SnapshotLayer {
  id: string
  name: string
  order: number
  features: SnapshotFeature[]
}

export interface ProjectSnapshot {
  layers: SnapshotLayer[]
}

/**
 * Serializes every layer/feature/attribute/style in a project into one JSON
 * snapshot (research.md Decision 7) — the same shape `exportLayerAsGeoJson`-
 * style aggregation already produces per layer, applied across the whole
 * project. Performance note: this issues one query per feature for its
 * attributes/style; acceptable for an explicit, infrequent save/restore
 * action, not a routine list view (Performance section, plan.md).
 */
async function buildProjectSnapshot(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<ProjectSnapshot> {
  const layers = await tx.layer.findMany({ where: { projectId }, orderBy: { order: "asc" } })

  const snapshotLayers: SnapshotLayer[] = []
  for (const layer of layers) {
    const featureRows = await tx.$queryRaw<Array<{ id: string; geometry: string }>>`
      SELECT id, ST_AsGeoJSON(geometry) AS geometry FROM "Feature" WHERE "layerId" = ${layer.id}
    `
    const features: SnapshotFeature[] = []
    for (const row of featureRows) {
      const [attributes, style] = await Promise.all([
        tx.featureAttribute.findMany({ where: { featureId: row.id } }),
        tx.featureStyle.findUnique({ where: { featureId: row.id } }),
      ])
      features.push({
        id: row.id,
        geometry: JSON.parse(row.geometry) as GeoJSONGeometry,
        attributes: attributes.map((attribute) => ({ key: attribute.key, value: attribute.value })),
        style: style
          ? { color: style.color, strokeWidth: style.strokeWidth ?? undefined, fillOpacity: style.fillOpacity ?? undefined }
          : null,
      })
    }
    snapshotLayers.push({ id: layer.id, name: layer.name, order: layer.order, features })
  }

  return { layers: snapshotLayers }
}

/** Replaces a project's current layers/features with a snapshot's content, preserving original ids. */
async function applySnapshot(
  tx: Prisma.TransactionClient,
  projectId: string,
  snapshot: ProjectSnapshot,
): Promise<void> {
  await tx.layer.deleteMany({ where: { projectId } })

  for (const layer of snapshot.layers) {
    await tx.layer.create({ data: { id: layer.id, projectId, name: layer.name, order: layer.order } })

    for (const feature of layer.features) {
      const geometryJson = JSON.stringify(feature.geometry)
      await tx.$executeRaw`
        INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
        VALUES (${feature.id}, ${layer.id}, ST_GeomFromGeoJSON(${geometryJson}), NOW(), NOW())
      `
      if (feature.attributes.length) {
        await tx.featureAttribute.createMany({
          data: feature.attributes.map((attribute) => ({
            featureId: feature.id,
            key: attribute.key,
            value: attribute.value,
          })),
        })
      }
      if (feature.style) {
        await tx.featureStyle.create({ data: { featureId: feature.id, ...feature.style } })
      }
    }
  }
}

/** Saves a new version — a full snapshot of the project's current state (FR-026). */
export async function saveVersion(
  projectId: string,
  createdByUserId: string,
  note?: string,
): Promise<Version> {
  return prismaClient.$transaction(async (tx) => {
    const snapshot = await buildProjectSnapshot(tx, projectId)
    return tx.version.create({
      data: { projectId, createdByUserId, note, snapshot: snapshot as unknown as Prisma.InputJsonValue },
    })
  })
}

/** Lists a project's versions, metadata only (no `snapshot` — FR-030's list view), newest first. */
export async function listVersionsForProject(projectId: string): Promise<Omit<Version, "snapshot">[]> {
  return prismaClient.version.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    omit: { snapshot: true },
  })
}

/** Returns one version with its full snapshot. */
export async function getVersionById(versionId: string): Promise<Version> {
  const version = await prismaClient.version.findUnique({ where: { id: versionId } })
  if (!version) {
    throw new NotFoundError(`No version found with id "${versionId}".`)
  }
  return version
}

/**
 * Restores a version (FR-028/FR-029): inside one transaction, saves a new
 * "pre-restore" snapshot of the current state, replaces current layers/
 * features with the target version's content, and records an `Activity`
 * row. No `Version` row is ever deleted — a restore always results in
 * exactly one more version than existed before it (SC-007).
 */
export async function restoreVersion(
  projectId: string,
  versionId: string,
  userId: string,
): Promise<Version> {
  const target = await prismaClient.version.findUnique({ where: { id: versionId } })
  if (!target || target.projectId !== projectId) {
    throw new NotFoundError(`No version found with id "${versionId}" in this project.`)
  }

  return prismaClient.$transaction(async (tx) => {
    const preRestoreSnapshot = await buildProjectSnapshot(tx, projectId)
    await tx.version.create({
      data: {
        projectId,
        createdByUserId: userId,
        note: `Automatic snapshot before restoring version ${versionId}`,
        snapshot: preRestoreSnapshot as unknown as Prisma.InputJsonValue,
        isPreRestoreSnapshot: true,
      },
    })

    await applySnapshot(tx, projectId, target.snapshot as unknown as ProjectSnapshot)

    await recordActivity(tx, {
      projectId,
      userId,
      action: "version_restore",
      targetType: "version",
      targetId: versionId,
    })

    return target
  })
}

export interface VersionDiff {
  addedFeatureIds: string[]
  removedFeatureIds: string[]
  changedFeatureIds: string[]
}

/** Diffs two already-materialized snapshots at read time (FR-030, research.md Decision 7). */
export async function compareVersions(versionAId: string, versionBId: string): Promise<VersionDiff> {
  const [versionA, versionB] = await Promise.all([
    prismaClient.version.findUnique({ where: { id: versionAId } }),
    prismaClient.version.findUnique({ where: { id: versionBId } }),
  ])
  if (!versionA) throw new NotFoundError(`No version found with id "${versionAId}".`)
  if (!versionB) throw new NotFoundError(`No version found with id "${versionBId}".`)

  const featuresA = new Map<string, SnapshotFeature>()
  for (const layer of (versionA.snapshot as unknown as ProjectSnapshot).layers) {
    for (const feature of layer.features) featuresA.set(feature.id, feature)
  }
  const featuresB = new Map<string, SnapshotFeature>()
  for (const layer of (versionB.snapshot as unknown as ProjectSnapshot).layers) {
    for (const feature of layer.features) featuresB.set(feature.id, feature)
  }

  const addedFeatureIds: string[] = []
  const changedFeatureIds: string[] = []
  for (const [id, featureB] of featuresB) {
    const featureA = featuresA.get(id)
    if (!featureA) {
      addedFeatureIds.push(id)
    } else if (JSON.stringify(featureA) !== JSON.stringify(featureB)) {
      changedFeatureIds.push(id)
    }
  }
  const removedFeatureIds = [...featuresA.keys()].filter((id) => !featuresB.has(id))

  return { addedFeatureIds, removedFeatureIds, changedFeatureIds }
}
