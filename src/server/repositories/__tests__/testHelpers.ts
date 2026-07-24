import { prismaClient } from "@/server/db/prismaClient"
import { resetRateLimiterForTests } from "@/server/security/rateLimiter"

/** Seeded user id used by every repository/API/integration test in this feature. */
export const TEST_OWNER_ID = "test-owner-1"

/**
 * Seeded second user id (specs/006-collaboration) for multi-user test
 * scenarios (invitations, comments, presence, locks) — every one of this
 * feature's collaboration tests needs a real second `User` row distinct
 * from `TEST_OWNER_ID`, matching quickstart.md's Prerequisites.
 */
export const TEST_COLLABORATOR_ID = "test-collaborator-1"

/**
 * Idempotently ensures the shared test owner user exists, and resets the
 * rate limiter (Research Decision 9) so one test file's write volume can
 * never trip the limiter for another file sharing the same `TEST_OWNER_ID`.
 */
export async function ensureTestOwner(): Promise<void> {
  resetRateLimiterForTests()
  await prismaClient.user.upsert({
    where: { id: TEST_OWNER_ID },
    update: {},
    create: { id: TEST_OWNER_ID, email: `${TEST_OWNER_ID}@dev.local` },
  })
}

/** Idempotently ensures the shared second test collaborator user exists (specs/006-collaboration). */
export async function ensureTestCollaborator(): Promise<void> {
  await prismaClient.user.upsert({
    where: { id: TEST_COLLABORATOR_ID },
    update: {},
    create: { id: TEST_COLLABORATOR_ID, email: `${TEST_COLLABORATOR_ID}@dev.local` },
  })
}

/**
 * Checks whether the test database (Research Decision 11) is reachable.
 * Tests that require the database use `describe.skipIf(!(await
 * isDatabaseAvailable()))` so the suite reports them as skipped — not a
 * false pass or a hard failure — when `npm run test:db:up` has not been run.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await prismaClient.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
