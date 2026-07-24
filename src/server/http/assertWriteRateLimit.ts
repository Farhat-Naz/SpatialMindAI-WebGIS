import { checkRateLimit, checkRateLimitRedis } from "@/server/security/rateLimiter"
import { RateLimitedError } from "@/shared/errors/apiError"

/**
 * Enforces the per-user, per-bucket rate limit (Research Decision 9) for a
 * write endpoint. Called at the top of every `POST`/`PATCH`/`DELETE` Route
 * Handler, before any repository access; read (`GET`) endpoints are
 * intentionally unthrottled.
 */
export function assertWriteRateLimit(userId: string, bucket: string): void {
  if (!checkRateLimit(userId, bucket)) {
    throw new RateLimitedError()
  }
}

/**
 * Redis-backed equivalent of `assertWriteRateLimit` (specs/010-deployment-
 * enterprise, research.md §12/§14) — used only by the new `/api/ops/*`
 * write endpoints introduced by that feature, never by any existing
 * endpoint (which keep using the synchronous `assertWriteRateLimit` above
 * unchanged).
 */
export async function assertWriteRateLimitAsync(userId: string, bucket: string): Promise<void> {
  if (!(await checkRateLimitRedis(userId, bucket))) {
    throw new RateLimitedError()
  }
}
