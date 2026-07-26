import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prismaClient } from "@/server/db/prismaClient"
import { TEST_OWNER_ID, ensureTestOwner, isDatabaseAvailable } from "@/server/repositories/__tests__/testHelpers"
import { GET, POST } from "@/app/api/projects/[projectId]/analysis/route"
import { GET as GET_RUN } from "@/app/api/analysis/[runId]/route"
import { POST as CANCEL } from "@/app/api/analysis/[runId]/cancel/route"
import { POST as DISCARD_RESULT } from "@/app/api/analysis/[runId]/discard-result/route"

const dbAvailable = await isDatabaseAvailable()

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe.skipIf(!dbAvailable)("Analysis API", () => {
  let projectId: string
  let layerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Analysis API Test ${Date.now()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "L", order: 0 } })
    layerId = layer.id
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[0,0]}'), NOW(), NOW())
    `
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it("POST .../analysis: returns 202 with the run's current status", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: [layerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(202)
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    expect(run.resultData).toEqual({ featureCount: 1 })
  })

  it("POST .../analysis: 400 INVALID_INPUT for a malformed body", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", { operationType: "not-a-real-op" }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })

  it("POST .../analysis: 404 for a non-existent input layer", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: ["nonexistent-layer-id"],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(404)
  })

  it("GET .../analysis: status filter returns only matching runs", async () => {
    const response = await GET(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis?status=queued,running`, "GET") as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(200)
    const { runs } = await response.json()
    expect(runs).toEqual([])
  })

  it("GET /api/analysis/:runId: polling target returns the widened run shape", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: [layerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await created.json()

    const response = await GET_RUN(jsonRequest(`http://localhost/api/analysis/${run.id}`, "GET") as never, {
      params: Promise.resolve({ runId: run.id }),
    })
    expect(response.status).toBe(200)
    const { run: fetched } = await response.json()
    expect(fetched.id).toBe(run.id)
    expect(fetched).toHaveProperty("progress")
    expect(fetched).toHaveProperty("userId")
  })

  it("POST /api/analysis/:runId/cancel: no-op success on an already-terminal run", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "featureCount",
        inputLayerIds: [layerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await created.json()

    const response = await CANCEL(jsonRequest(`http://localhost/api/analysis/${run.id}/cancel`, "POST") as never, {
      params: Promise.resolve({ runId: run.id }),
    })
    expect(response.status).toBe(200)
    const { run: cancelled } = await response.json()
    expect(cancelled.status).toBe("succeeded")
  })

  it("POST /api/analysis/:runId/discard-result: clears resultLayerId, 400 if none exists", async () => {
    const created = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "buffer",
        inputLayerIds: [layerId],
        parameters: { distance: 50, unit: "meters" },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await created.json()
    expect(run.resultLayerId).not.toBeNull()

    const response = await DISCARD_RESULT(
      jsonRequest(`http://localhost/api/analysis/${run.id}/discard-result`, "POST") as never,
      { params: Promise.resolve({ runId: run.id }) },
    )
    expect(response.status).toBe(200)
    const { run: discarded } = await response.json()
    expect(discarded.resultLayerId).toBeNull()

    const second = await DISCARD_RESULT(
      jsonRequest(`http://localhost/api/analysis/${run.id}/discard-result`, "POST") as never,
      { params: Promise.resolve({ runId: run.id }) },
    )
    expect(second.status).toBe(400)
  })
})

/**
 * T134 — Buffer through the background-execution path (research.md
 * Decision 5): an input past `BACKGROUND_EXECUTION_THRESHOLD` (500
 * features) is chunked over multiple pages (T011's chunk size for the
 * "buffer" category is also 500), so this layer's size guarantees at least
 * two chunk iterations for both the non-dissolve and dissolve paths —
 * exercising T039's chunk-safe dissolve behavior (SC-002) rather than just
 * the fast, single-chunk path already covered above.
 */
