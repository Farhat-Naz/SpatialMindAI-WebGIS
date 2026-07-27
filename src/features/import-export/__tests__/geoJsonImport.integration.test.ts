import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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
import { GET as getImport } from "@/app/api/imports/[importJobId]/route"
import { POST as commitChunk } from "@/app/api/imports/[importJobId]/chunks/route"
import { POST as completeImport } from "@/app/api/imports/[importJobId]/complete/route"
import { POST as rollbackImport } from "@/app/api/imports/[importJobId]/rollback/route"
import { GET as listIssues } from "@/app/api/imports/[importJobId]/issues/route"
import { chunkFeatures, toPersistableIssues } from "../services/importPipeline"
import { IMPORT_MAX_PERSISTED_ISSUES } from "../types/importExport.constants"
import { parseGeoJson } from "../services/parsers/geoJsonParser"
import { repairGeometry } from "../utils/repairGeometry"
import { DuplicateTracker } from "../utils/duplicateHash"
import { importIssueMessages } from "../utils/importErrors"
import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import type { NormalizedFeature } from "../types/importExport.types"

/**
 * GeoJSON import, end to end (specs/005-import-export, T127; US1, SC-001, SC-006).
 *
 * Exercises the real path a user takes — parse, preflight, create, chunk,
 * complete — against the real ephemeral PostGIS instance. The worker itself is
 * not involved (jsdom has none); its *logic* is reproduced by `runPreflight`
 * below, which is deliberately the same sequence the worker performs, so this
 * test covers the pipeline rather than the thread it runs on.
 */

const dbAvailable = await isDatabaseAvailable()

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

/**
 * The preflight the worker performs: repair rings, detect in-file duplicates,
 * and tally exact counts. Mirrors `importParser.worker.ts` step for step.
 */
function runPreflight(features: NormalizedFeature[], parserWarnings: ImportIssueDraft[]) {
  const issues: ImportIssueDraft[] = [...parserWarnings]
  const duplicates = new DuplicateTracker()
  const accepted: NormalizedFeature[] = []

  const rejected = parserWarnings.filter((warning) =>
    ["invalid_geometry", "unsupported_geometry_type", "out_of_range_coordinate", "missing_coordinate"].includes(
      warning.category,
    ),
  ).length
  let duplicate = 0
  let repaired = 0

  for (const feature of features) {
    const repair = repairGeometry(feature.geometry)
    if (repair.repaired) {
      repaired += 1
      issues.push({
        sourcePosition: feature.sourcePosition,
        category: "repaired_geometry",
        message: importIssueMessages.repairedGeometry(),
      })
    }
    if (duplicates.isDuplicate(repair.geometry, feature.properties)) {
      duplicate += 1
      issues.push({
        sourcePosition: feature.sourcePosition,
        category: "duplicate_in_file",
        message: importIssueMessages.duplicateInFile(feature.sourcePosition),
      })
      continue
    }
    accepted.push({ ...feature, geometry: repair.geometry })
  }

  return {
    features: accepted,
    issues,
    counts: { rejected, duplicate, repaired },
    totalFeatures: accepted.length + rejected + duplicate,
  }
}

