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
import { POST as commitChunk } from "@/app/api/imports/[importJobId]/chunks/route"
import { POST as completeImport } from "@/app/api/imports/[importJobId]/complete/route"
import { chunkFeatures } from "../services/importPipeline"
import { parseCustomCrs } from "../services/crsCatalog"
import { parseShapefile } from "../services/parsers/shapefileParser"

/**
 * Zipped Shapefile import, end to end (specs/005-import-export, T143; US2,
 * FR-012, FR-019, SC-009).
 *
 * The positional assertion is the point of this file. A projected shapefile is
 * where a coordinate-system mistake actually costs something, so the test pins a
 * known real-world location — Charing Cross, 530034 E / 180381 N in EPSG:27700 —
 * and asserts the stored WGS84 position lands on it. That is the only way to
 * distinguish "the transform ran" from "the transform ran correctly".
 */

const dbAvailable = await isDatabaseAvailable()

const FIXTURES = resolve(process.cwd(), "src/features/import-export/__tests__/fixtures")

/**
 * The true WGS84 position of the fixture's first feature (530034 E / 180381 N in
 * EPSG:27700).
 *
 * Taken from PostGIS's own `ST_Transform` against its `spatial_ref_sys` entry for
 * 27700 rather than from a published landmark coordinate — the point of the test
 * is that the platform's transform is right, so the reference has to come from
 * the authority the platform uses, at full precision.
 */
const CHARING_CROSS = { lng: -0.127724005742869, lat: 51.50740692743041 }

