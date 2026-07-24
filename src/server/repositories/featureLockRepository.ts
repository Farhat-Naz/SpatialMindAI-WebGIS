import type { FeatureLock } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { ConflictError } from "@/shared/errors/apiError"

/** Rolling lock duration (spec Assumptions — refreshed on every edit "heartbeat"). */
const LOCK_DURATION_MS = 15 * 60 * 1000

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
 * never conflicts with themselves.
 */
export async function acquireOrRefreshLock(featureId: string, userId: string): Promise<FeatureLock> {
  const existing = await prismaClient.featureLock.findUnique({ where: { featureId } })
  const now = new Date()

  if (existing && existing.lockedByUserId !== userId && existing.expiresAt > now) {
    throw new ConflictError("This feature is currently being edited by another member.")
  }

  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS)

  return prismaClient.featureLock.upsert({
    where: { featureId },
    update: { lockedByUserId: userId, expiresAt },
    create: { featureId, lockedByUserId: userId, expiresAt },
  })
}

/** Releases a lock (FR-020) — a no-op if no lock exists or it belongs to someone else. */
export async function releaseLock(featureId: string, userId: string): Promise<void> {
  await prismaClient.featureLock.deleteMany({ where: { featureId, lockedByUserId: userId } })
}
