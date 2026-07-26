import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { createAnalysisRun } from "@/server/repositories/analysisRepository"
import type { AnalysisRequestInput } from "@/shared/contracts/analysis.schema"
import { BACKGROUND_EXECUTION_THRESHOLD } from "@/features/analysis/types/analysisConfig.constants"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

/**
 * Features seeded for the large-input path. spec.md's Performance section
 * names 100,000; that is used here because the point of the test is the
 * chunked/background path's behaviour at scale, and a smaller number
 * would not exercise the many-chunk case that SC-002's progress
 * requirement is actually about.
 */
const LARGE_FEATURE_COUNT = 100_000

/**
 * Time budget for the whole file. Documented rather than tight: this runs
 * against whatever hardware CI or a laptop provides, and a flaky
 * wall-clock assertion is worse than none. The assertions below are about
 * *observable behaviour* (progress advanced, terminal status reached,
 * counts correct), not raw speed.
 */
const BUDGET_MS = 300_000

/** Seeds `count` point features in one statement — a per-row insert at this scale would dominate the test's runtime. */
async function seedPoints(layerId: string, count: number): Promise<void> {
  await prismaClient.$executeRaw`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text,
      ${layerId},
      ST_SetSRID(ST_MakePoint((i % 360) - 180 + random() * 0.5, (i % 170) - 85 + random() * 0.5), 4326),
      NOW(),
      NOW()
    FROM generate_series(1, ${count}) AS i
  `
}

/**
 * T268 (SC-002) — the background/chunked path against a 100,000-feature
 * layer. Asserts that a long operation reports progress more than once
 * before finishing, which is the property the Progress Dialog depends on;
 * an operation that jumped straight from 0 to 100 would satisfy a naive
 * "it completed" test while leaving the user staring at a frozen bar.
 */
describe.skipIf(!dbAvailable)("analysisRepository performance — large dataset", () => {
  let projectId: string
  let largeLayerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Performance Test ${Date.now()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const layer = await prismaClient.layer.create({ data: { projectId, name: "Large", order: 0 } })
    largeLayerId = layer.id
    await seedPoints(largeLayerId, LARGE_FEATURE_COUNT)
  }, BUDGET_MS)

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("the fixture really is large enough to exercise the background path", async () => {
    const count = await prismaClient.feature.count({ where: { layerId: largeLayerId } })

    expect(count).toBe(LARGE_FEATURE_COUNT)
    expect(count).toBeGreaterThan(BACKGROUND_EXECUTION_THRESHOLD)
  })

  const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"])

  /**
   * Polls a run to completion, recording every distinct `progress` value
   * seen along the way.
   *
   * At this input size `createAnalysisRun` returns as soon as the row is
   * `queued` and executes detached (`BACKGROUND_EXECUTION_THRESHOLD`), so
   * the caller must wait exactly the way the client's Progress Dialog
   * does — by polling the row. Reading the status straight after the call
   * would only ever observe `queued`.
   */
  async function runToCompletion(input: AnalysisRequestInput): Promise<{ seen: number[]; status: string; id: string }> {
    const seen: number[] = []
    const record = await createAnalysisRun(projectId, TEST_OWNER_ID, input)

    const deadline = Date.now() + BUDGET_MS
    for (;;) {
      const row = await prismaClient.analysisRun.findUniqueOrThrow({
        where: { id: record.id },
        select: { progress: true, status: true },
      })
      if (row.progress != null && seen[seen.length - 1] !== row.progress) {
        seen.push(row.progress)
      }
      if (TERMINAL_STATUSES.has(row.status)) {
        return { seen, status: row.status, id: record.id }
      }
      if (Date.now() > deadline) {
        throw new Error(`Run ${record.id} did not reach a terminal status within ${BUDGET_MS}ms (last: ${row.status})`)
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  it(
    "buffer over 100k features reaches a terminal status with progress observed more than once (SC-002)",
    async () => {
      const { seen, status } = await runToCompletion({
        operationType: "buffer",
        inputLayerIds: [largeLayerId],
        parameters: { distance: 10, unit: "meters" },
      })

      expect(status).toBe("succeeded")
      // SC-002's "visible progress" — a single 0→100 jump would leave the
      // Progress Dialog frozen for the whole run.
      expect(seen.length, `progress values observed: ${seen.join(", ")}`).toBeGreaterThanOrEqual(2)
      expect(seen[seen.length - 1]).toBe(100)
      // Progress must never go backwards.
      expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    },
    BUDGET_MS,
  )

  it(
    "simplify over 100k features completes and preserves the feature count",
    async () => {
      const { status, id } = await runToCompletion({
        operationType: "simplify",
        inputLayerIds: [largeLayerId],
        parameters: { tolerance: 0.001 },
      })
      const run = await prismaClient.analysisRun.findUniqueOrThrow({ where: { id } })

      expect(status).toBe("succeeded")
      // Simplify is 1:1 — a chunking bug that dropped or duplicated a page
      // would show up here as a count mismatch.
      const resultCount = await prismaClient.feature.count({ where: { layerId: run.resultLayerId! } })
      expect(resultCount).toBe(LARGE_FEATURE_COUNT)
    },
    BUDGET_MS,
  )

  it(
    "union over 100k features accumulates without exhausting memory or time",
    async () => {
      const smallLayer = await prismaClient.layer.create({ data: { projectId, name: "Small", order: 1 } })
      await seedPoints(smallLayer.id, 100)

      const { status, id } = await runToCompletion({
        operationType: "union",
        inputLayerIds: [largeLayerId, smallLayer.id],
        parameters: undefined,
      })
      const run = await prismaClient.analysisRun.findUniqueOrThrow({ where: { id } })

      expect(status).toBe("succeeded")
      expect(run.executionTimeMs).not.toBeNull()
    },
    BUDGET_MS,
  )
})
