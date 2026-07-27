import { describe, expect, it } from "vitest"
import { parseGeoJson } from "../geoJsonParser"

/**
 * GeoJSON parser tests (specs/005-import-export, T076; FR-014–FR-016).
 */

/** Builds a `File` from an object, the way the dialog hands one to the parser. */
function geoJsonFile(body: unknown, name = "test.geojson"): File {
  return new File([JSON.stringify(body)], name, { type: "application/geo+json" })
}

function collection(features: unknown[], extra: Record<string, unknown> = {}) {
  return { type: "FeatureCollection", features, ...extra }
}

const point = (lng: number, lat: number) => ({ type: "Point", coordinates: [lng, lat] })

describe("parseGeoJson", () => {
  it("parses a FeatureCollection into normalized features", async () => {
    const result = await parseGeoJson(
      geoJsonFile(
        collection([
          { type: "Feature", geometry: point(1, 2), properties: { name: "A" } },
          { type: "Feature", geometry: point(3, 4), properties: { name: "B" } },
        ]),
      ),
      {},
    )

    expect(result.features).toHaveLength(2)
    expect(result.features[0].sourcePosition).toBe(0)
    expect(result.features[1].properties.name).toBe("B")
    expect(result.warnings).toHaveLength(0)
  })

  it("defaults to WGS84, which RFC 7946 mandates", async () => {
    const result = await parseGeoJson(
      geoJsonFile(collection([{ type: "Feature", geometry: point(1, 2), properties: {} }])),
      {},
    )
    expect(result.detectedCrs).toBe("EPSG:4326")
  })

  it.each([
    ["EPSG:27700", "EPSG:27700"],
    ["urn:ogc:def:crs:EPSG::27700", "EPSG:27700"],
    ["EPSG::3857", "EPSG:3857"],
  ])("honours a legacy crs member of %s", async (name, expected) => {
    const result = await parseGeoJson(
      geoJsonFile(
        collection([{ type: "Feature", geometry: point(530000, 180000), properties: {} }], {
          crs: { type: "name", properties: { name } },
        }),
      ),
      {},
    )
    // Reading projected coordinates as degrees is the wrong-hemisphere failure
    // FR-065 exists to catch; honouring the member avoids it silently happening.
    expect(result.detectedCrs).toBe(expected)
  })

  // ---- FR-014: structural rejection ---------------------------------------

  it("rejects a bare Feature root, naming what was found", async () => {
    await expect(
      parseGeoJson(geoJsonFile({ type: "Feature", geometry: point(1, 2) }), {}),
    ).rejects.toThrow(/FeatureCollection[\s\S]*but this file is a Feature/)
  })

  it("rejects a raw geometry root", async () => {
    await expect(parseGeoJson(geoJsonFile(point(1, 2)), {})).rejects.toThrow(/FeatureCollection/)
  })

  it("rejects a FeatureCollection with no features array", async () => {
    await expect(parseGeoJson(geoJsonFile({ type: "FeatureCollection" }), {})).rejects.toThrow(
      /no "features" array/,
    )
  })

  it("rejects a file that is not JSON at all", async () => {
    const file = new File(["<kml></kml>"], "lies.geojson")
    await expect(parseGeoJson(file, {})).rejects.toThrow(/not valid JSON/)
  })

  // ---- Lenient per-feature handling (FR-006) ------------------------------

  it("reports a null geometry as an issue and keeps going", async () => {
    const result = await parseGeoJson(
      geoJsonFile(
        collection([
          { type: "Feature", geometry: null, properties: {} },
          { type: "Feature", geometry: point(1, 2), properties: {} },
        ]),
      ),
      {},
    )

    expect(result.features).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ sourcePosition: 0, category: "invalid_geometry" })
  })

  it("distinguishes an unsupported type from a malformed supported one", async () => {
    const result = await parseGeoJson(
      geoJsonFile(
        collection([
          { type: "Feature", geometry: { type: "GeometryCollection", geometries: [] }, properties: {} },
          { type: "Feature", geometry: { type: "Point", coordinates: ["x", "y"] }, properties: {} },
        ]),
      ),
      {},
    )

    expect(result.features).toHaveLength(0)
    expect(result.warnings[0].category).toBe("unsupported_geometry_type")
    expect(result.warnings[0].message).toMatch(/GeometryCollection/)
    expect(result.warnings[1].category).toBe("invalid_geometry")
  })

  // ---- FR-015 / FR-016: property handling --------------------------------

  it("omits a null property rather than storing the text \"null\" (FR-015)", async () => {
    const result = await parseGeoJson(
      geoJsonFile(
        collection([{ type: "Feature", geometry: point(1, 2), properties: { a: null, b: "kept" } }]),
      ),
      {},
    )

    expect(result.features[0].properties).not.toHaveProperty("a")
    expect(result.features[0].properties.b).toBe("kept")
  })

  it("flattens a nested property to compact JSON (FR-016)", async () => {
    const result = await parseGeoJson(
      geoJsonFile(
        collection([
          { type: "Feature", geometry: point(1, 2), properties: { meta: { a: 1 }, list: [1, 2] } },
        ]),
      ),
      {},
    )

    expect(result.features[0].properties.meta).toBe('{"a":1}')
    expect(result.features[0].properties.list).toBe("[1,2]")
  })

  it("stringifies numbers and booleans", async () => {
    const result = await parseGeoJson(
      geoJsonFile(
        collection([{ type: "Feature", geometry: point(1, 2), properties: { n: 42, b: false } }]),
      ),
      {},
    )

    expect(result.features[0].properties).toMatchObject({ n: "42", b: "false" })
  })

  it("accepts a feature with no properties at all", async () => {
    const result = await parseGeoJson(
      geoJsonFile(collection([{ type: "Feature", geometry: point(1, 2) }])),
      {},
    )
    expect(result.features[0].properties).toEqual({})
  })

  it("leaves coordinates untransformed, in the source CRS", async () => {
    // The persisted transform is ST_Transform, server-side (research.md D4).
    const result = await parseGeoJson(
      geoJsonFile(
        collection([{ type: "Feature", geometry: point(530034, 180381), properties: {} }], {
          crs: { type: "name", properties: { name: "EPSG:27700" } },
        }),
      ),
      {},
    )
    expect(result.features[0].geometry.coordinates).toEqual([530034, 180381])
  })

  it("honours an abort signal", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      parseGeoJson(geoJsonFile(collection([])), { signal: controller.signal }),
    ).rejects.toThrow()
  })
})
