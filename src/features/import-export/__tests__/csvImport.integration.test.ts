import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import type { NextRequest } from "next/server"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { POST as createImport } from "@/app/api/layers/[layerId]/imports/route"
import { POST as commitChunk } from "@/app/api/imports/[importJobId]/chunks/route"
import { POST as completeImport } from "@/app/api/imports/[importJobId]/complete/route"
import { GET as listIssues } from "@/app/api/imports/[importJobId]/issues/route"
import type { ColumnMapping } from "@/shared/contracts/importJob.schema"
import { chunkFeatures, toPersistableIssues } from "../services/importPipeline"
import { IMPORT_MAX_PERSISTED_ISSUES } from "../types/importExport.constants"
import { parseCsv } from "../services/parsers/csvParser"

/**
 * CSV import, end to end (specs/005-import-export, T171; US4, FR-028–FR-033).
 *
 * CSV is the one format where the *user's mapping decision* defines the
 * geometry, so the load-bearing assertions here are that the mapping
 * round-trips on the job (a past import's interpretation stays reproducible)
 * and that a skipped row is reported by the 1-based line number the user can
 * actually find in a spreadsheet (FR-033).
 */

const dbAvailable = await isDatabaseAvailable()

const FIXTURES = resolve(process.cwd(), "src/features/import-export/__tests__/fixtures")

function fixtureFile(name: string): File {
  return new File([readFileSync(resolve(FIXTURES, name))], name, { type: "text/csv" })
}

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

describe.skipIf(!dbAvailable)("CSV import (US4)", () => {
  let projectId: string
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `CSV E2E ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Sites", order: 0 } })
    layerId = layer.id
  }, 30000)

  async function importCsv(name: string, columnMapping: ColumnMapping) {
    const file = fixtureFile(name)
    const parsed = await parseCsv(file, { columnMapping })

    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "csv",
        fileName: file.name,
        fileSizeBytes: file.size,
        sourceCrs: "EPSG:4326",
        mode: "lenient",
        totalFeatures: parsed.features.length + parsed.warnings.length,
        columnMapping,
        preflightIssues: toPersistableIssues(parsed.warnings, IMPORT_MAX_PERSISTED_ISSUES),
        preflightCounts: {
          rejected: parsed.warnings.filter((w) => w.category === "missing_coordinate").length,
          duplicate: 0,
          repaired: 0,
        },
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

  const standardMapping: ColumnMapping = {
    latitudeColumn: "lat",
    longitudeColumn: "lon",
    delimiter: ",",
    hasHeaderRow: true,
    attributeColumns: [],
  }

  it("creates one point per valid row, skipping the broken one (FR-031, FR-032)", async () => {
    const { committed } = await importCsv("sites.csv", standardMapping)

    // 5 data rows, one with empty coordinates.
    expect(committed).toBe(4)

    const rows = await prismaClient.$queryRaw<{ lng: number; lat: number }[]>`
      SELECT ST_X(geometry) AS lng, ST_Y(geometry) AS lat
      FROM "Feature" WHERE "layerId" = ${layerId} ORDER BY lng
    `
    // Longitude first — the classic swap would put 51.5 here.
    expect(rows.every((row) => row.lng < 0 && row.lat > 51)).toBe(true)
  }, 60000)

  it("reports the skipped row by its 1-based spreadsheet line number (FR-033)", async () => {
    const { jobId } = await importCsv("sites.csv", standardMapping)

    const response = await listIssues(
      jsonRequest(`http://localhost/api/imports/${jobId}/issues`, "GET"),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    const { issues } = await response.json()

    const missing = issues.find(
      (issue: { category: string }) => issue.category === "missing_coordinate",
    )
    // The broken row is line 4 in the file: header on line 1, then rows 2–6.
    expect(missing?.sourcePosition).toBe(4)
    expect(missing?.message).toMatch(/"lat"/)
  }, 60000)

  it("carries non-coordinate columns as attributes, coordinates excluded", async () => {
    const { jobId } = await importCsv("sites.csv", standardMapping)

    const attributes = await prismaClient.featureAttribute.findMany({
      where: { feature: { importJobId: jobId } },
      select: { key: true, value: true },
    })
    const keys = new Set(attributes.map((row) => row.key))

    expect(keys.has("name")).toBe(true)
    expect(keys.has("population")).toBe(true)
    // The coordinate columns became geometry, not attributes.
    expect(keys.has("lat")).toBe(false)
    expect(keys.has("lon")).toBe(false)
  }, 60000)

  it("round-trips the column mapping on the job record (T061, FR-030)", async () => {
    const { jobId } = await importCsv("sites.csv", standardMapping)

    const job = await prismaClient.importJob.findUniqueOrThrow({ where: { id: jobId } })
    // A past import's interpretation stays reproducible from history.
    expect(job.columnMapping).toMatchObject({
      latitudeColumn: "lat",
      longitudeColumn: "lon",
      delimiter: ",",
      hasHeaderRow: true,
    })
  }, 60000)

  it("imports a semicolon-delimited, comma-decimal European CSV (FR-028)", async () => {
    const { committed } = await importCsv("sites_eu.csv", {
      latitudeColumn: "lat",
      longitudeColumn: "lon",
      delimiter: ";",
      hasHeaderRow: true,
      attributeColumns: [],
    })

    expect(committed).toBe(2)
    const rows = await prismaClient.$queryRaw<{ lat: number }[]>`
      SELECT ST_Y(geometry) AS lat FROM "Feature" WHERE "layerId" = ${layerId} ORDER BY 1
    `
    // "47,2184" parsed as 47.2184 — the comma decimal separator survived.
    expect(rows[0].lat).toBeCloseTo(45.764, 3)
    expect(rows[1].lat).toBeCloseTo(47.2184, 4)
  }, 60000)
})