describe.skipIf(!dbAvailable)("GeoJSON import end to end (US1)", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `GeoJSON E2E ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Parcels", order: 0 } })
    layerId = layer.id
  }, 30000)

  /** The whole journey, returning everything the summary panel would show. */
  async function importFixture(mode: "strict" | "lenient" = "lenient") {
    const file = new File([readFileSync(fixturePath, "utf8")], "parcels.geojson", {
      type: "application/geo+json",
    })

    const parsed = await parseGeoJson(file, {})
    const preflight = runPreflight(parsed.features, parsed.warnings)

    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "geojson",
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type,
        sourceCrs: parsed.detectedCrs ?? "EPSG:4326",
        mode,
        totalFeatures: preflight.totalFeatures,
        preflightIssues: toPersistableIssues(preflight.issues, IMPORT_MAX_PERSISTED_ISSUES),
        preflightCounts: preflight.counts,
      }),
      { params: Promise.resolve({ layerId }) },
    )
    expect(createResponse.status).toBe(201)
    const jobId = (await createResponse.json()).importJob.id as string

    let committed = 0
    const chunks = chunkFeatures(preflight.features)
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

    const completeResponse = await completeImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/complete`, "POST", { outcome: "succeeded" }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(completeResponse.status).toBe(200)

    return { jobId, committed, preflight, parsed }
  }

  it("reads the fixture's 25 features and lands them on the layer", async () => {
    const { committed, preflight } = await importFixture()

    // 25 in the file: 24 unique + 1 exact duplicate of the first point.
    expect(preflight.totalFeatures).toBe(25)
    expect(preflight.counts.duplicate).toBe(1)
    expect(committed).toBe(24)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(24)
  }, 60000)

  it("balances imported + rejected + duplicate against total read (SC-006)", async () => {
    const { jobId } = await importFixture()

    const response = await getImport(jsonRequest(`http://localhost/api/imports/${jobId}`, "GET"), {
      params: Promise.resolve({ importJobId: jobId }),
    })
    const { importJob } = await response.json()

    expect(importJob.importedCount + importJob.rejectedCount + importJob.duplicateCount).toBe(
      importJob.totalFeatures,
    )
    expect(importJob.status).toBe("succeeded")
  }, 60000)

  it("preserves string, numeric, and boolean properties as text (FR-016)", async () => {
    const { jobId } = await importFixture()

    const attributes = await prismaClient.featureAttribute.findMany({
      where: { feature: { importJobId: jobId } },
      select: { key: true, value: true },
    })
    const byKey = new Map(attributes.map((row) => [row.key, row.value]))

    expect(byKey.get("ward")).toBeTruthy()
    // A number arrives as its decimal text, a boolean as "true"/"false".
    expect(attributes.some((row) => row.key === "population" && /^\d+$/.test(row.value))).toBe(true)
    expect(attributes.some((row) => row.key === "is_active" && ["true", "false"].includes(row.value))).toBe(
      true,
    )
  }, 60000)

  it("omits null properties rather than storing the text \"null\" (FR-015)", async () => {
    const { jobId } = await importFixture()

    const attributes = await prismaClient.featureAttribute.findMany({
      where: { feature: { importJobId: jobId } },
      select: { key: true, value: true },
    })

    // The fixture has `notes: null` on one point and `surface: null` on every
    // line. A stored "null" is indistinguishable from a genuine string.
    expect(attributes.some((row) => row.value === "null")).toBe(false)
    expect(attributes.some((row) => row.key === "surface")).toBe(false)
  }, 60000)

  it("flattens a nested property to compact JSON (FR-016)", async () => {
    const { jobId } = await importFixture()

    const owner = await prismaClient.featureAttribute.findFirst({
      where: { feature: { importJobId: jobId }, key: "owner" },
      select: { value: true },
    })

    // The fixture's polygons carry `owner: { name, contact }`.
    expect(owner?.value).toMatch(/^\{"name":"Owner \d+"/)
  }, 60000)

  it("stores every geometry as EPSG:4326 across all three types", async () => {
    const { jobId } = await importFixture()

    const rows = await prismaClient.$queryRaw<{ type: string; srid: number; count: bigint }[]>`
      SELECT ST_GeometryType(geometry) AS type, ST_SRID(geometry) AS srid, COUNT(*)::bigint AS count
      FROM "Feature" WHERE "importJobId" = ${jobId}
      GROUP BY 1, 2
    `

    expect(rows.every((row) => row.srid === 4326)).toBe(true)
    const types = rows.map((row) => row.type).sort()
    expect(types).toEqual(["ST_LineString", "ST_Point", "ST_Polygon"])
  }, 60000)

  it("repairs the fixture's unclosed polygon ring and reports it (FR-053)", async () => {
    const { jobId, preflight } = await importFixture()

    // The fixture leaves polygon index 2 unclosed on purpose.
    expect(preflight.counts.repaired).toBe(1)

    const response = await listIssues(
      jsonRequest(`http://localhost/api/imports/${jobId}/issues`, "GET"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    const { issues } = await response.json()

    expect(issues.some((issue: { category: string }) => issue.category === "repaired_geometry")).toBe(true)
    // Repaired features are still imported — the repair is a note about how, not
    // a rejection.
    const stored = await prismaClient.$queryRaw<{ valid: boolean }[]>`
      SELECT bool_and(ST_IsValid(geometry)) AS valid FROM "Feature" WHERE "importJobId" = ${jobId}
    `
    expect(stored[0].valid).toBe(true)
  }, 60000)

  it("records the in-file duplicate as an issue in source order (FR-055)", async () => {
    const { jobId } = await importFixture()

    const response = await listIssues(
      jsonRequest(`http://localhost/api/imports/${jobId}/issues`, "GET"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    const { issues, truncated } = await response.json()

    expect(issues.some((issue: { category: string }) => issue.category === "duplicate_in_file")).toBe(true)
    // Well under the 1,000 cap, so nothing is truncated.
    expect(truncated).toBe(false)

    const positions = issues.map((issue: { sourcePosition: number }) => issue.sourcePosition)
    expect([...positions].sort((a: number, b: number) => a - b)).toEqual(positions)
  }, 60000)

  it("keeps the file's provenance metadata without storing any bytes", async () => {
    const { jobId } = await importFixture()

    const job = await prismaClient.importJob.findUniqueOrThrow({ where: { id: jobId } })
    expect(job.fileName).toBe("parcels.geojson")
    expect(job.fileSizeBytes).toBeGreaterThan(0)
    expect(job.sourceFormat).toBe("geojson")
    // No column anywhere holds the file's contents (research.md Decision 2).
    expect(Object.values(job).some((value) => value instanceof Buffer)).toBe(false)
  }, 60000)

  it("undoes the whole import exactly, leaving the layer empty again (FR-072)", async () => {
    const { jobId, committed } = await importFixture()

    const response = await rollbackImport(
      jsonRequest(`http://localhost/api/imports/${jobId}/rollback`, "POST"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(response.status).toBe(200)
    expect((await response.json()).deletedFeatureCount).toBe(committed)

    await expect(countFeaturesInLayer(layerId)).resolves.toBe(0)
    // Attributes cascade with their features.
    const orphans = await prismaClient.featureAttribute.count({
      where: { feature: { importJobId: jobId } },
    })
    expect(orphans).toBe(0)
  }, 60000)

  it("re-importing the same file commits nothing — every feature is an in-layer duplicate", async () => {
    await importFixture()
    const afterFirst = await countFeaturesInLayer(layerId)

    const second = await importFixture()

    // The duplicate probe recognizes them all, so the layer does not grow.
    expect(second.committed).toBe(0)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(afterFirst)
  }, 90000)
})