function zipFile(name: string): File {
  return new File([readFileSync(resolve(FIXTURES, name))], name, { type: "application/zip" })
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

describe.skipIf(!dbAvailable)("zipped Shapefile import (US2)", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Shapefile E2E ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Parcels", order: 0 } })
    layerId = layer.id
  }, 30000)

  /** Parses a zipped shapefile and runs it through the shared endpoints. */
  async function importArchive(name: string, options: { shapefileName?: string } = {}) {
    const file = zipFile(name)
    const parsed = await parseShapefile(file, options)

    // `runPreflight` validates the detected definition through `parseCustomCrs`
    // before it reaches the server; the test parses directly, so it does the same.
    const customCrsDefinition = parsed.detectedCrsDefinition
      ? (parseCustomCrs(parsed.detectedCrsDefinition)?.proj4 ?? undefined)
      : undefined

    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "shapefile",
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: "application/zip",
        // The CRS the .prj declared, applied server-side by ST_Transform.
        sourceCrs: parsed.detectedCrs ?? "EPSG:4326",
        customCrsDefinition,
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

    return { jobId, committed, parsed }
  }

  it("imports from a single ZIP with no component multi-select (FR-017)", async () => {
    const { committed } = await importArchive("parcels_osgb.zip")

    expect(committed).toBe(5)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(5)
  }, 60000)

  it("detects EPSG:27700 from the .prj and records it on the job (FR-019)", async () => {
    const { jobId, parsed } = await importArchive("parcels_osgb.zip")

    expect(parsed.detectedCrs).toBe("EPSG:27700")
    const job = await prismaClient.importJob.findUniqueOrThrow({ where: { id: jobId } })
    expect(job.sourceCrs).toBe("EPSG:27700")
  }, 60000)

  it("stores every geometry as EPSG:4326 (FR-012)", async () => {
    const { jobId } = await importArchive("parcels_osgb.zip")

    const rows = await prismaClient.$queryRaw<{ srid: number }[]>`
      SELECT DISTINCT ST_SRID(geometry) AS srid FROM "Feature" WHERE "importJobId" = ${jobId}
    `
    // Every persisted geometry, platform-wide, is 4326 (Constitution Principle IV).
    expect(rows).toEqual([{ srid: 4326 }])
  }, 60000)

  it("lands the first feature within a metre of its true position (SC-009)", async () => {
    const { jobId } = await importArchive("parcels_osgb.zip")

    // ST_Distance on geography returns metres, which is what SC-009 is stated in.
    const rows = await prismaClient.$queryRaw<{ metres: number; lng: number; lat: number }[]>`
      SELECT ST_Distance(
               geometry::geography,
               ST_SetSRID(ST_MakePoint(${CHARING_CROSS.lng}, ${CHARING_CROSS.lat}), 4326)::geography
             ) AS metres,
             ST_X(geometry) AS lng,
             ST_Y(geometry) AS lat
      FROM "Feature"
      WHERE "importJobId" = ${jobId}
      ORDER BY ST_Distance(
                 geometry::geography,
                 ST_SetSRID(ST_MakePoint(${CHARING_CROSS.lng}, ${CHARING_CROSS.lat}), 4326)::geography
               )
      LIMIT 1
    `

    expect(rows).toHaveLength(1)
    expect(rows[0].metres).toBeLessThan(1)
    // Sanity: degrees, not metres — a failed transform would leave 530034 here.
    expect(rows[0].lng).toBeCloseTo(CHARING_CROSS.lng, 3)
    expect(rows[0].lat).toBeCloseTo(CHARING_CROSS.lat, 3)
  }, 60000)

  it("carries DBF attributes onto the imported features (FR-008)", async () => {
    const { jobId } = await importArchive("parcels_osgb.zip")

    const attributes = await prismaClient.featureAttribute.findMany({
      where: { feature: { importJobId: jobId } },
      select: { key: true, value: true },
    })

    expect(attributes.some((row) => row.key === "WARD" && row.value === "Holborn")).toBe(true)
    expect(attributes.some((row) => row.key === "UPRN")).toBe(true)
    expect(attributes.some((row) => row.key === "POP")).toBe(true)
  }, 60000)

  it("imports from a nested directory inside the archive (FR-017 scenario 2)", async () => {
    const { committed } = await importArchive("parcels_nested.zip")
    expect(committed).toBe(5)
  }, 60000)

  it("imports the chosen shapefile from a multi-shapefile archive (FR-021)", async () => {
    const { committed, jobId } = await importArchive("parcels_multi.zip", { shapefileName: "roads" })

    expect(committed).toBe(2)
    const attributes = await prismaClient.featureAttribute.findMany({
      where: { feature: { importJobId: jobId } },
      select: { key: true },
    })
    // `roads` carries ROAD/SURFACE, not the parcels' WARD/UPRN.
    expect(attributes.some((row) => row.key === "ROAD")).toBe(true)
    expect(attributes.some((row) => row.key === "WARD")).toBe(false)
  }, 60000)

  it("preserves accented attribute values through the whole path (FR-020)", async () => {
    const { jobId } = await importArchive("parcels_latin1.zip")

    const quartiers = await prismaClient.featureAttribute.findMany({
      where: { feature: { importJobId: jobId }, key: "QUARTIER" },
      select: { value: true },
    })
    const values = quartiers.map((row) => row.value)

    expect(values).toContain("Île de Nantes")
    // No mojibake survived to the database.
    expect(values.some((value) => value.includes("Ã") || value.includes("�"))).toBe(false)
  }, 60000)

  it("accepts a .prj with no EPSG authority as a custom definition (FR-063)", async () => {
    const { jobId, committed, parsed } = await importArchive("parcels_custom_prj.zip")

    expect(parsed.detectedCrs).toBe("CUSTOM")
    expect(committed).toBe(5)

    const job = await prismaClient.importJob.findUniqueOrThrow({ where: { id: jobId } })
    // The .prj's WKT, stored as-is. PostGIS transformed against it directly via
    // the three-argument ST_Transform — no spatial_ref_sys row was needed for a
    // grid it has never heard of.
    expect(job.customCrsDefinition).toMatch(/PROJCS/)

    const rows = await prismaClient.$queryRaw<{ srid: number }[]>`
      SELECT DISTINCT ST_SRID(geometry) AS srid FROM "Feature" WHERE "importJobId" = ${jobId}
    `
    expect(rows).toEqual([{ srid: 4326 }])
  }, 60000)
})
