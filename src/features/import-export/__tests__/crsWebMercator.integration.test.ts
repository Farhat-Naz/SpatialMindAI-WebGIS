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

/**
 * Web Mercator import, end to end (specs/005-import-export, T216; US8, FR-060).
 *
 * EPSG:3857 is the most common projected system users actually have — every web
 * map exports it — so it gets its own end-to-end check even though the transform
 * machinery is shared with the EPSG:27700 path: the fixture is Web Mercator
 * *metres*, and the assertion is that the stored position lands at the correct
 * *degrees*.
 */

const dbAvailable = await isDatabaseAvailable()

/**
 * Charing Cross in EPSG:3857 metres, and its true WGS84 position. The metre
 * values come from PostGIS's own `ST_Transform` of the expected point, so the
 * assertion closes the loop against the same authority that will invert it.
 */
const MERCATOR = { x: -14204.367025221705, y: 6711506.705400523 }
const EXPECTED = { lng: -0.1276, lat: 51.5072 }

function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

describe.skipIf(!dbAvailable)("Web Mercator import (US8)", () => {
  let layerId: string

  beforeEach(async () => {
    await ensureTestOwner()
    process.env.DEV_USER_ID = TEST_OWNER_ID

    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Mercator ${Date.now()}-${Math.random()}` },
    })
    await prismaClient.projectMember.create({
      data: { projectId: project.id, userId: TEST_OWNER_ID, role: "Owner" },
    })
    const layer = await prismaClient.layer.create({
      data: { projectId: project.id, name: "WebMap", order: 0 },
    })
    layerId = layer.id
  }, 30000)

  it("transforms EPSG:3857 metres to the correct geographic position", async () => {
    const createResponse = await createImport(
      jsonRequest(`http://localhost/api/layers/${layerId}/imports`, "POST", {
        sourceFormat: "geojson",
        fileName: "webmap.geojson",
        fileSizeBytes: 512,
        sourceCrs: "EPSG:3857",
        mode: "lenient",
        totalFeatures: 1,
        preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
      }),
      { params: Promise.resolve({ layerId }) },
    )
    expect(createResponse.status).toBe(201)
    const jobId = (await createResponse.json()).importJob.id as string

    // Web Mercator metres, untransformed — values a WGS84 range check would
    // reject, which is exactly why range validation is CRS-aware.
    const chunkResponse = await commitChunk(
      jsonRequest(`http://localhost/api/imports/${jobId}/chunks`, "POST", {
        chunkIndex: 0,
        features: [
          {
            sourcePosition: 0,
            geometry: { type: "Point", coordinates: [MERCATOR.x, MERCATOR.y] },
            properties: { name: "Charing Cross" },
          },
        ],
      }),
      { params: Promise.resolve({ importJobId: jobId }) },
    )
    expect(chunkResponse.status).toBe(200)
    expect((await chunkResponse.json()).committed).toBe(1)

    const rows = await prismaClient.$queryRaw<{ srid: number; metres: number }[]>`
      SELECT ST_SRID(geometry) AS srid,
             ST_Distance(geometry::geography,
               ST_SetSRID(ST_MakePoint(${EXPECTED.lng}, ${EXPECTED.lat}), 4326)::geography) AS metres
      FROM "Feature" WHERE "importJobId" = ${jobId}
    `

    expect(rows[0].srid).toBe(4326)
    // Sub-metre of the true position — the transform ran, and ran correctly.
    expect(rows[0].metres).toBeLessThan(1)
  }, 60000)
})
