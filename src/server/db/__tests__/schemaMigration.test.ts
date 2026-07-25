import { beforeEach, describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"

const dbAvailable = await isDatabaseAvailable()

/**
 * T031 — smoke tests for the 007-spatial-analysis migration
 * (`20260725170000_analysis_toolset`): the migration itself already applied
 * cleanly by the time any test file runs (`vitest.global-setup.ts` runs
 * `prisma migrate deploy` first and every other DB-backed test file would
 * fail/skip if it hadn't) — this file asserts the migration's specific
 * guarantees beyond "it applied": the `progress` CHECK constraint and the
 * `userId` backfill leaving zero null rows.
 */
describe.skipIf(!dbAvailable)("007-spatial-analysis migration", () => {
  let projectId: string

  beforeEach(async () => {
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Schema Migration Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
  })

  it("rejects an out-of-range AnalysisRun.progress via the CHECK constraint", async () => {
    await expect(
      prismaClient.$executeRaw`
        INSERT INTO "AnalysisRun" (id, "projectId", "userId", "operationType", status, parameters, "inputLayerIds", progress, "updatedAt")
        VALUES (gen_random_uuid()::text, ${projectId}, ${TEST_OWNER_ID}, 'buffer', 'running', '{}'::jsonb, '[]'::jsonb, 150, NOW())
      `,
    ).rejects.toThrow()
  })

  it("accepts progress within 0-100, and null", async () => {
    await expect(
      prismaClient.$executeRaw`
        INSERT INTO "AnalysisRun" (id, "projectId", "userId", "operationType", status, parameters, "inputLayerIds", progress, "updatedAt")
        VALUES
          ('schema-migration-test-progress-0', ${projectId}, ${TEST_OWNER_ID}, 'buffer', 'running', '{}'::jsonb, '[]'::jsonb, 0, NOW()),
          ('schema-migration-test-progress-100', ${projectId}, ${TEST_OWNER_ID}, 'buffer', 'running', '{}'::jsonb, '[]'::jsonb, 100, NOW()),
          ('schema-migration-test-progress-null', ${projectId}, ${TEST_OWNER_ID}, 'buffer', 'queued', '{}'::jsonb, '[]'::jsonb, NULL, NOW())
      `,
    ).resolves.not.toThrow()
  })

  it("leaves zero AnalysisRun rows with a null userId after the backfill", async () => {
    const rows = await prismaClient.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS count FROM "AnalysisRun" WHERE "userId" IS NULL`,
    )
    expect(Number(rows[0].count)).toBe(0)
  })

  it("MeasurementHistory.geometry has a GiST spatial index (Constitution Principle III)", async () => {
    const rows = await prismaClient.$queryRaw<{ indexname: string }[]>(
      Prisma.sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'MeasurementHistory' AND indexdef ILIKE '%USING gist%'
      `,
    )
    expect(rows.length).toBeGreaterThan(0)
  })
})
