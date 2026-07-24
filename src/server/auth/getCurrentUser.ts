import type { User } from "@prisma/client"
import { getUserById } from "@/server/repositories/userRepository"
import { UnauthorizedError } from "@/shared/errors/apiError"

/**
 * INTERIM PLACEHOLDER (Research Decision 6): no real authentication system
 * (login, sessions, OAuth) exists anywhere in this codebase yet, so every
 * Route Handler resolves the acting user through this single seam, backed by
 * a seeded "default" user (`DEV_USER_ID`). This is a deliberately isolated
 * stand-in, NOT a finished feature — a future authentication module must
 * replace only this function's body; no Route Handler, repository, or
 * authorization check should need to change when real sessions arrive. See
 * plan.md's Risks section. MUST be replaced before any multi-user or public
 * deployment.
 */
// `request` is part of the seam's permanent signature (a real implementation
// will read session/cookie state from it); unused by the interim body below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getCurrentUser(request: Request): Promise<User> {
  const devUserId = process.env.DEV_USER_ID

  if (!devUserId) {
    throw new UnauthorizedError(
      "No DEV_USER_ID configured — the interim authentication seam has no user to resolve.",
    )
  }

  const user = await getUserById(devUserId)

  if (!user) {
    throw new UnauthorizedError(
      "The configured DEV_USER_ID does not match any seeded user.",
    )
  }

  return user
}
