import { Redis } from "@upstash/redis"
import { isRedisConfigured } from "@/server/config/env"

let client: Redis | null | undefined

/**
 * Lazily constructs the Upstash Redis client (REST-based — no persistent
 * TCP pool, safe for serverless, research.md §12). Returns `null` when
 * Redis is not configured for this environment. Exported so
 * `src/server/security/rateLimiter.ts`'s Redis-backed mode reuses this one
 * client construction rather than duplicating it (Constitution: never
 * duplicate code).
 */
export function getRedisClient(): Redis | null {
  if (client !== undefined) {
    return client
  }
  if (!isRedisConfigured()) {
    client = null
    return client
  }
  client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL as string,
    token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
  })
  return client
}

/**
 * Generic cache read. Never throws — a Redis outage or missing
 * configuration degrades to a cache miss (research.md §9 fail-open
 * posture), never a broken request (specs/010-deployment-enterprise
 * Risks table).
 */
export async function get<T>(key: string): Promise<T | null> {
  const redis = getRedisClient()
  if (!redis) {
    return null
  }
  try {
    const value = await redis.get<T>(key)
    return value ?? null
  } catch {
    return null
  }
}

/** Generic cache write with a TTL in seconds. Silently no-ops if Redis is unavailable/unconfigured. */
export async function set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient()
  if (!redis) {
    return
  }
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch {
    // Fail open — a cache-write failure must never break the caller's request.
  }
}

/** Removes a cached key (used after a mutation invalidates a cached read, FR-030). */
export async function invalidate(key: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) {
    return
  }
  try {
    await redis.del(key)
  } catch {
    // Fail open.
  }
}

/** Test-only helper: resets the memoized client so tests can toggle Redis configuration between cases. */
export function resetCacheClientForTests(): void {
  client = undefined
}
