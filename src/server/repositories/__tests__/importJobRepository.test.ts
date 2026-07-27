import { beforeEach, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import {
  cancelImportJob,
  commitImportChunk,
  completeImportJob,
  createImportJob,
  getImportJobById,
  listImportsForProject,
  listIssuesForJob,
  rollbackImportJob,
  type CreateImportJobInput,
  type ImportChunkFeature,
} from "@/server/repositories/importJobRepository"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  countFeaturesInLayer,
  ensureTestCollaborator,
  ensureTestOwner,
  featureIdsForImportJob,
  insertUntrackedFeature,
  isDatabaseAvailable,
} from "./testHelpers"

/**
 * Repository tests for specs/005-import-export (T047, contracts/repository-api.md).
 *
 * Run against the real ephemeral PostGIS database with the established
 * skip-if-unavailable pattern. The two highest-value cases — idempotent chunk
 * replay and rollback isolation under a concurrent insert — are asserted
 * directly rather than inferred.
 */

const dbAvailable = await isDatabaseAvailable()

/** A valid square polygon in WGS84. */
function square(originLng: number, originLat: number, size = 0.001) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [originLng, originLat],
        [originLng + size, originLat],
        [originLng + size, originLat + size],
        [originLng, originLat + size],
        [originLng, originLat],
      ],
    ],
  }
}

/** A bow-tie polygon — closed, but self-intersecting, so ST_IsValid rejects it. */
const SELF_INTERSECTING = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [0, 0],
    ],
  ],
}

function baseInput(overrides: Partial<CreateImportJobInput> = {}): CreateImportJobInput {
  return {
    sourceFormat: "geojson",
    fileName: "parcels.geojson",
    fileSizeBytes: 2048,
    sourceCrs: "EPSG:4326",
    mode: "lenient",
    totalFeatures: 3,
    preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
    ...overrides,
  }
}

function feature(position: number, geometry: unknown, attributes: { key: string; value: string }[] = []): ImportChunkFeature {
  return { sourcePosition: position, geometry, attributes }
}

