import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
import { POST as completeImport } from "@/app/api/imports/[importJobId]/complete/route"
import { chunkFeatures } from "../services/importPipeline"
import { parseGeoJson } from "../services/parsers/geoJsonParser"

/**
 * The append-only invariant (specs/005-import-export, T123; FR-003, SC-001).
 *
 * FR-003 is **the spec's central invariant**: an import adds features and never
 * deletes, overwrites, replaces, or truncates what is already in the layer. It is
 * the one property a user cannot verify for themselves before committing, and the
 * one whose violation is unrecoverable — so it is asserted directly, at the
 * database, rather than inferred from counts.
 *
 * Runs against the real ephemeral PostGIS instance, skipping when unavailable
 * (the established pattern).
 */

const dbAvailable = await isDatabaseAvailable()

// Resolved from the repo root rather than `import.meta.url`: Vitest's transform
// does not give this module a `file:` URL, so `fileURLToPath` throws.
const fixturePath = resolve(
  process.cwd(),
  "src/features/import-export/__tests__/fixtures/parcels.geojson",
)

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

/** A snapshot of a feature exactly as stored, for byte-for-byte comparison. */
interface FeatureSnapshot {
  id: string
  geometry: string
  importJobId: string | null
  attributes: string
}

async function snapshotLayer(layerId: string): Promise<FeatureSnapshot[]> {
  const rows = await prismaClient.$queryRaw<{ id: string; geometry: string; importJobId: string | null }[]>`
    SELECT id, ST_AsEWKT(geometry) AS geometry, "importJobId"
    FROM "Feature" WHERE "layerId" = ${layerId} ORDER BY id
  `
  const snapshots: FeatureSnapshot[] = []
  for (const row of rows) {
    const attributes = await prismaClient.featureAttribute.findMany({
      where: { featureId: row.id },
      orderBy: { key: "asc" },
      select: { key: true, value: true },
    })
    snapshots.push({
      id: row.id,
      geometry: row.geometry,
      importJobId: row.importJobId,
      attributes: JSON.stringify(attributes),
    })
  }
  return snapshots
}

