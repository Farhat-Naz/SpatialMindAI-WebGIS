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
import { parseKml } from "../services/parsers/kmlParser"

/**
 * KML / KMZ import, end to end (specs/005-import-export, T156–T157; US3,
 * FR-022–FR-027).
 *
 * The KML/KMZ equivalence assertion is the structural point: the archive is
 * opened client-side, so by the time chunks reach the server the two formats
 * are indistinguishable — which is why no KMZ endpoint exists (research.md
 * Decision 2).
 */

const dbAvailable = await isDatabaseAvailable()

const FIXTURES = resolve(process.cwd(), "src/features/import-export/__tests__/fixtures")

function fixtureFile(name: string): File {
  return new File([readFileSync(resolve(FIXTURES, name))], name)
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

describe.skipIf(!dbAvailable)("KML / KMZ import (US3)", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `KML E2E ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Places", order: 0 } })
    layerId = layer.id
  }, 30000)

  async function importKmlFile(name: string, sourceFormat: "kml" | "kmz") {
    const file = fixtureFile(name)
    const parsed = await parseKml(file, {})

    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat,
        fileName: file.name,
        fileSizeBytes: file.size,
        // KML fixes WGS84 by specification (FR-024).
        sourceCrs: parsed.detectedCrs ?? "EPSG:4326",
        mode: "lenient",
        totalFeatures: parsed.features.length,
        preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
      }),
      { params: Promise.resolve({ layerId }) },
    )
    expect(createResponse.status).toBe(201)
    const jobId = (await createResponse.json()).importJob.id as string

    let committed = 0
    for (const [index, chunk] of chunkFeatures(parsed.features).entries()) {
      const response = await commitChunk(
        jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
          chunkIndex: index,
          features: chunk,
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

  it("imports every placemark across geometry types (FR-023)", async () => {
    const { committed } = await importKmlFile("places.kml", "kml")

    // Depot, Yard A, Route 1, Zone — point, point, line, polygon.
    expect(committed).toBe(4)
    const rows = await prismaClient.$queryRaw<{ type: string }[]>`
      SELECT DISTINCT ST_GeometryType(geometry) AS type
      FROM "Feature" WHERE "layerId" = ${layerId} ORDER BY 1
    `
    expect(rows.map((row) => row.type)).toEqual(["ST_LineString", "ST_Point", "ST_Polygon"])
  }, 60000)

  it("preserves name, description, and folder path as attributes (FR-025)", async () => {
    const { jobId } = await importKmlFile("places.kml", "kml")

    const attributes = await prismaClient.featureAttribute.findMany({
      where: { feature: { importJobId: jobId } },
      select: { key: true, value: true },
    })

    expect(attributes.some((row) => row.key === "name" && row.value === "Depot")).toBe(true)
    expect(attributes.some((row) => row.key === "description" && row.value === "Main depot")).toBe(true)
    // The folder hierarchy survives as data — including nesting.
    const folders = attributes.filter((row) => row.key === "folderPath").map((row) => row.value)
    expect(folders).toContain("North")
    expect(folders).toContain("North/Yards")
    expect(folders).toContain("South")
  }, 60000)

  it("stores 2D geometry — altitude dropped, not persisted (FR-026)", async () => {
    const { jobId } = await importKmlFile("places.kml", "kml")

    // The fixture's points carry altitudes (35, 12). ST_CoordDim = 2 proves the
    // third ordinate never reached the database.
    const rows = await prismaClient.$queryRaw<{ dims: number }[]>`
      SELECT DISTINCT ST_CoordDim(geometry) AS dims FROM "Feature" WHERE "importJobId" = ${jobId}
    `
    expect(rows).toEqual([{ dims: 2 }])
  }, 60000)

  it("KMZ lands identically to its KML equivalent (T157, FR-022)", async () => {
    const kml = await importKmlFile("places.kml", "kml")

    // A second identical import is refused by the duplicate probe, feature for
    // feature — the strongest available proof that the KMZ-derived chunks are
    // byte-equivalent to the KML-derived ones at the API boundary.
    const kmz = await importKmlFile("places.kmz", "kmz")

    expect(kml.committed).toBe(4)
    expect(kmz.committed).toBe(0)
    const job = await prismaClient.importJob.findUniqueOrThrow({ where: { id: kmz.jobId } })
    expect(job.duplicateCount).toBe(4)
    await expect(countFeaturesInLayer(layerId)).resolves.toBe(4)
  }, 90000)

  it("records the unsupported-content findings without failing (FR-027)", async () => {
    const { parsed } = await importKmlFile("places.kml", "kml")
    const messages = parsed.warnings.map((warning) => warning.message).join(" ")

    // GroundOverlay and NetworkLink in the fixture: reported, skipped, and the
    // placemarks still imported.
    expect(messages).toMatch(/overlays/i)
    expect(messages).toMatch(/NetworkLink|external KML/i)
  }, 60000)
})
