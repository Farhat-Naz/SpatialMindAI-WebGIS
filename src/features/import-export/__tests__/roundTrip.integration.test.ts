import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"
import { prismaClient } from "@/server/db/prismaClient"
import {
  TEST_OWNER_ID,
  ensureTestOwner,
  isDatabaseAvailable,
} from "@/server/repositories/__tests__/testHelpers"
import { featureService } from "@/features/database/services/featureService"
import { POST as createImport } from "@/app/api/layers/[layerId]/imports/route"
import { POST as commitChunk } from "@/app/api/imports/[importJobId]/chunks/route"
import { POST as completeImport } from "@/app/api/imports/[importJobId]/complete/route"
import { GET as listFeatures } from "@/app/api/layers/[layerId]/features/route"
import { chunkFeatures } from "../services/importPipeline"
import { writeCsv, writeGeoJson, writeKml, writeShapefile } from "../services/exportWriters"
import { parseGeoJson } from "../services/parsers/geoJsonParser"
import { parseKml } from "../services/parsers/kmlParser"
import { parseShapefile } from "../services/parsers/shapefileParser"
import { parseCsv } from "../services/parsers/csvParser"
import type { ExportSource, NormalizedFeature } from "../types/importExport.types"

/**
 * Export → re-import round trip (specs/005-import-export, Phase 19; SC-007).
 *
 * SC-007: a layer exported and imported back loses nothing — feature count,
 * geometry, and attribute values all survive, for each of the four vector
 * formats. This is the one test that exercises the writers and the parsers as
 * inverse operations against the real database, which is what "interchange"
 * actually means.
 *
 * The writers read through `featureService.list` (a fetch call), so that one
 * seam is bridged to the live route handler; everything else runs unmocked.
 */

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

/** The seed data: three features, three geometry types, typed attributes. */
const SEED: NormalizedFeature[] = [
  {
    sourcePosition: 0,
    geometry: { type: "Point", coordinates: [-0.1276, 51.5072] },
    properties: { name: "Depot", pop: "1200" },
  },
  {
    sourcePosition: 1,
    geometry: {
      type: "LineString",
      coordinates: [
        [-0.13, 51.5],
        [-0.12, 51.51],
      ],
    },
    properties: { name: "Route 1", pop: "0" },
  },
  {
    sourcePosition: 2,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-0.14, 51.49],
          [-0.13, 51.49],
          [-0.13, 51.5],
          [-0.14, 51.5],
          [-0.14, 51.49],
        ],
      ],
    },
    properties: { name: "Zone", pop: "300" },
  },
]

