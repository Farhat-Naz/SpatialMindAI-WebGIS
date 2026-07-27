import { beforeEach, describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_COLLABORATOR_ID,
  TEST_OWNER_ID,
  countFeaturesInLayer,
  ensureTestCollaborator,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { POST as createImport } from "@/app/api/layers/[layerId]/imports/route"
import { GET as getImport } from "@/app/api/imports/[importJobId]/route"
import { POST as commitChunk } from "@/app/api/imports/[importJobId]/chunks/route"
import { POST as completeImport } from "@/app/api/imports/[importJobId]/complete/route"
import { POST as cancelImport } from "@/app/api/imports/[importJobId]/cancel/route"
import { POST as rollbackImport } from "@/app/api/imports/[importJobId]/rollback/route"
import { GET as listIssues } from "@/app/api/imports/[importJobId]/issues/route"
import { GET as listImports } from "@/app/api/projects/[projectId]/imports/route"
import { POST as logExportRoute } from "@/app/api/projects/[projectId]/exports/route"

/**
 * API-layer tests for specs/005-import-export Phase 4 (T057–T069).
 *
 * T057–T061 prove each of the five source formats traverses the **same**
 * format-agnostic endpoint pair — there is no per-format import route, because
 * parsing happens in the browser and every format arrives as identical
 * normalized chunks (research.md Decisions 2, 3).
 *
 * T062–T067 prove the export side needs no execution endpoint at all: the
 * existing exports route logs a finished attempt and never drives one.
 */

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

function point(lng: number, lat: number) {
  return { type: "Point", coordinates: [lng, lat] }
}

interface CreateBodyOverrides {
  sourceFormat?: string
  sourceCrs?: string
  mode?: string
  totalFeatures?: number
  fileName?: string
  columnMapping?: unknown
  preflightIssues?: unknown[]
  customCrsDefinition?: string
}

function createBody(overrides: CreateBodyOverrides = {}) {
  return {
    sourceFormat: "geojson",
    fileName: "parcels.geojson",
    fileSizeBytes: 4096,
    sourceCrs: "EPSG:4326",
    mode: "lenient",
    totalFeatures: 2,
    preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
    ...overrides,
  }
}

describe.skipIf(!dbAvailable)("import API", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    await ensureTestCollaborator()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Import API ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    await prismaClient.projectMember.create({
      data: { projectId, userId: TEST_COLLABORATOR_ID, role: "Viewer" },
    })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "API Target", order: 0 } })
    layerId = layer.id
  }, 20000)

  async function startJob(overrides: CreateBodyOverrides = {}): Promise<string> {
    const response = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", createBody(overrides)),
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    return body.importJob.id as string
  }

  // -------------------------------------------------------------------------
  // T049 / T068 — create + validation
  // -------------------------------------------------------------------------

  it("creates a job and returns 201", async () => {
    const response = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", createBody()),
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.importJob.status).toBe("running")
    expect(body.importJob.targetLayerName).toBe("API Target")
  })

  it("rejects a malformed create body with INVALID_INPUT", async () => {
    const response = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", { sourceFormat: "dwg" }),
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("INVALID_INPUT")
  })

  it("rejects CUSTOM without a definition", async () => {
    const response = await createImport(
      jsonRequest(
        `http://localhost/api/layers/${layerId}/imports`,
        "POST",
        createBody({ sourceCrs: "CUSTOM" }),
      ),
      { params: Promise.resolve({ layerId }) },
    )
    expect(response.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // T057–T061 — every format traverses the same endpoints
  // -------------------------------------------------------------------------

  it("T057 GeoJSON: features land with attributes through the shared endpoint", async () => {
    const jobId = await startJob()
    const response = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [
          { sourcePosition: 0, geometry: point(1, 1), properties: { name: "A", pop: 42 } },
          { sourcePosition: 1, geometry: point(2, 2), properties: { name: "B" } },
        ],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.committed).toBe(2)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(2)

    // Non-string properties survive as text (FR-016).
    const rows = await prismaClient.featureAttribute.findMany({ where: { key: "pop" } })
    expect(rows.some((row) => row.value === "42")).toBe(true)
  })

  it("T058 Shapefile: projected coordinates transform server-side", async () => {
    // No `Import Shapefile` route exists — the client parses the ZIP and posts
    // untransformed EPSG:27700 coordinates through the same chunk endpoint.
    const jobId = await startJob({ sourceFormat: "shapefile", sourceCrs: "EPSG:27700", totalFeatures: 1 })
    const response = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 0, geometry: point(530034, 180381), properties: { uprn: "1" } }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(200)

    const rows = await prismaClient.$queryRaw<{ lng: number; srid: number }[]>`
      SELECT ST_X(geometry) AS lng, ST_SRID(geometry) AS srid
      FROM "Feature" WHERE "importJobId" = ${jobId}
    `
    expect(rows[0].srid).toBe(4326)
    expect(rows[0].lng).toBeCloseTo(-0.1276, 2)
  })

  it("T059/T060 KML and KMZ are indistinguishable at the API boundary", async () => {
    // The archive is opened client-side, so the server sees identical chunks.
    const kmlJob = await startJob({ sourceFormat: "kml", totalFeatures: 1 })
    const kmzJob = await startJob({ sourceFormat: "kmz", totalFeatures: 1 })

    const chunk = {
      chunkIndex: 0,
      features: [
        { sourcePosition: 0, geometry: point(3, 3), properties: { name: "Site", folder: "Sites/North" } },
      ],
    }

    for (const jobId of [kmlJob, kmzJob]) {
      const response = await commitChunk(
        jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", chunk),
        { params: Promise.resolve({ importJobId: jobId }) },
      )
      expect(response.status).toBe(200)
    }

    // The second is refused as an existing-layer duplicate — proof the two
    // payloads are byte-identical as far as the server is concerned.
    const rows = await prismaClient.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "Feature" WHERE "layerId" = ${layerId}
    `
    expect(Number(rows[0].count)).toBe(1)
  })

  it("T061 CSV: column mapping round-trips on the job record", async () => {
    const jobId = await startJob({
      sourceFormat: "csv",
      totalFeatures: 1,
      columnMapping: {
        latitudeColumn: "lat",
        longitudeColumn: "lon",
        delimiter: ",",
        hasHeaderRow: true,
        attributeColumns: ["site"],
      },
    })

    await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 1, geometry: point(4, 4), properties: { site: "Depot" } }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )

    const response = await getImport(
      jsonRequest(`http://localhost/api/imports/${jobId}`, "GET"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    const body = await response.json()
    expect(body.importJob.columnMapping.latitudeColumn).toBe("lat")
    expect(body.importJob.sourceFormat).toBe("csv")
  })

  // -------------------------------------------------------------------------
  // T050 / T068 — the chunk endpoint is the security boundary
  // -------------------------------------------------------------------------

  it("rejects a geometry the client never validated", async () => {
    const jobId = await startJob()
    const response = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 0, geometry: { type: "GeometryCollection", geometries: [] } }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("INVALID_INPUT")
  })

  it("rejects out-of-range WGS84 coordinates", async () => {
    const jobId = await startJob()
    const response = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 7, geometry: point(200, 10) }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error.message).toMatch(/position 7/)
  })

  it("accepts projected coordinates that would fail a WGS84 range check", async () => {
    // The mirror of the previous case: 530034 is a valid easting, and range
    // checking a projected *input* would be wrong (research.md Decision 4).
    const jobId = await startJob({ sourceCrs: "EPSG:27700", totalFeatures: 1 })
    const response = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 0, geometry: point(530034, 180381) }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(200)
  })

  it("rejects a chunk over the feature limit", async () => {
    const jobId = await startJob()
    const features = Array.from({ length: 1001 }, (_, index) => ({
      sourcePosition: index,
      geometry: point(index / 1000, 1),
    }))
    const response = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", { chunkIndex: 0, features }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(400)
  }, 20000)

  // -------------------------------------------------------------------------
  // T051–T053 lifecycle, T069 error mapping
  // -------------------------------------------------------------------------

  it("completes a job, then refuses a second completion with CONFLICT", async () => {
    const jobId = await startJob()
    const first = await completeImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/complete`, "POST", { outcome: "succeeded" }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(first.status).toBe(200)

    const second = await completeImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/complete`, "POST", { outcome: "succeeded" }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(second.status).toBe(409)
    expect((await second.json()).error.code).toBe("CONFLICT")
  })

  it("refuses a chunk after cancellation with CONFLICT", async () => {
    const jobId = await startJob()
    await cancelImport(jsonRequest(`http://localhost/api/imports/${jobId}/cancel`, "POST"), {
      params: Promise.resolve({ importJobId: jobId }),
    })

    const response = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 0, geometry: point(5, 5) }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(409)
  })

  it("rolls back exactly this import's features and refuses a second rollback", async () => {
    const jobId = await startJob()
    await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 0, geometry: point(6, 6) }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )

    const first = await rollbackImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/rollback`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(first.status).toBe(200)
    expect((await first.json()).deletedFeatureCount).toBe(1)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(0)

    const second = await rollbackImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/rollback`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(second.status).toBe(409)
  })

  it("returns NOT_FOUND for an unknown job", async () => {
    const response = await getImport(
      jsonRequest("http://localhost/api/imports/no-such-job", "GET"),
      { params: Promise.resolve({ importJobId: "no-such-job" }) },
    )
    expect(response.status).toBe(404)
  })

  // -------------------------------------------------------------------------
  // T055 / T056 reads
  // -------------------------------------------------------------------------

  it("lists issues in source order and reports truncation state", async () => {
    const jobId = await startJob({
      preflightIssues: [
        { sourcePosition: 9, category: "invalid_geometry", message: "No geometry." },
        { sourcePosition: 3, category: "duplicate_in_file", message: "Duplicate of 1." },
      ],
    })
    const response = await listIssues(
      jsonRequest(`http://localhost/api/imports/${jobId}/issues`, "GET"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.issues.map((issue: { sourcePosition: number }) => issue.sourcePosition)).toEqual([3, 9])
    expect(body.truncated).toBe(false)
  })

  it("rejects a non-positive limit on history", async () => {
    const response = await listImports(
      jsonRequest(`http://localhost/api/projects/${projectId}/imports?limit=0`, "GET"),
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })

  it("rejects an unrecognized status filter", async () => {
    const response = await listImports(
      jsonRequest(`http://localhost/api/projects/${projectId}/imports?status=pending`, "GET"),
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })

  it("returns history newest first", async () => {
    await startJob({ fileName: "one.geojson" })
    await startJob({ fileName: "two.geojson" })

    const response = await listImports(
      jsonRequest(`http://localhost/api/projects/${projectId}/imports`, "GET"),
      { params: Promise.resolve({ projectId }) },
    )
    const body = await response.json()
    expect(body.imports).toHaveLength(2)
    expect(body.imports[0].fileName).toBe("two.geojson")
  })

  // -------------------------------------------------------------------------
  // T296 (brought forward) — FR-080 enforced at the API, not just the UI
  // -------------------------------------------------------------------------

  it("a Viewer may read history but cannot write", async () => {
    const jobId = await startJob()
    process.env.DEV_USER_ID = TEST_COLLABORATOR_ID

    const read = await listImports(
      jsonRequest(`http://localhost/api/projects/${projectId}/imports`, "GET"),
      { params: Promise.resolve({ projectId }) },
    )
    expect(read.status).toBe(200)

    const create = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", createBody()),
      { params: Promise.resolve({ layerId }) },
    )
    expect(create.status).toBe(403)

    const chunk = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [{ sourcePosition: 0, geometry: point(7, 7) }],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(chunk.status).toBe(403)

    const rollback = await rollbackImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/rollback`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(rollback.status).toBe(403)

    process.env.DEV_USER_ID = TEST_OWNER_ID
  })

  // -------------------------------------------------------------------------
  // T062–T067 — export needs no execution endpoint
  // -------------------------------------------------------------------------

  it.each(["geojson", "shapefile", "kml", "csv", "pdf"] as const)(
    "T062–T066 logs a finished %s export without any execution endpoint",
    async (format) => {
      const response = await logExportRoute(
        jsonRequest(`http://localhost/api/projects/${projectId}/exports`, "POST", {
          format,
          status: "succeeded",
          scope: "layer",
          sourceLayerId: layerId,
          outputCrs: "EPSG:4326",
          featureCount: 3,
        }),
        { params: Promise.resolve({ projectId }) },
      )
      expect(response.status).toBe(201)
      const body = await response.json()
      expect(body.exportJob.format).toBe(format)
      expect(body.exportJob.scope).toBe("layer")
    },
  )

  it("T067 the existing exports route still accepts a 007-shaped call with no scope", async () => {
    const response = await logExportRoute(
      jsonRequest(`http://localhost/api/projects/${projectId}/exports`, "POST", {
        format: "geojson",
        status: "succeeded",
        sourceLayerId: layerId,
        featureCount: 1,
      }),
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(201)
    expect((await response.json()).exportJob.scope).toBe("layer")
  })

  it("rejects a project-scope export that names a source layer", async () => {
    const response = await logExportRoute(
      jsonRequest(`http://localhost/api/projects/${projectId}/exports`, "POST", {
        format: "geojson",
        status: "succeeded",
        scope: "project",
        sourceLayerId: layerId,
      }),
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })
})
