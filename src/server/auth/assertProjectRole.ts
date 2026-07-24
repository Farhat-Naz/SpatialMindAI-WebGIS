import { prismaClient } from "@/server/db/prismaClient"
import { ForbiddenError, NotFoundError } from "@/shared/errors/apiError"

export type ProjectRole = "Owner" | "Editor" | "Viewer"

/** Ordering used to compare a caller's role against a required minimum (research.md Decision 10). */
const ROLE_RANK: Record<ProjectRole, number> = {
  Viewer: 0,
  Editor: 1,
  Owner: 2,
}

/**
 * Asserts that `userId` has at least `minRole` access to `projectId`
 * (research.md Decision 10). Throws `NotFoundError` if the caller has no
 * access at all (mirrors the existing ownership-check non-disclosure
 * pattern — a non-member must not learn the project exists), or
 * `ForbiddenError` (403) if they have access but their role is below
 * `minRole` — a Viewer already knows the project exists, so telling them
 * their role doesn't permit a specific write is not a disclosure concern.
 *
 * Checks `Project.ownerId` first (always the Owner, matching
 * 003-database-foundation's existing source of truth) then falls back to
 * an active `ProjectMember` row — reads the `ProjectMember` table directly
 * for now; re-verified once Phase 2/3's broadened ownership-scoping helpers
 * land alongside it.
 */
export async function assertProjectRole(
  projectId: string,
  userId: string,
  minRole: ProjectRole,
): Promise<void> {
  const project = await prismaClient.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  })

  if (!project) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }

  let role: ProjectRole | null = null
  if (project.ownerId === userId) {
    role = "Owner"
  } else {
    const membership = await prismaClient.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    })
    if (membership) {
      role = membership.role as ProjectRole
    }
  }

  if (!role) {
    throw new NotFoundError(`No project found with id "${projectId}".`)
  }

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError(
      `This action requires at least the "${minRole}" role; your role is "${role}".`,
    )
  }
}
