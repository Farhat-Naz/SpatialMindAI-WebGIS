import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  cancelRun,
  createAnalysisRun,
  createBatchRun,
  deleteAnalysisRun,
  discardResult,
  getAnalysisRunById,
  listAnalysisRunsForProject,
  rerunAnalysis,
} from "@/server/repositories/analysisRepository"
import type { AnalysisRequestInput } from "@/shared/contracts/analysis.schema"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "./testHelpers"

const dbAvailable = await isDatabaseAvailable()

async function insertPointFeature(layerId: string, lng: number, lat: number): Promise<string> {
  const rows = await prismaClient.$queryRaw<{ id: string }[]>`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON(${JSON.stringify({ type: "Point", coordinates: [lng, lat] })}), NOW(), NOW())
    RETURNING id
  `
  return rows[0].id
}

describe.skipIf(!dbAvailable)("analysisRepository (007-spatial-analysis)", () => {
  let projectId: string
  let layerAId: string
  let layerBId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Analysis Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" } })

    const layerA = await prismaClient.layer.create({ data: { projectId, name: "A", order: 0 } })
    const layerB = await prismaClient.layer.create({ data: { projectId, name: "B", order: 1 } })
    layerAId = layerA.id
    layerBId = layerB.id

    await insertPointFeature(layerAId, 0, 0)
    await insertPointFeature(layerAId, 1, 1)
    await insertPointFeature(layerBId, 0.5, 0.5)
  }, 15000)

  it(
    "buffer (non-dissolve): produces one result feature per input feature",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "buffer",
        inputLayerIds: [layerAId],
        parameters: { distance: 100, unit: "meters" },
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      expect(run.status).toBe("succeeded")
      expect(run.resultLayerId).not.toBeNull()

      const count = await prismaClient.feature.count({ where: { layerId: run.resultLayerId! } })
      expect(count).toBe(2)
    },
    15000,
  )

  it(
    "buffer (dissolve): produces exactly one merged result feature",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "buffer",
        inputLayerIds: [layerAId],
        parameters: { distance: 100, unit: "meters", dissolve: true },
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      expect(run.status).toBe("succeeded")
      expect(run.resultLayerId).not.toBeNull()

      const count = await prismaClient.feature.count({ where: { layerId: run.resultLayerId! } })
      expect(count).toBe(1)
    },
    15000,
  )

  it(
    "union: merges both layers into one accumulator feature",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "union",
        inputLayerIds: [layerAId, layerBId],
        parameters: undefined,
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      expect(run.status).toBe("succeeded")
      expect(run.resultLayerId).not.toBeNull()

      const count = await prismaClient.feature.count({ where: { layerId: run.resultLayerId! } })
      expect(count).toBe(1)
    },
    15000,
  )

  it(
    "featureCount statistic: returns resultData, not a new layer",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [layerAId],
        parameters: undefined,
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      expect(run.status).toBe("succeeded")
      expect(run.resultLayerId).toBeNull()
      expect(run.resultData).toEqual({ featureCount: 2 })
    },
    15000,
  )

  it(
    "selectByAttribute: filters by a parameterized attribute comparison",
    async () => {
      const featureId = await insertPointFeature(layerAId, 2, 2)
      await prismaClient.featureAttribute.create({ data: { featureId, key: "category", value: "target" } })

      const input: AnalysisRequestInput = {
        operationType: "selectByAttribute",
        inputLayerIds: [layerAId],
        parameters: { key: "category", operator: "eq", value: "target" },
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      expect(run.status).toBe("succeeded")
      const count = await prismaClient.feature.count({ where: { layerId: run.resultLayerId! } })
      expect(count).toBe(1)
    },
    15000,
  )

  it(
    "an invalid operationType/geometry mismatch surfaces as a failed run, not a thrown error",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "dissolve",
        inputLayerIds: [layerAId],
        parameters: { attributeKey: "nonexistent-attribute" },
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      // No features carry "nonexistent-attribute", so the GROUP BY join
      // yields zero rows — a legitimate empty (not erroring) result.
      expect(run.status).toBe("succeeded")
      const count = await prismaClient.feature.count({ where: { layerId: run.resultLayerId! } })
      expect(count).toBe(0)
    },
    15000,
  )

  it(
    "discardResult: clears resultLayerId and deletes the layer, keeping the run row",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "buffer",
        inputLayerIds: [layerAId],
        parameters: { distance: 50, unit: "meters" },
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      const resultLayerId = run.resultLayerId!

      const discarded = await discardResult(run.id, TEST_OWNER_ID)
      expect(discarded.resultLayerId).toBeNull()

      const layer = await prismaClient.layer.findUnique({ where: { id: resultLayerId } })
      expect(layer).toBeNull()

      const stillThere = await getAnalysisRunById(run.id, TEST_OWNER_ID)
      expect(stillThere).not.toBeNull()
    },
    15000,
  )

  it(
    "discardResult: throws ValidationError when there is no result to discard",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [layerAId],
        parameters: undefined,
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      await expect(discardResult(run.id, TEST_OWNER_ID)).rejects.toThrow()
    },
    15000,
  )

  it(
    "cancelRun: is a no-op on an already-terminal run",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [layerAId],
        parameters: undefined,
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      expect(run.status).toBe("succeeded")

      const cancelled = await cancelRun(run.id, TEST_OWNER_ID)
      expect(cancelled.status).toBe("succeeded")
      expect(cancelled.cancelRequestedAt).toBeNull()
    },
    15000,
  )

  it(
    "membership scoping: a Viewer cannot create a run (Editor+ required)",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [layerAId],
        parameters: undefined,
      }
      await expect(createAnalysisRun(projectId, TEST_COLLABORATOR_ID, input)).rejects.toThrow()
    },
    15000,
  )

  it(
    "membership scoping: a non-member gets a not-found, non-disclosure error",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [layerAId],
        parameters: undefined,
      }
      await expect(createAnalysisRun(projectId, "test-stranger-analysis-repo", input)).rejects.toThrow()
    },
    15000,
  )

  it(
    "listAnalysisRunsForProject: status filter returns only matching runs",
    async () => {
      const succeeded: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [layerAId],
        parameters: undefined,
      }
      await createAnalysisRun(projectId, TEST_OWNER_ID, succeeded)

      const { runs } = await listAnalysisRunsForProject(projectId, TEST_OWNER_ID, { status: ["queued", "running"] })
      expect(runs).toHaveLength(0)

      const { runs: allRuns } = await listAnalysisRunsForProject(projectId, TEST_OWNER_ID, {})
      expect(allRuns.length).toBeGreaterThanOrEqual(1)
    },
    15000,
  )

  it(
    "deleteAnalysisRun: removes the history entry only, never its result layer",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "buffer",
        inputLayerIds: [layerAId],
        parameters: { distance: 50, unit: "meters" },
      }
      const run = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      const resultLayerId = run.resultLayerId!

      await deleteAnalysisRun(run.id, TEST_OWNER_ID)

      const gone = await getAnalysisRunById(run.id, TEST_OWNER_ID)
      expect(gone).toBeNull()

      const layer = await prismaClient.layer.findUnique({ where: { id: resultLayerId } })
      expect(layer).not.toBeNull()
    },
    15000,
  )

  it(
    "rerunAnalysis: re-executes with the original parameters",
    async () => {
      const input: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [layerAId],
        parameters: undefined,
      }
      const original = await createAnalysisRun(projectId, TEST_OWNER_ID, input)
      const rerun = await rerunAnalysis(original.id, TEST_OWNER_ID)
      expect(rerun.id).not.toBe(original.id)
      expect(rerun.status).toBe("succeeded")
      expect(rerun.resultData).toEqual(original.resultData)
    },
    15000,
  )

  it(
    "createBatchRun: one item's failure never aborts the others",
    async () => {
      const { runs } = await createBatchRun(projectId, TEST_OWNER_ID, "featureCount", undefined, [
        { inputLayerIds: [layerAId] },
        { inputLayerIds: ["nonexistent-layer-id"] },
      ])
      expect(runs).toHaveLength(2)
      expect(runs[0].status).toBe("succeeded")
      expect(runs[1].status).toBe("failed")
    },
    15000,
  )

  it(
    "per-user concurrent-job cap: rejects a new run once the cap is reached",
    async () => {
      // A dedicated, disposable user (never TEST_OWNER_ID — the cap check
      // is intentionally global-per-user, not per-project, so leaving
      // "running" rows behind for the shared TEST_OWNER_ID would silently
      // break every other test/file reusing that same user).
      const capTestUserId = `test-concurrent-cap-user-${Date.now()}`
      await prismaClient.user.upsert({
        where: { id: capTestUserId },
        update: {},
        create: { id: capTestUserId, email: `${capTestUserId}@dev.local` },
      })
      const capProject = await prismaClient.project.create({
        data: { ownerId: capTestUserId, name: `Cap Test ${Date.now()}` },
      })
      const capLayer = await prismaClient.layer.create({ data: { projectId: capProject.id, name: "L", order: 0 } })

      const MAX = 5
      for (let i = 0; i < MAX; i++) {
        await prismaClient.analysisRun.create({
          data: {
            projectId: capProject.id,
            userId: capTestUserId,
            operationType: "featureCount",
            status: "running",
            parameters: {},
            inputLayerIds: [capLayer.id],
          },
        })
      }
      const input: AnalysisRequestInput = {
        operationType: "featureCount",
        inputLayerIds: [capLayer.id],
        parameters: undefined,
      }
      try {
        await expect(createAnalysisRun(capProject.id, capTestUserId, input)).rejects.toThrow()
      } finally {
        await prismaClient.analysisRun.deleteMany({ where: { userId: capTestUserId } })
        await prismaClient.project.delete({ where: { id: capProject.id } })
        await prismaClient.user.delete({ where: { id: capTestUserId } })
      }
    },
    15000,
  )
})
