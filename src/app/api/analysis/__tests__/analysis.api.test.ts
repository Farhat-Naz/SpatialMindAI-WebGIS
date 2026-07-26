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
