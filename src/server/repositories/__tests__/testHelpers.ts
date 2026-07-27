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
 * Counts the features currently in a layer (specs/005-import-export, T031).
 *
 * Read through raw SQL rather than `prismaClient.feature.count` for
 * consistency with every other `Feature` access in this codebase —
 * `Feature.geometry` is an `Unsupported()` PostGIS column, so the generated
 * client cannot read the row natively.
 */
export async function countFeaturesInLayer(layerId: string): Promise<number> {
  const rows = await prismaClient.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "Feature" WHERE "layerId" = ${layerId}
  `
  return Number(rows[0]?.count ?? 0)
}

/**
 * Returns the ids of features a given import created (specs/005-import-export,
 * T031). The assertion behind SC-011: after "Undo this import" this must be
 * empty, while features another user added to the same layer must survive.
 */
export async function featureIdsForImportJob(importJobId: string): Promise<string[]> {
  const rows = await prismaClient.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Feature" WHERE "importJobId" = ${importJobId} ORDER BY id
  `
  return rows.map((row) => row.id)
}

/**
 * Inserts a feature **without** import provenance, simulating a concurrent
 * edit by another user (Map Editing, or an analysis result layer). Used by the
 * rollback-isolation tests: this row must survive a rollback of any import
 * into the same layer (FR-072, SC-011).
 */
export async function insertUntrackedFeature(
  layerId: string,
  geometryGeoJson: string,
): Promise<string> {
  const id = `untracked-${Math.random().toString(36).slice(2, 11)}`
  await prismaClient.$executeRaw`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    VALUES (${id}, ${layerId}, ST_GeomFromGeoJSON(${geometryGeoJson}), NOW(), NOW())
  `
  return id
}

/**
 * Reports whether the spatial GiST index on `Feature.geometry` exists.
 *
 * Worth asserting rather than assuming: this index was created in
 * `20260721203400_add_feature`, silently dropped by
 * `20260724193417_add_collaboration_and_ops` as `prisma migrate dev`
 * collateral, and restored in `20260727080000_add_import_jobs_and_export_scope`.
 * Constitution Principle III requires it, and the existing-layer duplicate
 * probe (research.md Decision 8) depends on it for candidate narrowing. A
 * future generated migration can drop it again the same way, so a test guards
 * against the regression.
 */
export async function hasFeatureGeometryGistIndex(): Promise<boolean> {
  const rows = await prismaClient.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_am am ON am.oid = c.relam
    WHERE i.tablename = 'Feature' AND am.amname = 'gist'
  `
  return Number(rows[0]?.count ?? 0) > 0
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