describe.skipIf(!dbAvailable)("Analysis API — Buffer background path (large input)", () => {
  let projectId: string
  let largeLayerId: string
  const FEATURE_COUNT = 750

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Buffer Background Path Test ${Date.now()}` },
    })
    projectId = project.id
    const layer = await prismaClient.layer.create({ data: { projectId, name: "Large", order: 0 } })
    largeLayerId = layer.id
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT gen_random_uuid(), ${largeLayerId},
        ST_SetSRID(ST_MakePoint((n % 100)::float8 * 0.001, (n / 100)::float8 * 0.001), 4326),
        NOW(), NOW()
      FROM generate_series(1, ${FEATURE_COUNT}) AS n
    `
  }, 30000)

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  it(
    "non-dissolve: eventually produces one buffer feature per input feature via the chunked path",
    async () => {
      const response = await POST(
        jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
          operationType: "buffer",
          inputLayerIds: [largeLayerId],
          parameters: { distance: 10, unit: "meters" },
        }) as never,
        { params: Promise.resolve({ projectId }) },
      )
      expect(response.status).toBe(202)
      const { run } = await response.json()
      expect(["queued", "running", "succeeded"]).toContain(run.status)

      const finalRun = await pollUntilTerminal(run.id)
      expect(finalRun.status).toBe("succeeded")
      const count = await prismaClient.feature.count({ where: { layerId: finalRun.resultLayerId } })
      expect(count).toBe(FEATURE_COUNT)
    },
    30000,
  )

  it(
    "dissolve: still produces exactly one merged feature across multiple chunks (chunk-safety, plan.md Risks)",
    async () => {
      const response = await POST(
        jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
          operationType: "buffer",
          inputLayerIds: [largeLayerId],
          parameters: { distance: 10, unit: "meters", dissolve: true },
        }) as never,
        { params: Promise.resolve({ projectId }) },
      )
      const { run } = await response.json()

      const finalRun = await pollUntilTerminal(run.id)
      expect(finalRun.status).toBe("succeeded")
      const count = await prismaClient.feature.count({ where: { layerId: finalRun.resultLayerId } })
      expect(count).toBe(1)
    },
    30000,
  )

  async function pollUntilTerminal(runId: string): Promise<{ status: string; resultLayerId: string }> {
    const deadline = Date.now() + 20000
    for (;;) {
      const response = await GET_RUN(jsonRequest(`http://localhost/api/analysis/${runId}`, "GET") as never, {
        params: Promise.resolve({ runId }),
      })
      const { run } = await response.json()
      if (["succeeded", "failed", "cancelled"].includes(run.status)) {
        return run
      }
      if (Date.now() > deadline) {
        throw new Error(`Run ${runId} did not reach a terminal status in time (last status: ${run.status}).`)
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
})

/**
 * T151 — every spatial predicate (US2) against seeded fixtures with known
 * expected results: `sourceLayer` has a point inside `referenceLayer`'s
 * polygon, a point outside it, a point exactly on its boundary (touches),
 * and a line crossing its boundary — enough to exercise every predicate's
 * distinct semantics (intersects/within/contains/touches/crosses/overlaps).
 */
describe.skipIf(!dbAvailable)("Analysis API — Spatial Query predicates (US2)", () => {
  let projectId: string
  let sourceLayerId: string
  let referenceLayerId: string

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Spatial Query API Test ${Date.now()}` },
    })
    projectId = project.id

    const source = await prismaClient.layer.create({ data: { projectId, name: "Source", order: 0 } })
    const reference = await prismaClient.layer.create({ data: { projectId, name: "Reference", order: 1 } })
    sourceLayerId = source.id
    referenceLayerId = reference.id

    // A 0..10, 0..10 square polygon in the reference layer.
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${referenceLayerId}, ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[0,0],[0,10],[10,10],[10,0],[0,0]]]}'), NOW(), NOW())
    `

    // Each source fixture is tagged with a "label" attribute so a query
    // result can be identified by label (robust to the result's copies
    // getting fresh ids) — and doubles as proof that attributes survive
    // the copy (the whole point of "select by location/attribute").
    async function insertLabeledFeature(label: string, geometry: unknown): Promise<void> {
      const rows = await prismaClient.$queryRaw<{ id: string }[]>`
        INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${sourceLayerId}, ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), NOW(), NOW())
        RETURNING id
      `
      await prismaClient.featureAttribute.create({ data: { featureId: rows[0].id, key: "label", value: label } })
    }

    await insertLabeledFeature("inside", { type: "Point", coordinates: [5, 5] })
    await insertLabeledFeature("outside", { type: "Point", coordinates: [50, 50] })
    await insertLabeledFeature("boundary", { type: "Point", coordinates: [0, 5] })
    await insertLabeledFeature("crossing", { type: "LineString", coordinates: [[-5, 5], [5, 5]] })
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  /** Runs a query and returns the sorted set of "label" attribute values found among the result layer's features — proves both correct selection and attribute preservation. */
  async function runQuery(operationType: string, parameters?: unknown): Promise<string[]> {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType,
        inputLayerIds: [sourceLayerId, referenceLayerId],
        parameters,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    const attributes = await prismaClient.featureAttribute.findMany({
      where: { key: "label", feature: { layerId: run.resultLayerId } },
    })
    return attributes.map((a) => a.value).sort()
  }

  it("intersects: matches the inside point, boundary point, and crossing line, not the outside point", async () => {
    const labels = await runQuery("spatialJoin", { relationship: "intersects" })
    expect(labels).toEqual(["boundary", "crossing", "inside"])
  })

  it("within: matches only the strictly-inside point", async () => {
    const labels = await runQuery("spatialJoin", { relationship: "within" })
    expect(labels).toEqual(["inside"])
  })

  it("contains: the polygon reference contains the inside point (source/reference reversed for this predicate's semantics)", async () => {
    // ST_Contains(a, b): source geometry containing reference geometry —
    // reversing layers here so the polygon (now source) contains the point.
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "spatialJoin",
        inputLayerIds: [referenceLayerId, sourceLayerId],
        parameters: { relationship: "contains" },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    const count = await prismaClient.feature.count({ where: { layerId: run.resultLayerId } })
    expect(count).toBe(1)
  })

  it("touches: matches only the boundary point", async () => {
    const labels = await runQuery("touches")
    expect(labels).toEqual(["boundary"])
  })

  it("crosses: matches only the line crossing the boundary", async () => {
    const labels = await runQuery("crosses")
    expect(labels).toEqual(["crossing"])
  })

  it("overlaps: no source geometry partially overlaps the polygon in this fixture (points/lines can't 'overlap' a polygon by definition)", async () => {
    const labels = await runQuery("overlaps")
    expect(labels).toEqual([])
  })

  it("nearest: ranks every source feature by distance to the nearest reference feature", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "nearAnalysis",
        inputLayerIds: [sourceLayerId, referenceLayerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    expect(Array.isArray(run.resultData)).toBe(true)
    expect(run.resultData.length).toBeGreaterThan(0)
    for (const entry of run.resultData) {
      expect(typeof entry.distanceMeters).toBe("number")
    }
  })

  it("distance: nearAnalysis with maxDistance excludes far-away features", async () => {
    const outsideAttribute = await prismaClient.featureAttribute.findFirstOrThrow({
      where: { key: "label", value: "outside", feature: { layerId: sourceLayerId } },
    })

    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "nearAnalysis",
        inputLayerIds: [sourceLayerId, referenceLayerId],
        parameters: { maxDistance: 100, unit: "meters" },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    const sourceIds = run.resultData.map((entry: { sourceFeatureId: string }) => entry.sourceFeatureId)
    expect(sourceIds).not.toContain(outsideAttribute.featureId)
  })

  it("selectByAttribute: filters by a parameterized equality comparison", async () => {
    const featureId = await prismaClient
      .$queryRaw<
        { id: string }[]
      >`INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${sourceLayerId}, ST_GeomFromGeoJSON('{"type":"Point","coordinates":[1,1]}'), NOW(), NOW()) RETURNING id`
      .then((rows) => rows[0].id)
    await prismaClient.featureAttribute.create({ data: { featureId, key: "kind", value: "target" } })

    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "selectByAttribute",
        inputLayerIds: [sourceLayerId],
        parameters: { key: "kind", operator: "eq", value: "target" },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    const resultFeatures = await prismaClient.feature.findMany({ where: { layerId: run.resultLayerId } })
    expect(resultFeatures).toHaveLength(1)

    // Proves the copy preserves attributes, not just geometry.
    const copiedAttribute = await prismaClient.featureAttribute.findFirst({
      where: { featureId: resultFeatures[0].id, key: "kind" },
    })
    expect(copiedAttribute?.value).toBe("target")
  })
})

/**
 * T180 (US4) — Overlay Analysis against seeded overlapping polygon
 * fixtures with arithmetically known results, covering FR-010 for all 7
 * operations and FR-033's CRS handling (T177).
 *
 * Fixture (all areas in square degrees; SRID 4326 planar math):
 *
 *   Target layer A          Overlay layer B
 *   ─────────────────       ─────────────────
 *   "left"     0..10 × 0..10  (100)   b1   5..15 × 0..10  (100)
 *   "covered" 22..28 × 2..8   ( 36)   b2  20..30 × 0..10  (100)
 *   "far"     40..50 × 0..10  (100)
 *   total                     236     total              200
 *
 * A ∩ B = 50 ("left"'s right half) + 36 ("covered", wholly inside b2) = 86.
 * So: Intersection 86, Union 350, Difference 150, SymDifference 264 —
 * and Clip (86) + Erase (150) exactly partition A's 236.
 */
describe.skipIf(!dbAvailable)("Analysis API — Overlay Analysis (US4)", () => {
  let projectId: string
  let targetLayerId: string
  let overlayLayerId: string

  /** A closed axis-aligned rectangle as a GeoJSON polygon. */
  function box(minX: number, minY: number, maxX: number, maxY: number) {
    return {
      type: "Polygon",
      coordinates: [[[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]]],
    }
  }

  async function insertPolygon(layerId: string, geometry: unknown, label?: string): Promise<void> {
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), NOW(), NOW())
      RETURNING id
    `
    if (label) {
      await prismaClient.featureAttribute.create({ data: { featureId: rows[0].id, key: "label", value: label } })
    }
  }

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Overlay API Test ${Date.now()}` },
    })
    projectId = project.id

    const target = await prismaClient.layer.create({ data: { projectId, name: "Target", order: 0 } })
    const overlay = await prismaClient.layer.create({ data: { projectId, name: "Overlay", order: 1 } })
    targetLayerId = target.id
    overlayLayerId = overlay.id

    await insertPolygon(targetLayerId, box(0, 0, 10, 10), "left")
    await insertPolygon(targetLayerId, box(22, 2, 28, 8), "covered")
    await insertPolygon(targetLayerId, box(40, 0, 50, 10), "far")

    await insertPolygon(overlayLayerId, box(5, 0, 15, 10))
    await insertPolygon(overlayLayerId, box(20, 0, 30, 10))
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  /** Runs an overlay operation and returns its result layer id. */
  async function runOverlay(operationType: string, inputLayerIds: string[]): Promise<string> {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType,
        inputLayerIds,
        parameters: undefined,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    expect(run.resultLayerId).toBeTruthy()
    return run.resultLayerId as string
  }

  /** Total area of a layer's combined footprint, in square degrees. */
  async function layerArea(layerId: string): Promise<number> {
    const rows = await prismaClient.$queryRaw<{ area: number }[]>`
      SELECT COALESCE(ST_Area(ST_Union(geometry)), 0)::float8 AS area FROM "Feature" WHERE "layerId" = ${layerId}
    `
    return rows[0].area
  }

  /** The sorted "label" attribute values carried into a result layer. */
  async function resultLabels(layerId: string): Promise<string[]> {
    const attributes = await prismaClient.featureAttribute.findMany({
      where: { key: "label", feature: { layerId } },
    })
    return attributes.map((a) => a.value).sort()
  }

  it("the fixture layers have the expected areas (guards every assertion below)", async () => {
    expect(await layerArea(targetLayerId)).toBeCloseTo(236, 6)
    expect(await layerArea(overlayLayerId)).toBeCloseTo(200, 6)
  })

  it("intersect: result is exactly the shared area (US4.1)", async () => {
    const resultLayerId = await runOverlay("intersect", [targetLayerId, overlayLayerId])
    expect(await layerArea(resultLayerId)).toBeCloseTo(86, 6)
  })

  it("union: result is the combined footprint of both layers (US4.2)", async () => {
    const resultLayerId = await runOverlay("union", [targetLayerId, overlayLayerId])
    expect(await layerArea(resultLayerId)).toBeCloseTo(350, 6)
  })

  it("difference: result is the target minus the overlay (US4.3)", async () => {
    const resultLayerId = await runOverlay("difference", [targetLayerId, overlayLayerId])
    expect(await layerArea(resultLayerId)).toBeCloseTo(150, 6)
  })

  it("clip: keeps only the parts of each target feature inside the boundary, with attributes (US4.4)", async () => {
    const resultLayerId = await runOverlay("clip", [targetLayerId, overlayLayerId])

    expect(await layerArea(resultLayerId)).toBeCloseTo(86, 6)
    // "far" lies entirely outside the boundary and is omitted; the other
    // two survive as their own features, carrying their own attributes
    // (FR-010 — Clip preserves the input layer's attribute schema).
    expect(await resultLabels(resultLayerId)).toEqual(["covered", "left"])
    expect(await prismaClient.feature.count({ where: { layerId: resultLayerId } })).toBe(2)
  })

  it("erase: removes the overlay footprint from each target feature, with attributes (US4.5)", async () => {
    const resultLayerId = await runOverlay("erase", [targetLayerId, overlayLayerId])

    expect(await layerArea(resultLayerId)).toBeCloseTo(150, 6)
    // "covered" lies entirely within the erase footprint, so it differences
    // down to nothing and is dropped rather than stored as an empty row.
    expect(await resultLabels(resultLayerId)).toEqual(["far", "left"])
    expect(await prismaClient.feature.count({ where: { layerId: resultLayerId } })).toBe(2)
  })

  it("clip and erase exactly partition the target layer", async () => {
    const clipLayerId = await runOverlay("clip", [targetLayerId, overlayLayerId])
    const eraseLayerId = await runOverlay("erase", [targetLayerId, overlayLayerId])

    const total = (await layerArea(clipLayerId)) + (await layerArea(eraseLayerId))
    expect(total).toBeCloseTo(await layerArea(targetLayerId), 6)
  })

  it("erase against an empty overlay layer leaves the target unchanged", async () => {
    const emptyLayer = await prismaClient.layer.create({ data: { projectId, name: "Empty", order: 2 } })
    const resultLayerId = await runOverlay("erase", [targetLayerId, emptyLayer.id])

    // ST_Union over no rows is NULL; erasing nothing must keep every
    // feature rather than producing a NULL geometry.
    expect(await layerArea(resultLayerId)).toBeCloseTo(236, 6)
    expect(await resultLabels(resultLayerId)).toEqual(["covered", "far", "left"])
  })

  it("identity: preserves all of the target's geometry and attributes (US4.6)", async () => {
    const resultLayerId = await runOverlay("identity", [targetLayerId, overlayLayerId])

    expect(await layerArea(resultLayerId)).toBeCloseTo(236, 6)
    expect(await resultLabels(resultLayerId)).toEqual(["covered", "far", "left"])
    expect(await prismaClient.feature.count({ where: { layerId: resultLayerId } })).toBe(3)
  })

  it("symmetricalDifference: result is everything in exactly one of the two layers (US4.7)", async () => {
    const resultLayerId = await runOverlay("symmetricalDifference", [targetLayerId, overlayLayerId])

    // 236 + 200 - 2×86 = 264.
    expect(await layerArea(resultLayerId)).toBeCloseTo(264, 6)
  })

  it("every overlay input is stored at SRID 4326, so there is no CRS to reconcile (FR-033, T177)", async () => {
    // FR-033 requires mismatched-CRS inputs be reconciled automatically.
    // `Feature.geometry` is declared `geometry(Geometry, 4326)`, so the
    // column constraint makes a second CRS unrepresentable — this asserts
    // that invariant directly rather than testing an ST_Transform step
    // that would be unreachable.
    const resultLayerId = await runOverlay("intersect", [targetLayerId, overlayLayerId])
    const rows = await prismaClient.$queryRaw<{ srid: number }[]>`
      SELECT DISTINCT ST_SRID(geometry)::int AS srid
      FROM "Feature"
      WHERE "layerId" IN (${targetLayerId}, ${overlayLayerId}, ${resultLayerId})
    `
    expect(rows.map((r) => r.srid)).toEqual([4326])
  })

  it("rejects an overlay given only one input layer (schema requires a 2-tuple)", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "clip",
        inputLayerIds: [targetLayerId],
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    expect(response.status).toBe(400)
  })
})

