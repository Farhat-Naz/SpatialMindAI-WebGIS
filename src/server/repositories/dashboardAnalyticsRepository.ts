import { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import * as ops from "@/server/repositories/analysisOperations"
import { ANALYTICS_SNAPSHOT_TTL_MS } from "@/features/dashboards/types/dashboardConfig.constants"

/**
 * Pure staleness check for `AnalyticsSnapshot.computedAt` (research.md
 * Decision 12) — deliberately isolated from any DB access so it is
 * unit-testable on its own. `getSnapshot`'s compute-if-stale-else-serve
 * logic is the only caller.
 */
export function isSnapshotStale(computedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - computedAt.getTime() > ANALYTICS_SNAPSHOT_TTL_MS
}

export type SnapshotType = "projectStats" | "layerStats" | "featureStats" | "systemStats" | "storageStats"

/**
 * Rolls up `buildStatisticsSql(layerId, "featureCount")` (007's existing
 * builder — research.md Decision 5) across every layer in a project. Shared
 * by `computeProjectStats` (per-layer breakdown) and `computeFeatureStats`
 * (the aggregate total) so the two never issue the query twice.
 */
async function featureCountsByLayer(projectId: string): Promise<{ layerId: string; name: string; featureCount: number }[]> {
  const layers = await prismaClient.layer.findMany({ where: { projectId }, select: { id: true, name: true } })
  const counts = await Promise.all(
    layers.map(async (layer) => {
      const rows = await prismaClient.$queryRaw<{ result: { featureCount: number } }[]>(
        ops.buildStatisticsSql(layer.id, "featureCount"),
      )
      return { layerId: layer.id, name: layer.name, featureCount: Number(rows[0]?.result?.featureCount ?? 0) }
    }),
  )
  return counts
}

/** A project-wide breakdown by layer — zero new spatial SQL (delegates to 007's `buildStatisticsSql` per layer, research.md Decision 5). */
export async function computeProjectStats(projectId: string): Promise<unknown> {
  const layers = await featureCountsByLayer(projectId)
  return {
    layerCount: layers.length,
    totalFeatures: layers.reduce((sum, layer) => sum + layer.featureCount, 0),
    layers,
  }
}

/** A single layer's rich summary — delegates entirely to 007's `buildSummarySql` (research.md Decision 5). */
export async function computeLayerStats(layerId: string): Promise<unknown> {
  const rows = await prismaClient.$queryRaw<{ result: unknown }[]>(ops.buildSummarySql(layerId))
  return rows[0]?.result ?? {}
}

/** The project-wide feature-count aggregate (distinct from `computeProjectStats`'s per-layer breakdown) — same underlying delegation, reduced to one total. */
export async function computeFeatureStats(projectId: string): Promise<unknown> {
  const layers = await featureCountsByLayer(projectId)
  return { totalFeatures: layers.reduce((sum, layer) => sum + layer.featureCount, 0) }
}

/** Platform-level dashboard/widget counts for a project — the one genuinely new aggregation surface this feature adds (research.md Decision 5), simple indexed `COUNT`s only. */
export async function computeSystemStats(projectId: string): Promise<unknown> {
  const [dashboardCount, widgetCount] = await Promise.all([
    prismaClient.dashboard.count({ where: { projectId } }),
    prismaClient.dashboardWidget.count({ where: { dashboard: { projectId } } }),
  ])
  return { dashboardCount, widgetCount }
}

/** A storage-usage proxy: total features across every layer in the project (research.md Decision 5 — no byte-level storage metric exists anywhere in this schema). */
export async function computeStorageStats(projectId: string): Promise<unknown> {
  const layers = await featureCountsByLayer(projectId)
  return { totalFeatures: layers.reduce((sum, layer) => sum + layer.featureCount, 0), layerCount: layers.length }
}

async function computeSnapshotData(projectId: string, snapshotType: SnapshotType, scopeId?: string): Promise<unknown> {
  switch (snapshotType) {
    case "projectStats":
      return computeProjectStats(projectId)
    case "layerStats":
      if (!scopeId) throw new Error("layerStats requires scopeId")
      return computeLayerStats(scopeId)
    case "featureStats":
      return computeFeatureStats(projectId)
    case "systemStats":
      return computeSystemStats(projectId)
    case "storageStats":
      return computeStorageStats(projectId)
  }
}

/**
 * Compute-if-stale-else-serve (research.md Decision 12): reads the existing
 * `AnalyticsSnapshot` row; if fresh, returns it (`isCached: true`);
 * otherwise recomputes, upserts, and returns fresh (`isCached: false`).
 * Never read/written by a Route Handler directly — this is the only entry
 * point (repository-api.md).
 */
export async function getSnapshot(
  projectId: string,
  snapshotType: SnapshotType,
  scopeId?: string,
): Promise<{ data: unknown; computedAt: string; isCached: boolean }> {
  // Postgres treats NULL as distinct from NULL in a unique constraint, so a
  // nullable `scopeId` can't be looked up via `findUnique`/`upsert`'s
  // compound-key input (Prisma disallows it). An empty string is the
  // "no scope" sentinel instead — `scopeId` stays nullable in the schema for
  // flexibility, but application code never writes true `null` here.
  const scopeKey = scopeId ?? ""

  const existing = await prismaClient.analyticsSnapshot.findUnique({
    where: { projectId_snapshotType_scopeId: { projectId, snapshotType, scopeId: scopeKey } },
  })

  if (existing && !isSnapshotStale(existing.computedAt)) {
    return { data: existing.data, computedAt: existing.computedAt.toISOString(), isCached: true }
  }

  const data = await computeSnapshotData(projectId, snapshotType, scopeId)
  const computedAt = new Date()

  await prismaClient.analyticsSnapshot.upsert({
    where: { projectId_snapshotType_scopeId: { projectId, snapshotType, scopeId: scopeKey } },
    update: { data: data as Prisma.InputJsonValue, computedAt },
    create: { projectId, snapshotType, scopeId: scopeKey, data: data as Prisma.InputJsonValue, computedAt },
  })

  return { data, computedAt: computedAt.toISOString(), isCached: false }
}