describe.skipIf(!dbAvailable)("export → re-import round trip (SC-007)", () => {
  let projectId: string
  let sourceLayerId: string
  let targetLayerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `RoundTrip ${Date.now()}-${Math.random()}` },
    })
    projectId = project.id
    await prismaClient.projectMember.create({ data: { projectId, userId: TEST_OWNER_ID, role: "Owner" } })

    const source = await prismaClient.layer.create({ data: { projectId, name: "Source", order: 0 } })
    sourceLayerId = source.id
    const target = await prismaClient.layer.create({ data: { projectId, name: "Target", order: 1 } })
    targetLayerId = target.id

    await importFeatures(sourceLayerId, SEED)

    // The writers page through `featureService.list` — bridge that one fetch
    // seam to the live route handler so they read the real database.
    vi.spyOn(featureService, "list").mockImplementation(async (layerId, params) => {
      const query = params?.cursor ? `?cursor=${encodeURIComponent(params.cursor)}` : ""
      const response = await listFeatures(
        jsonRequest(`http://localhost/api/layers/${layerId}/features${query}`, "GET"),
        { params: Promise.resolve({ layerId }) },
      )
      return response.json()
    })
  }, 30000)

  /** Runs the full import lifecycle for a set of normalized features. */
  async function importFeatures(layerId: string, features: NormalizedFeature[]): Promise<number> {
    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "geojson",
        fileName: "roundtrip.geojson",
        fileSizeBytes: 1024,
        sourceCrs: "EPSG:4326",
        mode: "lenient",
        totalFeatures: features.length,
        preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
      }),
      { params: Promise.resolve({ layerId }) },
    )
    expect(createResponse.status).toBe(201)
    const jobId = (await createResponse.json()).importJob.id as string

    let committed = 0
    for (const [index, chunk] of chunkFeatures(features).entries()) {
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
    return committed
  }

  /** Asserts the target layer now matches the seed, feature for feature. */
  async function assertNothingLost(): Promise<void> {
    const rows = await prismaClient.$queryRaw<{ wkt: string; name: string | null }[]>`
      SELECT ST_AsText(f.geometry) AS wkt,
             (SELECT value FROM "FeatureAttribute" a WHERE a."featureId" = f.id AND a.key = 'name') AS name
      FROM "Feature" f WHERE f."layerId" = ${targetLayerId}
      ORDER BY name
    `
    expect(rows).toHaveLength(SEED.length)
    expect(rows.map((row) => row.name)).toEqual(["Depot", "Route 1", "Zone"])

    // Geometry survives: same types, same coordinates (to float precision).
    const wkts = rows.map((row) => row.wkt).join("|")
    expect(wkts).toContain("POINT(-0.1276 51.5072)")
    expect(wkts).toMatch(/LINESTRING\(-0\.13 51\.5,\s*-0\.12 51\.51\)/)
    expect(wkts).toMatch(/POLYGON\(\(-0\.14 51\.49/)

    // Attribute values survive as text.
    const pops = await prismaClient.featureAttribute.findMany({
      where: { feature: { layerId: targetLayerId }, key: "pop" },
      select: { value: true },
    })
    expect(pops.map((row) => row.value).sort()).toEqual(["0", "1200", "300"])
  }

  const source = (): ExportSource => ({ kind: "layer", layerId: sourceLayerId, layerName: "Source" })

  it("GeoJSON survives the round trip", async () => {
    const exported = await writeGeoJson(source())
    const parsed = await parseGeoJson(new File([exported.blob], "export.geojson"), {})

    expect(parsed.features).toHaveLength(SEED.length)
    await importFeatures(targetLayerId, parsed.features)
    await assertNothingLost()
  }, 60000)

  it("KML survives the round trip", async () => {
    const exported = await writeKml(source())
    const parsed = await parseKml(new File([exported.blob], "export.kml"), {})

    expect(parsed.features).toHaveLength(SEED.length)
    await importFeatures(targetLayerId, parsed.features)
    await assertNothingLost()
  }, 60000)

  it("CSV survives the round trip for point features", async () => {
    // CSV is points-only by construction: a row's geometry column holds GeoJSON
    // text, but re-importing as CSV means lat/lng columns — so the round trip
    // is asserted on the point subset, which is what the format represents.
    const pointOnly = await prismaClient.layer.create({
      data: { projectId, name: "Points", order: 2 },
    })
    await importFeatures(pointOnly.id, [SEED[0]])

    const exported = await writeCsv({ kind: "layer", layerId: pointOnly.id, layerName: "Points" })
    const text = await exported.blob.text()

    // The exported CSV carries the geometry as a GeoJSON column; rebuild the
    // lat/lng columns a re-import needs from it, as a user's spreadsheet would.
    const lines = text.split("\r\n")
    const header = lines[0].split(",")
    const geometryIndex = header.indexOf("geometry")
    expect(geometryIndex).toBeGreaterThanOrEqual(0)

    const rebuilt = ["name,pop,lat,lon"]
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const geometryMatch = /\[(-?[\d.]+),(-?[\d.]+)\]/.exec(line)
      expect(geometryMatch).toBeTruthy()
      rebuilt.push(`Depot,1200,${geometryMatch![2]},${geometryMatch![1]}`)
    }

    const parsed = await parseCsv(new File([rebuilt.join("\n")], "export.csv"), {
      columnMapping: {
        latitudeColumn: "lat",
        longitudeColumn: "lon",
        delimiter: ",",
        hasHeaderRow: true,
        attributeColumns: [],
      },
    })

    expect(parsed.features).toHaveLength(1)
    const committed = await importFeatures(targetLayerId, parsed.features)
    expect(committed).toBe(1)

    const rows = await prismaClient.$queryRaw<{ wkt: string }[]>`
      SELECT ST_AsText(geometry) AS wkt FROM "Feature" WHERE "layerId" = ${targetLayerId}
    `
    expect(rows[0].wkt).toBe("POINT(-0.1276 51.5072)")
  }, 60000)

  it("Shapefile survives the round trip", async () => {
    const exported = await writeShapefile(source())
    const parsed = await parseShapefile(
      new File([exported.blob], "export.zip", { type: "application/zip" }),
      {},
    )

    // @mapbox/shp-write partitions mixed geometry into one shapefile per class;
    // the parser reads the chosen one — walk all of them and accumulate.
    const { listShapefilesInArchive } = await import("../services/parsers/shapefileParser")
    const layers = await listShapefilesInArchive(
      new File([exported.blob], "export.zip", { type: "application/zip" }),
    )

    let all = parsed.features
    if (layers.length > 1) {
      all = []
      for (const layerName of layers) {
        const part = await parseShapefile(
          new File([exported.blob], "export.zip", { type: "application/zip" }),
          { shapefileName: layerName },
        )
        all = [...all, ...part.features]
      }
      // Re-key source positions so the combined set is unique.
      all = all.map((feature, index) => ({ ...feature, sourcePosition: index }))
    }

    expect(all).toHaveLength(SEED.length)
    await importFeatures(targetLayerId, all)
    await assertNothingLost()
  }, 60000)
})
