import type { User } from "@prisma/client"
import { logger } from "@/shared/lib/logger"
import { ForbiddenError } from "@/shared/errors/apiError"

/**
 * Interim operator-authorization gate (plan.md Architecture, Complexity
 * Tracking) — every `/api/ops/*` operator-only endpoint calls this
 * immediately after `getCurrentUser`. Checks membership in the
 * `OPERATOR_USER_IDS` allow-list (comma-separated `User.id` values).
 * Fail-closed: an unset/empty allow-list authorizes no one, matching this
 * codebase's other fail-closed defaults (CORS, `ALLOWED_ORIGINS`).
 *
 * SWAP POINT for 009-administration-security: once
 * `assertSystemPermission(userId, "manage_operations")` exists, replace
 * this function's body with a call to it. No call site elsewhere in the
 * codebase needs to change — every caller already just does
 * `assertIsOperator(user)`.
 */
export function assertIsOperator(user: User): void {
  const allowList = (process.env.OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  if (!allowList.includes(user.id)) {
    void logger.persist({
      category: "SECURITY",
      level: "warn",
      message: "Operator authorization denied",
      context: { userId: user.id },
    })
    throw new ForbiddenError("You do not have operator access to this resource.")
  }
}
