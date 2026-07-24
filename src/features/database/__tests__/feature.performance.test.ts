import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { GET } from "@/app/api/layers/[layerId]/features/route"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"

const dbAvailable = await isDatabaseAvailable()

const FEATURE_COUNT = 100_000
const PERFORMANCE_BUDGET_MS = 2_000

function jsonRequest(url: string, method: string): Request {
  return new Request(url, { method })
}

/**
 * SC-003: a 100,000-feature layer must return in under 2 seconds. This test
 * seeds via a single bulk SQL statement (not 100,000 round trips through
 * Prisma) so the seeding itself doesn't dominate the test run; only the
 * subsequent API call is timed against the budget, per Research Decision 5.
 */
describe.skipIf(!dbAvailable)("Feature listing performance (SC-003)", () => {
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: "Performance Test Project" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Performance Layer", order: 0 },
    })
    layerId = layer.id

    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT
        gen_random_uuid()::text,
        ${layerId},
        ST_SetSRID(ST_MakePoint(-122 + (random() * 0.5), 37 + (random() * 0.5)), 4326),
        NOW(),
        NOW()
      FROM generate_series(1, ${FEATURE_COUNT})
    `
  }, 120_000)

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it(`returns a page from a ${FEATURE_COUNT}-feature layer in under ${PERFORMANCE_BUDGET_MS}ms`, async () => {
    const startedAt = Date.now()
    const response = await GET(
      jsonRequest(`http://localhost/api/layers/${layerId}/features?limit=100`, "GET") as never,
      { params: Promise.resolve({ layerId }) },
    )
    const elapsedMs = Date.now() - startedAt

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.features).toHaveLength(100)
    expect(elapsedMs).toBeLessThan(PERFORMANCE_BUDGET_MS)
  })
})
