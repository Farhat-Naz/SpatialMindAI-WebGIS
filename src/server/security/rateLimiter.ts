/**
 * In-memory, per-user, per-bucket sliding-window rate limiter (Research
 * Decision 9). Guards write endpoints (`POST`/`PATCH`/`DELETE`) across the
 * Projects/Layers/Features API.
 *
 * SINGLE-PROCESS ONLY: state is a plain in-memory Map, scoped to this one
 * Node.js process. It resets on every restart/deploy and is NOT shared
 * across multiple deployed instances behind a load balancer — a known,
 * documented limitation (see plan.md's Risks section), not a bug. Moving to
 * a shared store (e.g., Redis) is a future extension, not implemented here,
 * since current scale/scope is single-instance.
 */

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX_REQUESTS = 30

/** Timestamps (ms since epoch) of requests still inside the current window, per `userId:bucket` key. */
const requestLog = new Map<string, number[]>()

export interface RateLimitOptions {
  /** Sliding window size in milliseconds. Defaults to 60,000 (one minute). */
  windowMs?: number
  /** Maximum requests allowed per user+bucket within the window. Defaults to 30. */
  maxRequests?: number
}

/**
 * Records one request attempt for `userId` in `bucket` and reports whether
 * it is within the allowed rate. Different users and different buckets for
 * the same user are tracked entirely independently.
 */
export function checkRateLimit(
  userId: string,
  bucket: string,
  options: RateLimitOptions = {},
): boolean {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS

  const key = `${userId}:${bucket}`
  const now = Date.now()
  const windowStart = now - windowMs

  const timestamps = (requestLog.get(key) ?? []).filter((t) => t > windowStart)

  if (timestamps.length >= maxRequests) {
    requestLog.set(key, timestamps)
    return false
  }

  timestamps.push(now)
  requestLog.set(key, timestamps)
  return true
}

/**
 * Test-only helper: clears all tracked request timestamps. API/integration
 * tests share a single fixed test-owner id (`TEST_OWNER_ID`) across many
 * files, so without a reset the shared in-memory `requestLog` could trip
 * the limiter across unrelated tests if the process isn't isolated per file.
 */
export function resetRateLimiterForTests(): void {
  requestLog.clear()
}

// ---------------------------------------------------------------------------
// Redis-backed mode (specs/010-deployment-enterprise, research.md §12/§14)
//
// Additive only — `checkRateLimit`/`assertWriteRateLimit` above are
// completely unchanged, so every existing call site across the Projects/
// Layers/Features API keeps its exact current (synchronous, in-memory)
// behavior. This closes the "not shared across instances" limitation
// documented above, but only for the new endpoints that opt into it
// (specs/010-deployment-enterprise's `/api/ops/*` write endpoints) — no
// existing endpoint is retrofitted.
// ---------------------------------------------------------------------------

import { getRedisClient } from "@/server/cache/cache"

/**
 * Sliding-window rate check backed by a Redis sorted set (ZADD/
 * ZREMRANGEBYSCORE/ZCARD), shared across every process talking to the same
 * Redis instance — the multi-instance-correct equivalent of
 * `checkRateLimit` above. Falls back to the in-memory `checkRateLimit` (and
 * therefore fails open, never closed) if Redis is unconfigured or
 * unreachable, per research.md §9's fail-open posture.
 */
export async function checkRateLimitRedis(
  userId: string,
  bucket: string,
  options: RateLimitOptions = {},
): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) {
    return checkRateLimit(userId, bucket, options)
  }

  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS
  const key = `ratelimit:${userId}:${bucket}`
  const now = Date.now()
  const windowStart = now - windowMs

  try {
    await redis.zremrangebyscore(key, 0, windowStart)
    const count = await redis.zcard(key)
    if (count >= maxRequests) {
      return false
    }
    await redis.zadd(key, { score: now, member: `${now}:${Math.random()}` })
    await redis.expire(key, Math.ceil(windowMs / 1000))
    return true
  } catch {
    return checkRateLimit(userId, bucket, options)
  }
}
