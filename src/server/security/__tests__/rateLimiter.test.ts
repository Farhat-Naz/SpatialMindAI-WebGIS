import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { checkRateLimit, checkRateLimitRedis, resetRateLimiterForTests } from "../rateLimiter"

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows requests under the configured limit", () => {
    const userId = "user-a"
    const bucket = "projects:write"

    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 3 })).toBe(true)
    }
  })

  it("blocks once the limit is exceeded within the window", () => {
    const userId = "user-b"
    const bucket = "projects:write"

    for (let i = 0; i < 3; i++) {
      checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 3 })
    }

    expect(checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 3 })).toBe(false)
  })

  it("tracks different users independently", () => {
    const bucket = "layers:write"

    for (let i = 0; i < 2; i++) {
      checkRateLimit("user-c", bucket, { windowMs: 1_000, maxRequests: 2 })
    }

    expect(checkRateLimit("user-c", bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(false)
    expect(checkRateLimit("user-d", bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(true)
  })

  it("tracks different buckets for the same user independently", () => {
    const userId = "user-e"

    for (let i = 0; i < 2; i++) {
      checkRateLimit(userId, "projects:write", { windowMs: 1_000, maxRequests: 2 })
    }

    expect(checkRateLimit(userId, "projects:write", { windowMs: 1_000, maxRequests: 2 })).toBe(false)
    expect(checkRateLimit(userId, "features:write", { windowMs: 1_000, maxRequests: 2 })).toBe(true)
  })

  it("resets once the sliding window elapses", () => {
    const userId = "user-f"
    const bucket = "features:write"

    for (let i = 0; i < 2; i++) {
      checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 2 })
    }
    expect(checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(false)

    vi.advanceTimersByTime(1_001)

    expect(checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(true)
  })

  it("clears all tracked state via resetRateLimiterForTests", () => {
    const userId = "user-g"
    const bucket = "projects:write"

    checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 1 })
    expect(checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 1 })).toBe(false)

    resetRateLimiterForTests()

    expect(checkRateLimit(userId, bucket, { windowMs: 1_000, maxRequests: 1 })).toBe(true)
  })
})

describe("checkRateLimitRedis", () => {
  beforeEach(() => {
    resetRateLimiterForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("falls back to the in-memory limiter when Redis is not configured (research.md §9 fail-open)", async () => {
    const userId = "user-redis-fallback"
    const bucket = "ops:deploy-webhook"

    for (let i = 0; i < 2; i++) {
      expect(await checkRateLimitRedis(userId, bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(true)
    }
    expect(await checkRateLimitRedis(userId, bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(false)
  })

  it("tracks users independently in fallback mode, same as the in-memory limiter", async () => {
    const bucket = "ops:maintenance-toggle"

    for (let i = 0; i < 2; i++) {
      await checkRateLimitRedis("user-redis-a", bucket, { windowMs: 1_000, maxRequests: 2 })
    }
    expect(await checkRateLimitRedis("user-redis-a", bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(false)
    expect(await checkRateLimitRedis("user-redis-b", bucket, { windowMs: 1_000, maxRequests: 2 })).toBe(true)
  })
})
