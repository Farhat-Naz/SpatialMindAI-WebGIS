import { z } from "zod"

/**
 * Full environment schema (spec FR-001–FR-004). Note: `DEV_USER_ID` is
 * validated here for the on-demand `validateEnvStructurally()`/
 * `GET /api/ops/config/validate` check and for `loadEnv()` (called once at
 * real server boot, see `instrumentation.ts`) — but deliberately NOT read
 * eagerly at this module's top level, because every existing feature's test
 * suite sets `process.env.DEV_USER_ID` dynamically per-test (`beforeEach`),
 * after this module would already have been imported. Eagerly throwing here
 * would break that established, working test convention
 * (`src/server/auth/getCurrentUser.ts`'s own lazy, per-request read is the
 * existing precedent this respects). `DATABASE_URL` is safe to reference at
 * any time — `vitest.global-setup.ts` sets it once, before every test file's
 * imports run.
 */
const fullEnvSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  DEV_USER_ID: z.string().trim().min(1, "DEV_USER_ID is required"),

  // specs/010-deployment-enterprise additions — optional at the base tier;
  // absence degrades specific capabilities gracefully (research.md §9/§12)
  // rather than blocking application startup. `@upstash/redis` speaks only
  // Upstash's REST protocol (no plain `redis://` connection string support),
  // so the REST URL/token pair is the one recognized Redis configuration —
  // a corrected refinement of research.md §12's original wording.
  DIRECT_URL: z.string().trim().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().trim().min(1).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().min(1).optional(),
  CRON_SECRET: z.string().trim().min(1).optional(),
  ALLOWED_ORIGINS: z.string().trim().optional(),

  // Interim operator-authorization allow-list (plan.md Architecture,
  // `assertIsOperator`) — a comma-separated list of `User.id` values
  // permitted to call `/api/ops/*` operator-only endpoints, until
  // 009-administration-security's `assertSystemPermission` exists to
  // replace it (Complexity Tracking's documented swap point).
  OPERATOR_USER_IDS: z.string().trim().optional(),

  // Recognized, never previously defined in this codebase — the one
  // concrete value Production-mode validation rejects (FR-003), so the
  // stricter refinement below has a real variable to enforce against.
  DEBUG_MODE: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
})

/** Production tier additionally forbids `DEBUG_MODE=true` (FR-003). */
const productionRefinement = (data: z.infer<typeof fullEnvSchema>, ctx: z.RefinementCtx) => {
  if (data.DEBUG_MODE === "true") {
    ctx.addIssue({
      code: "custom",
      path: ["DEBUG_MODE"],
      message: "DEBUG_MODE must not be 'true' in Production",
    })
  }
}

export type Env = z.infer<typeof fullEnvSchema>

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n")
}

/**
 * Parses and validates `process.env` against the full schema. Throws
 * immediately with every specific missing/invalid key listed — never
 * allows the application to start in a partially-configured state
 * (FR-002). Call this once, at real application boot (`instrumentation.ts`)
 * — never at arbitrary module-import time (see this file's top-of-file
 * note on why `DEV_USER_ID` cannot be eagerly validated on import).
 */
export function loadEnv(): Env {
  const isProduction = process.env.NODE_ENV === "production"
  const schema = isProduction
    ? fullEnvSchema.superRefine(productionRefinement)
    : fullEnvSchema
  const result = schema.safeParse(process.env)

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration — the following ${result.error.issues.length} value(s) are missing or invalid:\n${formatIssues(result.error)}`,
    )
  }

  return result.data
}

/** Parses `ALLOWED_ORIGINS` (comma-separated) into a list — empty (fail-closed) when unset. */
export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS
  if (!raw) {
    return []
  }
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

/** Whether the Redis-backed cache/rate-limiter mode is configured (research.md §9/§12). */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

/** Validates the current environment structurally without ever exposing a value (`GET /api/ops/config/validate`). */
export function validateEnvStructurally(): { valid: boolean; issues: Array<{ key: string; problem: string }> } {
  try {
    loadEnv()
    return { valid: true, issues: [] }
  } catch (error) {
    const isProduction = process.env.NODE_ENV === "production"
    const schema = isProduction ? fullEnvSchema.superRefine(productionRefinement) : fullEnvSchema
    const result = schema.safeParse(process.env)
    if (result.success) {
      // Should not happen (loadEnv already failed), but keep the function total.
      return { valid: true, issues: [] }
    }
    void error
    return {
      valid: false,
      issues: result.error.issues.map((issue) => ({
        key: issue.path.join(".") || "(root)",
        problem: issue.message,
      })),
    }
  }
}
