import type { FeatureLock } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { createNotification } from "@/server/repositories/notificationRepository"
import { projectChannel, publish } from "@/server/realtime/channel"
import { ConflictError, NotFoundError } from "@/shared/errors/apiError"

/** Rolling lock duration (spec Assumptions — refreshed on every edit "heartbeat"). */
const LOCK_DURATION_MS = 15 * 60 * 1000

/**
 * Resolves a feature's `projectId`. Deliberately a private, local copy of
 * `featureRepository.getProjectIdForFeature`'s query rather than an import
 * of it — `featureRepository.ts` already imports this file for
 * `getActiveLockForFeature`, so importing back would create a circular
 * module dependency. The duplicated query is five lines; the alternative
 * (a shared neutral helper module) would touch three files for the same
 * outcome.
 */
async function resolveProjectIdForFeature(featureId: string): Promise<string> {
  const feature = await prismaClient.feature.findUnique({
    where: { id: featureId },
    select: { layer: { select: { projectId: true } } },
  })
  if (!feature) {
    throw new NotFoundError(`No feature found with id "${featureId}".`)
  }
  return feature.layer.projectId
}

/**
 * Returns the feature's active lock, or `null` if unlocked or its lock has
 * expired (research.md Decision 3 — expiry is checked at read time, a lock
 * past `expiresAt` is treated as already released, never enforced by a
 * background job).
 */
export async function getActiveLockForFeature(featureId: string): Promise<FeatureLock | null> {
  const lock = await prismaClient.featureLock.findUnique({ where: { featureId } })
  if (!lock) return null
  if (lock.expiresAt <= new Date()) return null
  return lock
}

/**
 * Acquires a lock for `userId`, or refreshes it if they already hold it
 * (research.md Decision 4). Throws `ConflictError` if a different,
 * unexpired holder exists — the same holder refreshing their own lock
 * never conflicts with themselves. On success, publishes a `lock` realtime
 * event (US3 scenario 1); on a rejected conflicting attempt, notifies the
 * caller with a `lock_conflict` `Notification` (FR-036).
 */
export async function acquireOrRefreshLock(featureId: string, userId: string): Promise<FeatureLock> {
  const existing = await prismaClient.featureLock.findUnique({ where: { featureId } })
  const now = new Date()

  if (existing && existing.lockedByUserId !== userId && existing.expiresAt > now) {
    await prismaClient.$transaction(async (tx) => {
      await createNotification(tx, {
        recipientUserId: userId,
        type: "lock_conflict",
        payload: { featureId, lockedByUserId: existing.lockedByUserId },
      })
    })
    throw new ConflictError("This feature is currently being edited by another member.")
  }

  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS)
  const projectId = await resolveProjectIdForFeature(featureId)

  return prismaClient.$transaction(async (tx) => {
    const lock = await tx.featureLock.upsert({
      where: { featureId },
      update: { lockedByUserId: userId, expiresAt },
      create: { featureId, lockedByUserId: userId, expiresAt },
    })
    await publish(
      projectChannel(projectId),
      { type: "lock", action: "acquire", featureId, lockedByUserId: userId, expiresAt: expiresAt.toISOString() },
      tx,
    )
    return lock
  })
}

/** Releases a lock (FR-020) — a no-op if no lock exists or it belongs to someone else. Publishes on actual release. */
export async function releaseLock(featureId: string, userId: string): Promise<void> {
  const projectId = await resolveProjectIdForFeature(featureId)

  await prismaClient.$transaction(async (tx) => {
    const result = await tx.featureLock.deleteMany({ where: { featureId, lockedByUserId: userId } })
    if (result.count > 0) {
      await publish(projectChannel(projectId), { type: "lock", action: "release", featureId }, tx)
    }
  })
}
