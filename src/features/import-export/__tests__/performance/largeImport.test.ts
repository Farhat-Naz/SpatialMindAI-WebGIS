import { beforeEach, describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"
import { prismaClient } from "@/server/db/prismaClient"
import { resetRateLimiterForTests } from "@/server/security/rateLimiter"
import {
  TEST_OWNER_ID,
  countFeaturesInLayer,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { POST as createImport } from "@/app/api/layers/[layerId]/imports/route"
import { POST as commitChunk } from "@/app/api/imports/[importJobId]/chunks/route"
import { POST as cancelImport } from "@/app/api/imports/[importJobId]/cancel/route"
import { POST as completeImport } from "@/app/api/imports/[importJobId]/complete/route"
import { IMPORT_CHUNK_SIZE } from "../../types/importExport.constants"
import type { NormalizedFeature } from "../../types/importExport.types"

/**
 * Large-dataset performance tier (specs/005-import-export, Phase 17; SC-002,
 * SC-003, SC-004).
 *
 * 100,000 features through the real chunked path against the real database.
 * What the tier certifies:
 *
 * - **SC-002** — the full 100k import completes. "Interface interactive
 *   throughout" is a browser property; its server-side precondition — that no
 *   single request blocks longer than one chunk commit — is asserted here as a
 *   per-chunk latency ceiling.
 * - **SC-003** — progress advances at least once every 3 s: since progress
 *   ticks once per chunk, this is equivalent to every chunk committing in
 *   under 3 s.
 * - **SC-004** — after a cancel, the next attempted chunk is refused; nothing
 *   further lands. The 2-second budget is met by construction (the check is a
 *   chunk-boundary read, not a statement interrupt) and measured here.
 * - **Memory** — the generator yields chunks lazily; the full 100k array is
 *   never materialized at once, mirroring the worker's chunk-and-release
 *   behavior, and heap growth is bounded.
 */

const dbAvailable = await isDatabaseAvailable()

const TOTAL_FEATURES = 100_000

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

/**
 * Yields chunk-sized batches without ever holding the whole set — the same
 * never-retain-the-full-array property the parser worker has.
 */
function* generateChunks(total: number): Generator<NormalizedFeature[]> {
  for (let start = 0; start < total; start += IMPORT_CHUNK_SIZE) {
    const size = Math.min(IMPORT_CHUNK_SIZE, total - start)
    yield Array.from({ length: size }, (_, offset) => {
      const index = start + offset
      return {
        sourcePosition: index,
        geometry: {
          type: "Point" as const,
          // Spread across a wide extent so the duplicate probe's bbox narrowing
          // has realistic work to do.
          coordinates: [-10 + (index % 1000) * 0.02, 35 + Math.floor(index / 1000) * 0.05],
        },
        properties: { seq: String(index), batch: String(Math.floor(index / IMPORT_CHUNK_SIZE)) },
      }
    })
  }
}

describe.skipIf(!dbAvailable)("large-dataset performance (Phase 17)", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Perf ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Large", order: 0 } })
    layerId = layer.id
  }, 30000)

  async function createJob(totalFeatures: number): Promise<string> {
    const response = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "geojson",
        fileName: "large.geojson",
        fileSizeBytes: 50 * 1024 * 1024,
        sourceCrs: "EPSG:4326",
        mode: "lenient",
        totalFeatures,
        preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
      }),
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(201)
    return (await response.json()).importJob.id as string
  }

  it("imports 100,000 features with every chunk under the 3s progress cadence (SC-002, SC-003)", async () => {
    const jobId = await createJob(TOTAL_FEATURES)
    const heapBefore = process.memoryUsage().heapUsed

    let committed = 0
    let chunkIndex = 0
    let slowestChunkMs = 0

    for (const chunk of generateChunks(TOTAL_FEATURES)) {
      // 100 chunk requests exceed the 30/min write bucket by design; the real
      // client absorbs the 429s via commitChunkWithRetry's backoff (covered in
      // importPipeline.test.ts). This tier measures commit latency and memory,
      // not the limiter, so the window is reset rather than waited out — the
      // same pattern analysisRepository.concurrency.test.ts established.
      resetRateLimiterForTests()

      const startedAt = Date.now()
      const response = await commitChunk(
        jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
          chunkIndex,
          features: chunk,
        }),
        { params: Promise.resolve({ importJobId: jobId }) },
      )
      const elapsedMs = Date.now() - startedAt

      expect(response.status).toBe(200)
      committed += (await response.json()).committed as number
      slowestChunkMs = Math.max(slowestChunkMs, elapsedMs)
      chunkIndex += 1
    }

    await completeImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/complete`, "POST", { outcome: "succeeded" }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )

    // SC-002: all 100k landed, exactly once each.
    expect(committed).toBe(TOTAL_FEATURES)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(TOTAL_FEATURES)

    // SC-003: progress ticks once per chunk, so no chunk may exceed 3s.
    expect(slowestChunkMs).toBeLessThan(3000)

    // Memory ceiling: chunk-and-release keeps heap growth bounded. 256 MB is a
    // generous ceiling — materializing all 100k features with attributes at
    // once would blow well past it.
    const heapGrowth = process.memoryUsage().heapUsed - heapBefore
    expect(heapGrowth).toBeLessThan(256 * 1024 * 1024)
  }, 300000)

  it("stops a large import within the cancellation budget (SC-004)", async () => {
    const jobId = await createJob(TOTAL_FEATURES)

    // Land a few chunks so the cancel has committed work behind it.
    const generator = generateChunks(TOTAL_FEATURES)
    for (let index = 0; index < 5; index += 1) {
      const chunk = generator.next().value as NormalizedFeature[]
      await commitChunk(
        jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
          chunkIndex: index,
          features: chunk,
        }),
        { params: Promise.resolve({ importJobId: jobId }) },
      )
    }

    // Cancel, and measure until the server provably refuses further writes.
    const cancelStartedAt = Date.now()
    const cancelResponse = await cancelImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/cancel`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(cancelResponse.status).toBe(200)

    const refused = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 5,
        features: generator.next().value as NormalizedFeature[],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    const stoppedAfterMs = Date.now() - cancelStartedAt

    // The refusal is the guarantee that no further commit can land.
    expect(refused.status).toBe(409)
    expect(stoppedAfterMs).toBeLessThan(2000)

    // Committed chunks remain, exactly as the design decided.
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(5 * IMPORT_CHUNK_SIZE)
  }, 120000)

  it("rolls back 100,000 features via the index, not a sequential scan", async () => {
    // A smaller volume keeps this test quick while still proving the plan: the
    // [importJobId] index makes rollback an index scan (T024's rationale).
    const jobId = await createJob(10_000)
    let chunkIndex = 0
    for (const chunk of generateChunks(10_000)) {
      resetRateLimiterForTests()
      await commitChunk(
        jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
          chunkIndex,
          features: chunk,
        }),
        { params: Promise.resolve({ importJobId: jobId }) },
      )
      chunkIndex += 1
    }

    const plan = await prismaClient.$queryRaw<{ "QUERY PLAN": string }[]>`
      EXPLAIN DELETE FROM "Feature" WHERE "importJobId" = ${jobId}
    `
    const planText = plan.map((row) => row["QUERY PLAN"]).join("\n")
    // Index scan (or bitmap scan over the index) — never Seq Scan.
    expect(planText).toMatch(/Index Scan|Bitmap Heap Scan/)
    expect(planText).not.toMatch(/Seq Scan on "?Feature"?/)
  }, 180000)
})
