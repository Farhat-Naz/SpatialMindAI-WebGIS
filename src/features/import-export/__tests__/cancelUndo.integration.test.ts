import { beforeEach, describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  countFeaturesInLayer,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { POST as createImport } from "@/app/api/layers/[layerId]/imports/route"
import { POST as commitChunk } from "@/app/api/imports/[importJobId]/chunks/route"
import { POST as cancelImport } from "@/app/api/imports/[importJobId]/cancel/route"
import { POST as rollbackImport } from "@/app/api/imports/[importJobId]/rollback/route"
import { GET as getImport } from "@/app/api/imports/[importJobId]/route"
import type { NormalizedFeature } from "../types/importExport.types"

/**
 * The full US9 cancel → undo journey (specs/005-import-export, Phase 15/19;
 * FR-066–FR-073, SC-004, SC-011).
 *
 * The design decision under test: cancellation keeps what was already committed
 * (spec Assumptions), the summary states exactly how many features that was
 * (FR-070), and "Undo this import" then removes exactly those — while a
 * concurrent user's features in the same layer survive (SC-011).
 */

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

function points(count: number, offset = 0): NormalizedFeature[] {
  return Array.from({ length: count }, (_, index) => ({
    sourcePosition: offset + index,
    geometry: {
      type: "Point" as const,
      coordinates: [(offset + index) * 0.001 + 0.001, 48 + index * 0.0001],
    },
    properties: { seq: String(offset + index) },
  }))
}

describe.skipIf(!dbAvailable)("cancel → undo journey (US9)", () => {
  let projectId: string
  let layerId: string
  let jobId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `CancelUndo ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Target", order: 0 } })
    layerId = layer.id

    // A large declared import; only some chunks will land before the cancel.
    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "geojson",
        fileName: "big.geojson",
        fileSizeBytes: 1024,
        sourceCrs: "EPSG:4326",
        mode: "lenient",
        totalFeatures: 5000,
        preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
      }),
      { params: Promise.resolve({ layerId }) },
    )
    jobId = (await createResponse.json()).importJob.id as string
  }, 30000)

  async function commit(chunkIndex: number, features: NormalizedFeature[]) {
    return commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", { chunkIndex, features }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
  }

  it("walks the whole journey: partial import → cancel → verify → undo → verify", async () => {
    // 1. Two chunks land (2,000 of the declared 5,000).
    expect((await commit(0, points(1000, 0))).status).toBe(200)
    expect((await commit(1, points(1000, 1000))).status).toBe(200)

    // 2. Cancel. Committed chunks REMAIN — the confirmed design decision.
    const cancelResponse = await cancelImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/cancel`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(cancelResponse.status).toBe(200)
    const cancelled = (await cancelResponse.json()).importJob

    // FR-070: the summary states exactly what was imported before the cancel.
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.importedCount).toBe(2000)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(2000)

    // 3. The server refuses further chunks — a stale client cannot keep writing.
    expect((await commit(2, points(1000, 2000))).status).toBe(409)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(2000)

    // 4. A concurrent user adds a feature to the same layer.
    const concurrent = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${layerId},
              ST_SetSRID(ST_MakePoint(-9.9, 39.9), 4326), NOW(), NOW())
      RETURNING id
    `
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(2001)

    // 5. Undo removes exactly the import's 2,000 — the concurrent feature
    //    survives, because the predicate is provenance, not a time window.
    const rollbackResponse = await rollbackImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/rollback`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(rollbackResponse.status).toBe(200)
    expect((await rollbackResponse.json()).deletedFeatureCount).toBe(2000)

    await expect(countFeaturesInLayer(layerId)).resolves.toBe(1)
    const survivor = await prismaClient.feature.findUnique({ where: { id: concurrent[0].id } })
    expect(survivor).not.toBeNull()

    // 6. The journey is recorded honestly in history.
    const historyResponse = await getImport(
      jsonRequest(`http://localhost/api/imports/${jobId}`, "GET"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    const finalJob = (await historyResponse.json()).importJob
    expect(finalJob.status).toBe("rolled_back")
    expect(finalJob.importedCount).toBe(2000)
  }, 90000)

  it("cancel on an already-cancelled job is a no-op success, not an error", async () => {
    await cancelImport(jsonRequest(`http://localhost/api/imports/${jobId}/cancel`, "POST"), {
      params: Promise.resolve({ importJobId: jobId }),
    })

    const second = await cancelImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/cancel`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    // Deliberately mirrors analysis cancel's documented behavior.
    expect(second.status).toBe(200)
  }, 60000)

  it("rollback is reachable from cancelled without passing through complete (FR-072)", async () => {
    await commit(0, points(100, 0))
    await cancelImport(jsonRequest(`http://localhost/api/imports/${jobId}/cancel`, "POST"), {
      params: Promise.resolve({ importJobId: jobId }),
    })

    const rollbackResponse = await rollbackImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/rollback`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(rollbackResponse.status).toBe(200)
    expect((await rollbackResponse.json()).deletedFeatureCount).toBe(100)
  }, 60000)
})