/**
 * T197/T198 (US5) — Geometry Processing against seeded fixtures, including
 * a deliberately self-intersecting polygon, plus T192's no-op reporting
 * and T193's pre-run rejections.
 */
describe.skipIf(!dbAvailable)("Analysis API — Geometry Processing (US5)", () => {
  let projectId: string
  let squareLayerId: string
  let detailedLayerId: string
  let multipartLayerId: string
  let invalidLayerId: string
  let zonedLayerId: string
  let bladeLayerId: string
  let emptyLayerId: string
  let pointLayerId: string

  async function createLayer(name: string, order: number): Promise<string> {
    const layer = await prismaClient.layer.create({ data: { projectId, name, order } })
    return layer.id
  }

  /** Inserts one feature from raw WKT so deliberately invalid geometry can be seeded (ST_GeomFromGeoJSON would reject some of these). */
  async function insertWkt(layerId: string, wkt: string, attributes: Record<string, string> = {}): Promise<string> {
    const rows = await prismaClient.$queryRaw<{ id: string }[]>`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_SetSRID(ST_GeomFromText(${wkt}), 4326), NOW(), NOW())
      RETURNING id
    `
    for (const [key, value] of Object.entries(attributes)) {
      await prismaClient.featureAttribute.create({ data: { featureId: rows[0].id, key, value } })
    }
    return rows[0].id
  }

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Geometry API Test ${Date.now()}` },
    })
    projectId = project.id

    squareLayerId = await createLayer("Square", 0)
    detailedLayerId = await createLayer("Detailed", 1)
    multipartLayerId = await createLayer("Multipart", 2)
    invalidLayerId = await createLayer("Invalid", 3)
    zonedLayerId = await createLayer("Zoned", 4)
    bladeLayerId = await createLayer("Blade", 5)
    emptyLayerId = await createLayer("Empty", 6)
    pointLayerId = await createLayer("Points", 7)

    // A plain square: every vertex is a corner, so Simplify has nothing to remove.
    await insertWkt(squareLayerId, "POLYGON((0 0, 0 10, 10 10, 10 0, 0 0))", { label: "square" })

    // The same square plus a near-collinear vertex on the bottom edge,
    // which a tolerance of 0.01 removes (6 points -> 5).
    await insertWkt(detailedLayerId, "POLYGON((0 0, 5 0.0001, 10 0, 10 10, 0 10, 0 0))", { label: "detailed" })

    // Three disjoint squares in one feature, for ST_Dump.
    await insertWkt(
      multipartLayerId,
      "MULTIPOLYGON(((0 0, 0 1, 1 1, 1 0, 0 0)), ((5 5, 5 6, 6 6, 6 5, 5 5)), ((9 9, 9 10, 10 10, 10 9, 9 9)))",
      { name: "Island", zone: "A" },
    )

    // A self-intersecting "bowtie" - invalid, but ST_MakeValid can fix it -
    // alongside an already-valid square that needs no repair.
    await insertWkt(invalidLayerId, "POLYGON((0 0, 10 10, 10 0, 0 10, 0 0))", { label: "bowtie" })
    await insertWkt(invalidLayerId, "POLYGON((20 20, 20 30, 30 30, 30 20, 20 20))", { label: "valid" })

    // Four features across two zones, for Dissolve.
    await insertWkt(zonedLayerId, "POLYGON((0 0, 0 2, 2 2, 2 0, 0 0))", { zone: "A" })
    await insertWkt(zonedLayerId, "POLYGON((2 0, 2 2, 4 2, 4 0, 2 0))", { zone: "A" })
    await insertWkt(zonedLayerId, "POLYGON((10 0, 10 2, 12 2, 12 0, 10 0))", { zone: "B" })
    await insertWkt(zonedLayerId, "POLYGON((12 0, 12 2, 14 2, 14 0, 12 0))", { zone: "B" })

    // A vertical line cutting the square in two.
    await insertWkt(bladeLayerId, "LINESTRING(5 -1, 5 11)", { label: "blade" })

    await insertWkt(pointLayerId, "POINT(1 1)", { label: "point" })
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  async function runOperation(
    operationType: string,
    inputLayerIds: string[],
    parameters?: unknown,
  ): Promise<{ status: number; run: Record<string, unknown> }> {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType,
        inputLayerIds,
        parameters,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const body = await response.json()
    return { status: response.status, run: body.run ?? body }
  }

  /** Succeeds the run and returns it, failing loudly if the operation errored. */
  async function runSucceeding(operationType: string, inputLayerIds: string[], parameters?: unknown) {
    const { run } = await runOperation(operationType, inputLayerIds, parameters)
    expect(run.status).toBe("succeeded")
    return run
  }

  async function totalVertices(layerId: string): Promise<number> {
    const rows = await prismaClient.$queryRaw<{ points: number }[]>`
      SELECT COALESCE(SUM(ST_NPoints(geometry)), 0)::int AS points FROM "Feature" WHERE "layerId" = ${layerId}
    `
    return rows[0].points
  }

  async function allValid(layerId: string): Promise<boolean> {
    const rows = await prismaClient.$queryRaw<{ invalid: number }[]>`
      SELECT COUNT(*)::int AS invalid FROM "Feature" WHERE "layerId" = ${layerId} AND NOT ST_IsValid(geometry)
    `
    return rows[0].invalid === 0
  }

  async function attributesOf(layerId: string): Promise<{ key: string; value: string }[]> {
    const rows = await prismaClient.featureAttribute.findMany({
      where: { feature: { layerId } },
      select: { key: true, value: true },
    })
    return rows.sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value))
  }

  it("simplify: removes near-collinear vertices and keeps attributes (US5.1)", async () => {
    const before = await totalVertices(detailedLayerId)
    const run = await runSucceeding("simplify", [detailedLayerId], { tolerance: 0.01 })

    expect(await totalVertices(run.resultLayerId as string)).toBeLessThan(before)
    expect(await allValid(run.resultLayerId as string)).toBe(true)
    expect(await attributesOf(run.resultLayerId as string)).toEqual([{ key: "label", value: "detailed" }])
  })

  it("simplify: an already-minimal shape reports no change needed rather than failing (T192)", async () => {
    const run = await runSucceeding("simplify", [squareLayerId], { tolerance: 0.0001 })

    expect(run.resultData).toMatchObject({ unchangedFeatureCount: 1, noChangeNeeded: true })
  })

  it("smoothGeometry: produces valid geometry and keeps attributes (US5.2)", async () => {
    const run = await runSucceeding("smoothGeometry", [squareLayerId])

    expect(await allValid(run.resultLayerId as string)).toBe(true)
    expect(await attributesOf(run.resultLayerId as string)).toEqual([{ key: "label", value: "square" }])
  })

  it("repairGeometry: fixes a self-intersection and reports what needed no repair (US5.8, T192)", async () => {
    expect(await allValid(invalidLayerId)).toBe(false)

    const run = await runSucceeding("repairGeometry", [invalidLayerId])

    // Every persisted result is valid (T194) and both inputs survive.
    expect(await allValid(run.resultLayerId as string)).toBe(true)
    // The already-valid square needed no repair; the bowtie did.
    expect(run.resultData).toMatchObject({ unchangedFeatureCount: 1, noChangeNeeded: false })
    const labels = (await attributesOf(run.resultLayerId as string)).map((a) => a.value)
    expect(labels).toContain("bowtie")
    expect(labels).toContain("valid")
  })

  it("multipartToSinglepart: one feature per part, attributes copied to each (US5.6)", async () => {
    const run = await runSucceeding("multipartToSinglepart", [multipartLayerId])

    expect(await prismaClient.feature.count({ where: { layerId: run.resultLayerId as string } })).toBe(3)
    // FR-014: each of the three parts carries both of the parent's attributes.
    expect(await attributesOf(run.resultLayerId as string)).toEqual([
      { key: "name", value: "Island" },
      { key: "name", value: "Island" },
      { key: "name", value: "Island" },
      { key: "zone", value: "A" },
      { key: "zone", value: "A" },
      { key: "zone", value: "A" },
    ])
  })

  it("singlepartToMultipart: wraps each feature 1:1, keeping attributes (US5.7)", async () => {
    const run = await runSucceeding("singlepartToMultipart", [squareLayerId])

    expect(await prismaClient.feature.count({ where: { layerId: run.resultLayerId as string } })).toBe(1)
    expect(await attributesOf(run.resultLayerId as string)).toEqual([{ key: "label", value: "square" }])
  })

  it("split: cuts the target with the blade layer, each part keeping attributes (US5.3)", async () => {
    const run = await runSucceeding("split", [squareLayerId, bladeLayerId])

    // One square cut by a vertical line yields two halves...
    expect(await prismaClient.feature.count({ where: { layerId: run.resultLayerId as string } })).toBe(2)
    // ...each carrying the original's attribute.
    expect(await attributesOf(run.resultLayerId as string)).toEqual([
      { key: "label", value: "square" },
      { key: "label", value: "square" },
    ])
    expect(await allValid(run.resultLayerId as string)).toBe(true)
  })

  it("merge: concatenates every input layer's features and attributes (US5.4)", async () => {
    const run = await runSucceeding("merge", [squareLayerId, detailedLayerId])

    expect(await prismaClient.feature.count({ where: { layerId: run.resultLayerId as string } })).toBe(2)
    expect(await attributesOf(run.resultLayerId as string)).toEqual([
      { key: "label", value: "detailed" },
      { key: "label", value: "square" },
    ])
  })

  it("dissolve: one output feature per distinct attribute value (T044's whole-layer invariant)", async () => {
    const run = await runSucceeding("dissolve", [zonedLayerId], { attributeKey: "zone" })

    // Four inputs across two zones collapse to exactly two features. A
    // per-chunk Dissolve would emit one partial union per chunk instead,
    // so this count is the invariant that proves it runs whole-layer.
    expect(await prismaClient.feature.count({ where: { layerId: run.resultLayerId as string } })).toBe(2)
    expect(await allValid(run.resultLayerId as string)).toBe(true)
  })

  it("split: rejects an empty split-line layer before running (T193)", async () => {
    const { status, run } = await runOperation("split", [squareLayerId, emptyLayerId])

    expect(status).toBe(400)
    expect(JSON.stringify(run)).toMatch(/split line/i)
  })

  it("merge: rejects layers of incompatible geometry types before running (T193)", async () => {
    const { status, run } = await runOperation("merge", [squareLayerId, pointLayerId])

    expect(status).toBe(400)
    // The message must name the actual problem, not just "invalid input".
    expect(JSON.stringify(run)).toMatch(/point/i)
    expect(JSON.stringify(run)).toMatch(/polygon/i)
  })

  it("merge: accepts single- and multi- variants of the same shape as compatible (T193)", async () => {
    await runSucceeding("merge", [squareLayerId, multipartLayerId])
  })

  it("simplify: rejects a non-positive tolerance at the schema boundary", async () => {
    const { status } = await runOperation("simplify", [squareLayerId], { tolerance: 0 })
    expect(status).toBe(400)
  })
})

/**
 * T213 (US6) — Spatial Statistics against polygon, line, and point layer
 * variants, matching quickstart.md §6. Every statistics operation reports
 * on `resultData` and creates no layer.
 */
describe.skipIf(!dbAvailable)("Analysis API — Spatial Statistics (US6)", () => {
  let projectId: string
  let polygonLayerId: string
  let lineLayerId: string
  let pointLayerId: string
  let emptyLayerId: string

  async function insertWkt(layerId: string, wkt: string): Promise<void> {
    await prismaClient.$executeRaw`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${layerId}, ST_SetSRID(ST_GeomFromText(${wkt}), 4326), NOW(), NOW())
    `
  }

  beforeAll(async () => {
    process.env.DEV_USER_ID = TEST_OWNER_ID
    await ensureTestOwner()
    const project = await prismaClient.project.create({
      data: { ownerId: TEST_OWNER_ID, name: `Statistics API Test ${Date.now()}` },
    })
    projectId = project.id

    polygonLayerId = (await prismaClient.layer.create({ data: { projectId, name: "Polygons", order: 0 } })).id
    lineLayerId = (await prismaClient.layer.create({ data: { projectId, name: "Lines", order: 1 } })).id
    pointLayerId = (await prismaClient.layer.create({ data: { projectId, name: "Points", order: 2 } })).id
    emptyLayerId = (await prismaClient.layer.create({ data: { projectId, name: "Empty", order: 3 } })).id

    // Two 1x1-degree squares near the equator.
    await insertWkt(polygonLayerId, "POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))")
    await insertWkt(polygonLayerId, "POLYGON((2 0, 2 1, 3 1, 3 0, 2 0))")

    await insertWkt(lineLayerId, "LINESTRING(0 0, 0 1)")
    await insertWkt(lineLayerId, "LINESTRING(1 0, 1 2)")

    await insertWkt(pointLayerId, "POINT(0 0)")
    await insertWkt(pointLayerId, "POINT(1 1)")
    await insertWkt(pointLayerId, "POINT(2 2)")
  })

  afterAll(async () => {
    await prismaClient.project.deleteMany({ where: { ownerId: TEST_OWNER_ID } })
  })

  async function runStatistic(
    operationType: string,
    layerId: string,
    parameters?: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType,
        inputLayerIds: [layerId],
        parameters,
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )
    const { run } = await response.json()
    expect(run.status).toBe("succeeded")
    // spec.md US6: statistics report numbers without creating a new layer.
    expect(run.resultLayerId).toBeNull()
    return run.resultData as Record<string, unknown>
  }

  it("featureCount: counts the layer's features (US6.1)", async () => {
    expect(await runStatistic("featureCount", polygonLayerId)).toMatchObject({ featureCount: 2 })
    expect(await runStatistic("featureCount", pointLayerId)).toMatchObject({ featureCount: 3 })
  })

  it("areaCalculation / averageArea: total and mean area for polygons (US6.2)", async () => {
    const total = await runStatistic("areaCalculation", polygonLayerId)
    const average = await runStatistic("averageArea", polygonLayerId)

    // Two ~1-degree squares near the equator: on the order of 1e10 m² each.
    expect(total.totalAreaSquareMeters as number).toBeGreaterThan(0)
    expect(average.averageAreaSquareMeters as number).toBeCloseTo((total.totalAreaSquareMeters as number) / 2, 0)
  })

  it("lengthCalculation / averageLength: total and mean length for lines (US6.3)", async () => {
    const total = await runStatistic("lengthCalculation", lineLayerId)
    const average = await runStatistic("averageLength", lineLayerId)

    // 1 degree + 2 degrees of latitude, each ~111 km.
    expect(total.totalLengthMeters as number).toBeGreaterThan(300_000)
    expect(average.averageLengthMeters as number).toBeCloseTo((total.totalLengthMeters as number) / 2, 0)
  })

  it("densityAnalysis: measures features per unit area over a real grid (US6.4)", async () => {
    const result = await runStatistic("densityAnalysis", pointLayerId, { cellSize: 50, unit: "kilometers" })

    expect(result).toMatchObject({ featureCount: 3, cellSizeMeters: 50_000 })
    expect(result.cellCount as number).toBeGreaterThan(0)
    // Each of the 3 points falls in its own cell in this fixture.
    expect(result.occupiedCellCount).toBe(3)
    expect(result.maxFeaturesPerCell).toBe(1)
    expect(result.densityPerSquareMeter as number).toBeGreaterThan(0)
    // Reported from the generated cells, not assumed from the request:
    // a degree-sized grid is not metrically square away from the equator.
    expect(result.meanCellAreaSquareMeters as number).toBeGreaterThan(0)
  })

  it("densityAnalysis: the cell size actually changes the grid (T205)", async () => {
    const coarse = await runStatistic("densityAnalysis", pointLayerId, { cellSize: 200, unit: "kilometers" })
    const fine = await runStatistic("densityAnalysis", pointLayerId, { cellSize: 25, unit: "kilometers" })

    // A finer cell size means more, smaller cells over the same extent -
    // the property that was missing while density ignored its parameters.
    expect(fine.cellCount as number).toBeGreaterThan(coarse.cellCount as number)
    expect(fine.meanCellAreaSquareMeters as number).toBeLessThan(coarse.meanCellAreaSquareMeters as number)
    // Feature count is a property of the layer, not of the grid.
    expect(fine.featureCount).toBe(coarse.featureCount)
  })

  it("densityAnalysis: refuses a cell size that would explode the grid (T205)", async () => {
    const response = await POST(
      jsonRequest(`http://localhost/api/projects/${projectId}/analysis`, "POST", {
        operationType: "densityAnalysis",
        inputLayerIds: [pointLayerId],
        parameters: { cellSize: 1, unit: "meters" },
      }) as never,
      { params: Promise.resolve({ projectId }) },
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(JSON.stringify(body)).toMatch(/larger cell size/i)
  })

  it("densityAnalysis: an empty layer reports a zero-cell grid rather than failing", async () => {
    const result = await runStatistic("densityAnalysis", emptyLayerId, { cellSize: 100, unit: "meters" })

    expect(result).toMatchObject({ featureCount: 0, cellCount: 0, occupiedCellCount: 0 })
  })

  it("extent / boundingBox / centroid / convexHull: geometry statistics (US6.5)", async () => {
    expect((await runStatistic("extent", polygonLayerId)).extent).toMatchObject({ type: "Polygon" })
    expect((await runStatistic("boundingBox", polygonLayerId)).boundingBox).toMatchObject({ type: "Polygon" })
    expect((await runStatistic("centroid", polygonLayerId)).centroid).toMatchObject({ type: "Point" })
    expect((await runStatistic("convexHull", polygonLayerId)).convexHull).toMatchObject({ type: "Polygon" })
  })

  it("summarize: reports every statistic in one run for a polygon layer (US6.1-5)", async () => {
    const result = await runStatistic("summarize", polygonLayerId)

    expect(result).toMatchObject({ featureCount: 2, geometryTypes: ["POLYGON"] })
    expect(result.totalAreaSquareMeters as number).toBeGreaterThan(0)
    expect(result.averageAreaSquareMeters as number).toBeGreaterThan(0)
    expect(result.boundingBox).toMatchObject({ type: "Polygon" })
    expect(result.centroid).toMatchObject({ type: "Point" })
    expect(result.convexHull).toMatchObject({ type: "Polygon" })
    expect(result.extent).toMatchObject({ type: "Polygon" })
  })

  it("summarize: a line layer reports length and is typed LINESTRING", async () => {
    const result = await runStatistic("summarize", lineLayerId)

    expect(result).toMatchObject({ featureCount: 2, geometryTypes: ["LINESTRING"] })
    expect(result.totalLengthMeters as number).toBeGreaterThan(300_000)
    // A line has no area, which is what lets the UI omit the area cards.
    expect(result.totalAreaSquareMeters).toBe(0)
  })

  it("summarize: a point layer reports neither area nor length", async () => {
    const result = await runStatistic("summarize", pointLayerId)

    expect(result).toMatchObject({
      featureCount: 3,
      geometryTypes: ["POINT"],
      totalAreaSquareMeters: 0,
      totalLengthMeters: 0,
    })
  })

  it("summarize: an empty layer succeeds with a zero count rather than failing", async () => {
    const result = await runStatistic("summarize", emptyLayerId)

    expect(result).toMatchObject({ featureCount: 0, geometryTypes: [] })
    // No geometry to collect, so the geometry statistics are absent, not zero.
    expect(result.centroid).toBeNull()
    expect(result.extent).toBeNull()
  })
})
