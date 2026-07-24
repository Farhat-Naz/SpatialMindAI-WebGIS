/**
 * Error categories every Route Handler in the project reports. The first
 * five are the fixed vocabulary from spec.md's Error Handling requirements.
 * `RATE_LIMITED` is one deliberate, minimal addition beyond that list — it
 * implements the rate limiting called for in plan.md Section 7 (Security)
 * and Research Decision 9, both already approved before this implementation
 * pass, and has no other code in the fixed five it could correctly reuse
 * (a 429 throttling outcome is not an INVALID_INPUT, NOT_FOUND,
 * DUPLICATE_NAME, DATABASE_ERROR, or UNAUTHORIZED).
 *
 * `FORBIDDEN` was added by specs/010-deployment-enterprise (plan.md
 * Complexity Tracking) for its operator-only endpoints, and is reused
 * as-is (not redefined) by specs/006-collaboration for its role-insufficient
 * writes (research.md Decision 10) — one 403 vocabulary entry, two
 * independent authorization gates (`assertIsOperator`, `assertProjectRole`)
 * mapping onto it. `MAINTENANCE_ACTIVE` (010) and `CONFLICT` (006, research.md
 * Decisions 4–5 — a feature lock or an `updatedAt` mismatch) are each
 * feature-specific additions.
 */
export type ApiErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "DUPLICATE_NAME"
  | "DATABASE_ERROR"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "MAINTENANCE_ACTIVE"
  | "CONFLICT"

export interface ApiError {
  code: ApiErrorCode
  message: string
}

/** Maps each ApiErrorCode to its corresponding HTTP status. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  DUPLICATE_NAME: 409,
  UNAUTHORIZED: 401,
  DATABASE_ERROR: 500,
  RATE_LIMITED: 429,
  FORBIDDEN: 403,
  MAINTENANCE_ACTIVE: 503,
  CONFLICT: 409,
}

/**
 * Builds the `{ error: { code, message } }` envelope and matching HTTP status
 * every Route Handler returns on failure. `message` must be safe to display —
 * never a raw stack trace or upstream error string.
 */
export function toErrorResponse(
  code: ApiErrorCode,
  message: string,
): { status: number; body: { error: ApiError } } {
  return {
    status: STATUS_BY_CODE[code],
    body: { error: { code, message } },
  }
}

/**
 * Thrown when a request cannot be attributed to a valid, resolvable user at
 * all (Research Decision 6 — the interim seam has no `DEV_USER_ID` configured
 * or it matches no seeded user). Route Handlers catch this and respond via
 * `toErrorResponse("UNAUTHORIZED", error.message)`.
 *
 * A resource that exists but belongs to a *different* resolved user is
 * intentionally reported as `NotFoundError`, not this error — per spec.md's
 * Edge Cases ("MUST NOT reveal data the requester is not entitled to see"),
 * a caller must not be able to distinguish "doesn't exist" from "exists but
 * isn't yours" by response code.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Not authorized.") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

/**
 * Thrown by a repository when the requested resource does not exist for the
 * given owner — this covers both "truly doesn't exist" and "exists but
 * belongs to a different owner," deliberately indistinguishable to the
 * caller (see `UnauthorizedError`'s doc comment). Route Handlers respond via
 * `toErrorResponse("NOT_FOUND", error.message)`.
 */
export class NotFoundError extends Error {
  constructor(message = "The requested resource was not found.") {
    super(message)
    this.name = "NotFoundError"
  }
}

/**
 * Thrown by a repository's create/update when a name collides with an
 * existing one within its required uniqueness scope (e.g., per-owner for
 * projects, per-project for layers). Route Handlers respond via
 * `toErrorResponse("DUPLICATE_NAME", error.message)`.
 */
export class DuplicateNameError extends Error {
  constructor(message = "A resource with this name already exists.") {
    super(message)
    this.name = "DuplicateNameError"
  }
}

/**
 * Thrown when a submitted geometry fails Zod structural validation or
 * PostGIS `ST_IsValid` topological validation (Research Decision 3). Route
 * Handlers respond via `toErrorResponse("INVALID_INPUT", error.message)`.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

/**
 * Thrown when the per-user, per-bucket rate limiter (Research Decision 9)
 * has been exceeded for a write endpoint. Route Handlers respond via
 * `toErrorResponse("RATE_LIMITED", error.message)`.
 */
export class RateLimitedError extends Error {
  constructor(message = "Too many requests — please slow down.") {
    super(message)
    this.name = "RateLimitedError"
  }
}

/**
 * Thrown when a request is authenticated but not authorized for an
 * operator-only endpoint (specs/010-deployment-enterprise's
 * `assertIsOperator`, plan.md Architecture). Route Handlers respond via
 * `toErrorResponse("FORBIDDEN", error.message)`.
 */
export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message)
    this.name = "ForbiddenError"
  }
}

/**
 * Thrown when a request is rejected because an active `MaintenanceWindow`
 * exists (specs/010-deployment-enterprise FR-049a). Route Handlers respond
 * via `toErrorResponse("MAINTENANCE_ACTIVE", error.message)`.
 */
export class MaintenanceActiveError extends Error {
  constructor(message = "The system is currently in maintenance mode. Please try again shortly.") {
    super(message)
    this.name = "MaintenanceActiveError"
  }
}

/**
 * Thrown when a write is rejected due to a feature lock held by a different
 * user (research.md Decision 4) or an `updatedAt` mismatch indicating a
 * stale/conflicting edit (research.md Decision 5), both
 * specs/006-collaboration. Route Handlers respond via
 * `toErrorResponse("CONFLICT", error.message)`.
 */
export class ConflictError extends Error {
  constructor(message = "This resource was changed by someone else — please refresh and try again.") {
    super(message)
    this.name = "ConflictError"
  }
}
