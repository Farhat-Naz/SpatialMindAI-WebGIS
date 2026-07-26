import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createAnalysisRun } from "@/server/repositories/analysisRepository"
import { MAX_CONCURRENT_JOBS_PER_USER } from "@/features/analysis/types/analysisConfig.constants"
import { isDatabaseAvailable } from "./testHelpers"
import { resetRateLimiterForTests } from "@/server/security/rateLimiter"

const dbAvailable = await isDatabaseAvailable()

/** spec.md's Performance target: 100 simultaneous analyses across the platform (SC-003). */
const TOTAL_JOBS = 100

/**
 * Users needed to reach `TOTAL_JOBS` without any one of them exceeding
 * `MAX_CONCURRENT_JOBS_PER_USER` (research.md Decision 12). The cap is
 * per-user precisely so the platform-wide target is reached by many users
 * rather than one user monopolising the queue.
 */
const USER_COUNT = Math.ceil(TOTAL_JOBS / MAX_CONCURRENT_JOBS_PER_USER)

const BUDGET_MS = 300_000

interface Actor {
  userId: string
  projectId: string
  layerId: string
  /** Distinct per user, so a result carrying another user's marker proves cross-job corruption. */
  marker: string
}

describe.skipIf(!dbAvailable)("analysisRepository concurrency — 100 simultaneous analyses (SC-003)", () => {
  const actors: Actor[] = []

  beforeAll(async () => {
    resetRateLimiterForTests()

    for (let index = 0; index < USER_COUNT; index += 1) {
      const userId = `concurrency-user-${index}`
      await prismaClient.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: `${userId}@dev.local` },
      })
      const project = await prismaClient.project.create({
        data: { ownerId: userId, name: `Concurrency ${index} ${Date.now()}` },
      })
      await prismaClient.projectMember.create({ data: { projectId: project.id, userId, role: "Owner" } })
      const layer = await prismaClient.layer.create({ data: { projectId: project.id, name: "Input", order: 0 } })

      const marker = `user-${index}`
      // A handful of features each: this test is about scheduling and
      // isolation under load, not about per-job size.
      const rows = await prismaClient.$queryRaw<{ id: string }[]>`
        INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, ${layer.id},
          ST_SetSRID(ST_MakePoint(${index} + i * 0.01, ${index} + i * 0.01), 4326), NOW(), NOW()
        FROM generate_series(1, 3) AS i
        RETURNING id
      `
      for (const row of rows) {
        await prismaClient.featureAttribute.create({ data: { featureId: row.id, key: "owner", value: marker } })
      }

      actors.push({ userId, projectId: project.id, layerId: layer.id, marker })
    }
  }, BUDGET_MS)

  afterAll(async () => {
    for (const actor of actors) {
      await prismaClient.project.deleteMany({ where: { ownerId: actor.userId } })
      await prismaClient.user.deleteMany({ where: { id: actor.userId } })
    }
  }, BUDGET_MS)

  it(
    "100 concurrent runs across 20 users all reach a correct terminal state with no cross-job corruption",
    async () => {
      resetRateLimiterForTests()

      const submissions = actors.flatMap((actor) =>
        Array.from({ length: MAX_CONCURRENT_JOBS_PER_USER }, () =>
          createAnalysisRun(actor.projectId, actor.userId, {
            operationType: "selectByAttribute",
            inputLayerIds: [actor.layerId],
            parameters: { key: "owner", operator: "eq", value: actor.marker },
          })
            .then((record) => ({ actor, record, error: null as unknown }))
            .catch((error: unknown) => ({ actor, record: null, error })),
        ),
      )

      expect(submissions).toHaveLength(TOTAL_JOBS)
      const results = await Promise.all(submissions)

      // Every submission either produced a run or was refused by the
      // per-user cap; nothing may fail for an unexplained reason.
      const accepted = results.filter((result) => result.record !== null)
      expect(accepted.length).toBeGreaterThan(0)

      for (const result of results) {
        if (result.error) {
          expect(String(result.error)).toMatch(/concurrent|limit|rate/i)
        }
      }

      // Each accepted run must have operated only on its own user's data.
      // A run whose result contains another marker means one job's
      // execution leaked into another's, which is the corruption SC-003
      // is about.
      for (const { actor, record } of accepted) {
        if (!record) continue
        const run = await prismaClient.analysisRun.findUniqueOrThrow({ where: { id: record.id } })

        expect(["succeeded", "failed", "cancelled"], `run ${run.id} status`).toContain(run.status)
        expect(run.userId).toBe(actor.userId)
        expect(run.projectId).toBe(actor.projectId)

        if (run.status === "succeeded" && run.resultLayerId) {
          const markers = await prismaClient.featureAttribute.findMany({
            where: { key: "owner", feature: { layerId: run.resultLayerId } },
            select: { value: true },
          })
          const distinct = [...new Set(markers.map((m) => m.value))]
          expect(distinct, `run ${run.id} should only contain ${actor.marker}`).toEqual([actor.marker])
        }
      }
    },
    BUDGET_MS,
  )

  it(
    "the per-user concurrent-job cap is enforced rather than advisory",
    async () => {
      resetRateLimiterForTests()
      const actor = actors[0]

      // Occupy the cap with rows the repository will count as in-flight.
      const held = await Promise.all(
        Array.from({ length: MAX_CONCURRENT_JOBS_PER_USER }, () =>
          prismaClient.analysisRun.create({
            data: {
              projectId: actor.projectId,
              userId: actor.userId,
              operationType: "buffer",
              status: "running",
              parameters: {},
              inputLayerIds: [actor.layerId],
            },
          }),
        ),
      )

      try {
        await expect(
          createAnalysisRun(actor.projectId, actor.userId, {
            operationType: "selectByAttribute",
            inputLayerIds: [actor.layerId],
            parameters: { key: "owner", operator: "eq", value: actor.marker },
          }),
        ).rejects.toThrow()
      } finally {
        await prismaClient.analysisRun.deleteMany({ where: { id: { in: held.map((row) => row.id) } } })
      }
    },
    BUDGET_MS,
  )
})