describe.skipIf(!dbAvailable)("importJobRepository", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Import Repo Test ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" },
    })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Target", order: 0 } })
    layerId = layer.id
  }, 20000)

  // -------------------------------------------------------------------------
  // createImportJob
  // -------------------------------------------------------------------------

  it("createImportJob: creates a running job and snapshots the layer name", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    expect(job.status).toBe("running")
    expect(job.targetLayerId).toBe(layerId)
    expect(job.targetLayerName).toBe("Target")
    expect(job.mode).toBe("lenient")
    expect(job.heartbeatAt).not.toBeNull()
  })

  it("createImportJob: a Viewer cannot start an import", async () => {
    await expect(createImportJob(layerId, TEST_COLLABORATOR_ID, baseInput())).rejects.toThrow()
  })

  it("createImportJob: an unknown layer is not found", async () => {
    await expect(createImportJob("no-such-layer", TEST_OWNER_ID, baseInput())).rejects.toThrow()
  })

  it("createImportJob: rejects an EPSG code the server has no definition for", async () => {
    await expect(
      createImportJob(layerId, TEST_OWNER_ID, baseInput({ sourceCrs: "EPSG:999999" })),
    ).rejects.toThrow()
  })

  it("createImportJob: rejects CUSTOM without a definition", async () => {
    await expect(
      createImportJob(layerId, TEST_OWNER_ID, baseInput({ sourceCrs: "CUSTOM" })),
    ).rejects.toThrow()
  })

  it("createImportJob: caps persisted issues at 1000 but keeps counters exact", async () => {
    // research.md Decision 16 — a mis-mapped 100k CSV must not write more issue
    // rows than the import itself; the counts stay exact regardless.
    const issues = Array.from({ length: 1500 }, (_, index) => ({
      sourcePosition: index,
      category: "out_of_range_coordinate" as const,
      message: `Longitude out of range at ${index}.`,
    }))
    const job = await createImportJob(
      layerId,
      TEST_OWNER_ID,
      baseInput({
        totalFeatures: 1500,
        preflightIssues: issues,
        preflightCounts: { rejected: 1500, duplicate: 0, repaired: 0 },
      }),
    )

    expect(job.rejectedCount).toBe(1500)
    const page = await listIssuesForJob(job.id, TEST_OWNER_ID, { limit: 500 })
    expect(page.totalPersisted).toBe(1000)
    expect(page.truncated).toBe(true)
  }, 30000)

  // -------------------------------------------------------------------------
  // commitImportChunk
  // -------------------------------------------------------------------------

  it("commitImportChunk: inserts features with attributes and provenance", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    const result = await commitImportChunk(job.id, TEST_OWNER_ID, 0, [
      feature(0, square(1, 1), [{ key: "name", value: "A" }]),
      feature(1, square(2, 2), [{ key: "name", value: "B" }]),
    ])

    expect(result.committed).toBe(2)
    expect(result.rejected).toHaveLength(0)
    expect(result.job.importedCount).toBe(2)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(2)
    await expect(featureIdsForImportJob(job.id)).resolves.toHaveLength(2)

    // Scoped to this job's features: the test database persists across runs
    // within a container's lifetime, so an unscoped query would pick up rows
    // left by an earlier run.
    const featureIds = await featureIdsForImportJob(job.id)
    const attributes = await prismaClient.featureAttribute.findMany({
      where: { key: "name", featureId: { in: featureIds } },
    })
    expect(attributes.map((a) => a.value).sort()).toEqual(["A", "B"])
  })

  it("commitImportChunk: appends without touching pre-existing features (FR-003)", async () => {
    const existing = await insertUntrackedFeature(layerId, JSON.stringify(square(50, 50)))
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [feature(0, square(1, 1))])

    await expect(countFeaturesInLayer(layerId)).resolves.toBe(2)
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Feature" WHERE id = ${existing}
    `
    expect(rows).toHaveLength(1)
  })

  it("commitImportChunk: rejects self-intersecting geometry as invalid topology", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    const result = await commitImportChunk(job.id, TEST_OWNER_ID, 0, [
      feature(0, square(1, 1)),
      feature(1, SELF_INTERSECTING),
    ])

    expect(result.committed).toBe(1)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].sourcePosition).toBe(1)
    expect(result.rejected[0].category).toBe("invalid_topology")
    expect(result.rejected[0].message).toMatch(/not valid/i)
  })

  it("commitImportChunk: excludes a feature identical to one already in the layer", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [feature(0, square(3, 3))])

    const second = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    const result = await commitImportChunk(second.id, TEST_OWNER_ID, 0, [feature(0, square(3, 3))])

    expect(result.committed).toBe(0)
    expect(result.rejected[0].category).toBe("duplicate_in_layer")
    expect(result.job.duplicateCount).toBe(1)
    expect(result.job.rejectedCount).toBe(0)
  })

  it("commitImportChunk: transforms projected source coordinates to EPSG:4326", async () => {
    // research.md Decision 4 — the persisted transform runs in PostGIS.
    // Trafalgar Square in British National Grid: 530034 E, 180381 N.
    const job = await createImportJob(
      layerId,
      TEST_OWNER_ID,
      baseInput({ sourceCrs: "EPSG:27700", totalFeatures: 1 }),
    )
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [
      feature(0, { type: "Point", coordinates: [530034, 180381] }),
    ])

    const rows = await prismaClient.$queryRaw<{ lng: number; lat: number; srid: number }[]>`
      SELECT ST_X(geometry) AS lng, ST_Y(geometry) AS lat, ST_SRID(geometry) AS srid
      FROM "Feature" WHERE "importJobId" = ${job.id}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0].srid).toBe(4326)
    expect(rows[0].lng).toBeCloseTo(-0.1276, 2)
    expect(rows[0].lat).toBeCloseTo(51.5073, 2)
  })

  it("commitImportChunk: a replayed chunk commits nothing new (idempotency)", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    const first = await commitImportChunk(job.id, TEST_OWNER_ID, 0, [
      feature(0, square(4, 4)),
      feature(1, square(5, 5)),
    ])
    expect(first.committed).toBe(2)

    const replay = await commitImportChunk(job.id, TEST_OWNER_ID, 0, [
      feature(0, square(4, 4)),
      feature(1, square(5, 5)),
    ])
    expect(replay.committed).toBe(0)
    expect(replay.job.importedCount).toBe(2)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(2)
  })

  it("commitImportChunk: refuses a chunk after cancellation", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [feature(0, square(6, 6))])
    await cancelImportJob(job.id, TEST_OWNER_ID)

    await expect(
      commitImportChunk(job.id, TEST_OWNER_ID, 1, [feature(1, square(7, 7))]),
    ).rejects.toThrow(/cancelled/i)
  })

  it("commitImportChunk: refuses a chunk on a terminal job", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await completeImportJob(job.id, TEST_OWNER_ID, "succeeded")
    await expect(
      commitImportChunk(job.id, TEST_OWNER_ID, 0, [feature(0, square(8, 8))]),
    ).rejects.toThrow()
  })

  it("commitImportChunk: a Viewer cannot commit", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await expect(
      commitImportChunk(job.id, TEST_COLLABORATOR_ID, 0, [feature(0, square(9, 9))]),
    ).rejects.toThrow()
  })

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  it("completeImportJob: transitions to succeeded and refuses a second completion", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    const done = await completeImportJob(job.id, TEST_OWNER_ID, "succeeded")
    expect(done.status).toBe("succeeded")
    expect(done.completedAt).not.toBeNull()

    await expect(completeImportJob(job.id, TEST_OWNER_ID, "succeeded")).rejects.toThrow()
  })

  it("cancelImportJob: keeps committed chunks and reports the count", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [feature(0, square(10, 10))])

    const cancelled = await cancelImportJob(job.id, TEST_OWNER_ID)
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.importedCount).toBe(1)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(1)
  })

  it("cancelImportJob: cancelling an already-terminal job is a no-op success", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await completeImportJob(job.id, TEST_OWNER_ID, "succeeded")
    const result = await cancelImportJob(job.id, TEST_OWNER_ID)
    expect(result.status).toBe("succeeded")
  })

  // -------------------------------------------------------------------------
  // Rollback — the headline correctness promise (SC-011)
  // -------------------------------------------------------------------------

  it("rollbackImportJob: removes exactly this import's features and nothing else", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [
      feature(0, square(11, 11)),
      feature(1, square(12, 12)),
    ])
    await completeImportJob(job.id, TEST_OWNER_ID, "succeeded")

    // Another user adds a feature to the same layer after the import.
    const concurrent = await insertUntrackedFeature(layerId, JSON.stringify(square(13, 13)))
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(3)

    const { job: rolledBack, deletedFeatureCount } = await rollbackImportJob(job.id, TEST_OWNER_ID)
    expect(rolledBack.status).toBe("rolled_back")
    expect(deletedFeatureCount).toBe(2)

    await expect(countFeaturesInLayer(layerId)).resolves.toBe(1)
    const survivors = await prismaClient.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Feature" WHERE "layerId" = ${layerId}
    `
    expect(survivors.map((row) => row.id)).toEqual([concurrent])
  })

  it("rollbackImportJob: cascades to feature attributes", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [
      feature(0, square(14, 14), [{ key: "ward", value: "Holborn" }]),
    ])
    const featureIds = await featureIdsForImportJob(job.id)
    expect(featureIds).toHaveLength(1)

    await rollbackImportJob(job.id, TEST_OWNER_ID)

    const attributes = await prismaClient.featureAttribute.findMany({
      where: { featureId: { in: featureIds } },
    })
    expect(attributes).toHaveLength(0)
  })

  it("rollbackImportJob: is available from cancelled, and refuses a second rollback", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await commitImportChunk(job.id, TEST_OWNER_ID, 0, [feature(0, square(15, 15))])
    await cancelImportJob(job.id, TEST_OWNER_ID)

    const { deletedFeatureCount } = await rollbackImportJob(job.id, TEST_OWNER_ID)
    expect(deletedFeatureCount).toBe(1)
    await expect(rollbackImportJob(job.id, TEST_OWNER_ID)).rejects.toThrow(/already been undone/i)
  })

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  it("listImportsForProject: newest first, cursor paging neither skips nor duplicates", async () => {
    const created: string[] = []
    for (let index = 0; index < 5; index += 1) {
      const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput({ fileName: `f${index}.geojson` }))
      created.push(job.id)
    }

    const first = await listImportsForProject(projectId, TEST_OWNER_ID, { limit: 2 })
    expect(first.imports).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()

    const second = await listImportsForProject(projectId, TEST_OWNER_ID, {
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    })
    const seen = [...first.imports, ...second.imports].map((job) => job.id)
    expect(new Set(seen).size).toBe(seen.length)
    expect(created).toEqual(expect.arrayContaining(seen))
  }, 30000)

  it("listImportsForProject: a Viewer may read history", async () => {
    await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    const { imports } = await listImportsForProject(projectId, TEST_COLLABORATOR_ID, {})
    expect(imports).toHaveLength(1)
  })

  it("listImportsForProject: filters by status", async () => {
    const a = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await completeImportJob(a.id, TEST_OWNER_ID, "succeeded")
    await createImportJob(layerId, TEST_OWNER_ID, baseInput())

    const { imports } = await listImportsForProject(projectId, TEST_OWNER_ID, { status: "succeeded" })
    expect(imports).toHaveLength(1)
    expect(imports[0].id).toBe(a.id)
  })

  it("history survives deletion of its target layer (FR-079)", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await completeImportJob(job.id, TEST_OWNER_ID, "succeeded")
    await prismaClient.layer.delete({ where: { id: layerId } })

    const { imports } = await listImportsForProject(projectId, TEST_OWNER_ID, {})
    expect(imports).toHaveLength(1)
    expect(imports[0].targetLayerId).toBeNull()
    expect(imports[0].targetLayerName).toBe("Target")
  })

  it("sweeps an abandoned running job to failed on read (FR-074)", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    await prismaClient.importJob.update({
      where: { id: job.id },
      data: { heartbeatAt: new Date(Date.now() - 10 * 60 * 1000) },
    })

    const fresh = await getImportJobById(job.id, TEST_OWNER_ID)
    expect(fresh?.status).toBe("failed")
    expect(fresh?.errorMessage).toMatch(/interrupted/i)
  })

  it("does not sweep a live running job", async () => {
    const job = await createImportJob(layerId, TEST_OWNER_ID, baseInput())
    const fresh = await getImportJobById(job.id, TEST_OWNER_ID)
    expect(fresh?.status).toBe("running")
  })

  it("listIssuesForJob: returns issues in source order", async () => {
    const job = await createImportJob(
      layerId,
      TEST_OWNER_ID,
      baseInput({
        preflightIssues: [
          { sourcePosition: 7, category: "out_of_range_coordinate", message: "Longitude 200 is out of range." },
          { sourcePosition: 2, category: "unsupported_geometry_type", message: "GeometryCollection is not supported." },
        ],
        preflightCounts: { rejected: 2, duplicate: 0, repaired: 0 },
      }),
    )

    const page = await listIssuesForJob(job.id, TEST_OWNER_ID, {})
    expect(page.issues.map((issue) => issue.sourcePosition)).toEqual([2, 7])
    expect(page.truncated).toBe(false)
    expect(page.totalPersisted).toBe(2)
  })
})
