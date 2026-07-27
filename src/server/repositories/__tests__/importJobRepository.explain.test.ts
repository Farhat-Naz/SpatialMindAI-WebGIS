import { beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "./testHelpers"

/**
 * Query-plan verification for the duplicate probe (specs/005-import-export,
 * T269; research.md Decision 8, plan.md Risks "Duplicate probe too slow").
 *
 * The probe's design is: `&&` bbox overlap narrows candidates through the GiST
 * index, then `ST_OrderingEquals` confirms on the survivors. This test asserts
 * the *plan*, not just the result — against a populated layer, the inner probe
 * must be an index scan on `Feature_geometry_gist_idx`, never a sequential scan
 * of the layer's features. A correct-but-sequential probe would pass every
 * behavioral test and still collapse at 500k features.
 *
 * Decision recorded per the task: the plan is index-backed, so the per-job
 * "skippable probe" escape hatch the risk register reserved is NOT implemented.
 */

const dbAvailable = await isDatabaseAvailable()

describe.skipIf(!dbAvailable)("duplicate probe query plan (T269)", () => {
  let layerId: string

  beforeAll(async () => {
    await ensureTestOwner()

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Explain ${Date.now()}-${Math.random()}` },
    })
    await prismaClient.projectMember.create({
      data: { projectId: project.id, userId: TEST_OWNER_ID, role: "Owner" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "Probe target", order: 0 },
    })
    layerId = layer.id

    // A populated target layer, so the planner has a real choice to make: at a
    // handful of rows it may prefer a sequential scan regardless of indexes,
    // which would make the assertion meaningless.
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, ${layerId},
             ST_SetSRID(ST_MakePoint(-10 + (n % 500) * 0.04, 35 + (n / 500) * 0.05), 4326),
             NOW(), NOW()
      FROM generate_series(1, 20000) AS n
    `
    await prismaClient.$executeRaw`ANALYZE "Feature"`
  }, 120000)

  it("narrows candidates through the GiST index, not a sequential scan", async () => {
    // The probe exactly as commitImportChunk issues it, EXPLAINed against one
    // incoming geometry.
    const plan = await prismaClient.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN
      SELECT 1 FROM "Feature" existing
      WHERE existing."layerId" = ${layerId}
        AND existing.geometry && ST_SetSRID(ST_MakePoint(-9.98, 35.05), 4326)
        AND ST_OrderingEquals(existing.geometry, ST_SetSRID(ST_MakePoint(-9.98, 35.05), 4326))
    `
    const planText = plan.map((row) => row["QUERY PLAN"]).join("\n")

    // The `&&` operator is served by the GiST index.
    expect(planText).toMatch(/Feature_geometry_gist_idx/)
    expect(planText).not.toMatch(/Seq Scan on "?Feature"?/)
  }, 60000)

  it("keeps the plan index-backed inside the NOT EXISTS shape the insert uses", async () => {
    const plan = await prismaClient.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN
      SELECT v.geom FROM (VALUES (ST_SetSRID(ST_MakePoint(-9.98, 35.05), 4326))) AS v(geom)
      WHERE NOT EXISTS (
        SELECT 1 FROM "Feature" existing
        WHERE existing."layerId" = ${layerId}
          AND existing.geometry && v.geom
          AND ST_OrderingEquals(existing.geometry, v.geom)
      )
    `
    const planText = plan.map((row) => row["QUERY PLAN"]).join("\n")

    expect(planText).toMatch(/Feature_geometry_gist_idx/)
    expect(planText).not.toMatch(/Seq Scan on "?Feature"?/)
  }, 60000)
})