describe.skipIf(!dbAvailable)("import is append-only (FR-003)", () => {
  let projectId: string
  let layerId: string
  let preExisting: FeatureSnapshot[]

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `AppendOnly ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Existing", order: 0 } })
    layerId = layer.id

    // Ten pre-existing features with attributes, created outside any import — so
    // they carry `importJobId: null` and must be untouched by what follows.
    for (let index = 0; index < 10; index += 1) {
      const rows = await prismaClient.$queryRaw<{ id: string }[]>`
        INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${layerId},
                ST_SetSRID(ST_MakePoint(${-1 - index * 0.01}, ${50 + index * 0.01}), 4326),
                NOW(), NOW())
        RETURNING id
      `
      await prismaClient.featureAttribute.create({
        data: { featureId: rows[0].id, key: "origin", value: `pre-existing-${index}` },
      })
    }

    preExisting = await snapshotLayer(layerId)
    expect(preExisting).toHaveLength(10)
  }, 30000)

  /** Runs the full create → chunks → complete sequence for a parsed file. */
  async function importFixture(): Promise<{ jobId: string; committed: number }> {
    const file = new File([readFileSync(fixturePath, "utf8")], "parcels.geojson", {
      type: "application/geo+json",
    })
    const parsed = await parseGeoJson(file, {})

    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "geojson",
        fileName: "parcels.geojson",
        fileSizeBytes: file.size,
        sourceCrs: "EPSG:4326",
        mode: "lenient",
        totalFeatures: parsed.features.length,
        preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
      }),
      { params: Promise.resolve({ layerId }) },
    )
    expect(createResponse.status).toBe(201)
    const jobId = (await createResponse.json()).importJob.id as string

    let committed = 0
    const chunks = chunkFeatures(parsed.features)
    for (let index = 0; index < chunks.length; index += 1) {
      const response = await commitChunk(
        jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
          chunkIndex: index,
          features: chunks[index],
        }),
        { params: Promise.resolve({ importJobId: jobId }) },
      )
      expect(response.status).toBe(200)
      committed += (await response.json()).committed as number
    }

    await completeImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/complete`, "POST", { outcome: "succeeded" }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )

    return { jobId, committed }
  }

  it("adds the imported features alongside the existing ones", async () => {
    const { committed } = await importFixture()

    const total = await countFeaturesInLayer(layerId)
    // 10 pre-existing + everything the import committed. Nothing replaced.
    expect(total).toBe(10 + committed)
    expect(committed).toBeGreaterThan(0)
  }, 60000)

  it("leaves every pre-existing feature byte-identical", async () => {
    await importFixture()

    const after = await snapshotLayer(layerId)
    const survivors = after.filter((feature) => feature.importJobId === null)

    // Same ids, same geometry (compared as EWKT, so SRID and coordinates both
    // count), same attributes.
    expect(survivors).toEqual(preExisting)
  }, 60000)

  it("issues no DELETE or UPDATE against Feature during a normal import", async () => {
    // The strongest available statement of FR-003: not "the rows survived", but
    // "nothing even tried to remove or change them".
    const querySpy = vi.spyOn(prismaClient, "$queryRaw")
    const executeSpy = vi.spyOn(prismaClient, "$executeRaw")

    await importFixture()

    const statements = [...querySpy.mock.calls, ...executeSpy.mock.calls]
      .map((call) => {
        const template = call[0] as unknown as { strings?: string[]; sql?: string }
        return (template.strings?.join(" ") ?? template.sql ?? String(call[0])).toUpperCase()
      })
      .join("\n")

    expect(statements).not.toMatch(/DELETE\s+FROM\s+"?FEATURE"?/)
    expect(statements).not.toMatch(/UPDATE\s+"?FEATURE"?\s+SET/)
    expect(statements).not.toMatch(/TRUNCATE/)

    querySpy.mockRestore()
    executeSpy.mockRestore()
  }, 60000)

  it("tags only the imported features with the job, leaving the rest null", async () => {
    const { jobId } = await importFixture()

    const after = await snapshotLayer(layerId)
    const tagged = after.filter((feature) => feature.importJobId === jobId)
    const untagged = after.filter((feature) => feature.importJobId === null)

    expect(untagged).toHaveLength(10)
    expect(tagged.length).toBeGreaterThan(0)
    // Provenance is what makes "Undo this import" exact rather than a time window.
    expect(tagged.length + untagged.length).toBe(after.length)
  }, 60000)

  it("survives two consecutive imports, accumulating rather than replacing", async () => {
    const first = await importFixture()
    const afterFirst = await countFeaturesInLayer(layerId)

    const second = await importFixture()
    const afterSecond = await countFeaturesInLayer(layerId)

    expect(afterFirst).toBe(10 + first.committed)
    // The second import's features are in-layer duplicates of the first's, so
    // `committed` is legitimately lower — what matters is that the count only
    // ever grows and the original ten are still there.
    expect(afterSecond).toBe(afterFirst + second.committed)

    const survivors = (await snapshotLayer(layerId)).filter((f) => f.importJobId === null)
    expect(survivors).toEqual(preExisting)
  }, 90000)

  it("completes a 1,000-feature import well inside SC-001's 30-second budget", async () => {
    const features = Array.from({ length: 1000 }, (_, index) => ({
      sourcePosition: index,
      geometry: { type: "Point" as const, coordinates: [2 + index * 0.0001, 48 + index * 0.0001] },
      properties: { seq: String(index) },
    }))

    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "geojson",
        fileName: "thousand.geojson",
        fileSizeBytes: 100_000,
        sourceCrs: "EPSG:4326",
        mode: "lenient",
        totalFeatures: 1000,
        preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
      }),
      { params: Promise.resolve({ layerId }) },
    )
    const jobId = (await createResponse.json()).importJob.id as string

    const startedAt = Date.now()
    const chunks = chunkFeatures(features)
    // Four statements per 1,000-feature chunk, not three per feature
    // (research.md Decision 5) — which is what makes this budget reachable.
    expect(chunks).toHaveLength(1)

    for (let index = 0; index < chunks.length; index += 1) {
      const response = await commitChunk(
        jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
          chunkIndex: index,
          features: chunks[index],
        }),
        { params: Promise.resolve({ importJobId: jobId }) },
      )
      expect(response.status).toBe(200)
    }
    const elapsedMs = Date.now() - startedAt

    expect(elapsedMs).toBeLessThan(30_000)

    // And the ten pre-existing features are still untouched.
    const survivors = (await snapshotLayer(layerId)).filter((f) => f.importJobId === null)
    expect(survivors).toEqual(preExisting)
  }, 60000)
})
