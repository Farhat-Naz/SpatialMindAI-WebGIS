import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { featureService } from "@/features/database/services/featureService"
import type { ExportSource } from "../../types/importExport.types"
import {
  escapeXml,
  inspectShapeClasses,
  neutralizeCsvFormula,
  toCsvField,
  toKmlGeometry,
  writeCsv,
  writeGeoJson,
  writeKml,
} from "../exportWriters"

/**
 * Export writer tests (specs/005-import-export, T084).
 *
 * The formula-neutralization cases (FR-040) are the ones worth the most here:
 * they close a genuine gap in the writer inherited from 007, and a regression
 * would silently reintroduce a spreadsheet code-execution vector.
 */

/** One page of the paged feature listing, shaped as `featureService.list` returns it. */
function page(
  features: { id: string; geometry: unknown; attributes: { key: string; value: string }[] }[],
  nextCursor: string | null = null,
) {
  return { features, nextCursor }
}

const layerSource: ExportSource = { kind: "layer", layerId: "layer-1", layerName: "Parcels" }

let list: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  list = vi.spyOn(featureService, "list")
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("neutralizeCsvFormula", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)"])("prefixes %s so a spreadsheet treats it as text", (value) => {
    const result = neutralizeCsvFormula(value)
    expect(result).toBe(`'${value}`)
    // The value itself is preserved — only its executability is removed.
    expect(result.slice(1)).toBe(value)
  })

  it.each(["Holborn", "1234", "", "a=b"])("leaves %s untouched", (value) => {
    expect(neutralizeCsvFormula(value)).toBe(value)
  })

  it("neutralizes the classic exfiltration payload", () => {
    expect(neutralizeCsvFormula('=HYPERLINK("http://evil","click")')).toMatch(/^'=HYPERLINK/)
  })
})

describe("toCsvField", () => {
  it.each([
    ["plain", "plain"],
    ["with,comma", '"with,comma"'],
    ['say "hi"', '"say ""hi"""'],
    ["two\nlines", '"two\nlines"'],
  ])("escapes %s per RFC 4180", (input, expected) => {
    expect(toCsvField(input)).toBe(expected)
  })
})

describe("escapeXml", () => {
  it("escapes all five XML entities", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;",
    )
  })
})

describe("toKmlGeometry", () => {
  it("preserves a multipolygon as one MultiGeometry rather than splitting it", () => {
    const kml = toKmlGeometry({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      ],
    })
    expect(kml).toMatch(/^<MultiGeometry>/)
    expect(kml).toContain("<Polygon>")
  })

  it("returns empty text for an unrepresentable geometry rather than throwing", () => {
    expect(toKmlGeometry(null)).toBe("")
    expect(toKmlGeometry({ type: "Nonsense" })).toBe("")
  })
})

describe("writeGeoJson", () => {
  it("assembles every page into one FeatureCollection", async () => {
    list
      .mockResolvedValueOnce(
        page([{ id: "f1", geometry: { type: "Point", coordinates: [1, 1] }, attributes: [] }], "cur") as never,
      )
      .mockResolvedValueOnce(
        page([{ id: "f2", geometry: { type: "Point", coordinates: [2, 2] }, attributes: [] }]) as never,
      )

    const result = await writeGeoJson(layerSource)
    const parsed = JSON.parse(await result.blob.text())

    expect(result.featureCount).toBe(2)
    expect(parsed.type).toBe("FeatureCollection")
    expect(parsed.features).toHaveLength(2)
  })

  it("reports honest progress that never moves backwards", async () => {
    list
      .mockResolvedValueOnce(page([{ id: "f1", geometry: null, attributes: [] }], "cur") as never)
      .mockResolvedValueOnce(page([{ id: "f2", geometry: null, attributes: [] }]) as never)

    const seen: [number, number][] = []
    await writeGeoJson(layerSource, { onProgress: (loaded, total) => seen.push([loaded, total]) })

    // (1, 2) while more remain, then (2, 2) once finished — "at least this far".
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it("exports only the selected features for a selection scope", async () => {
    list.mockResolvedValue(
      page([
        { id: "f1", geometry: { type: "Point", coordinates: [1, 1] }, attributes: [] },
        { id: "f2", geometry: { type: "Point", coordinates: [2, 2] }, attributes: [] },
        { id: "f3", geometry: { type: "Point", coordinates: [3, 3] }, attributes: [] },
      ]) as never,
    )

    const result = await writeGeoJson({
      kind: "selection",
      featureIds: ["f1", "f3"],
      layerId: "layer-1",
      layerName: "Parcels",
    })

    expect(result.featureCount).toBe(2)
    const parsed = JSON.parse(await result.blob.text())
    expect(parsed.features.map((f: { geometry: { coordinates: number[] } }) => f.geometry.coordinates[0])).toEqual([
      1, 3,
    ])
  })

  it("transforms coordinates into the requested output CRS", async () => {
    list.mockResolvedValue(
      page([{ id: "f1", geometry: { type: "Point", coordinates: [-0.1276, 51.5072] }, attributes: [] }]) as never,
    )

    const result = await writeGeoJson(layerSource, { outputCrs: "EPSG:3857" })
    const parsed = JSON.parse(await result.blob.text())
    const [x, y] = parsed.features[0].geometry.coordinates

    // Web Mercator metres, not degrees.
    expect(x).toBeCloseTo(-14204.4, 1)
    expect(y).toBeCloseTo(6711511, -1)
  })

  it("leaves coordinates alone for an unresolvable output CRS", async () => {
    list.mockResolvedValue(
      page([{ id: "f1", geometry: { type: "Point", coordinates: [1, 2] }, attributes: [] }]) as never,
    )

    const result = await writeGeoJson(layerSource, { outputCrs: "EPSG:999999" })
    const parsed = JSON.parse(await result.blob.text())
    expect(parsed.features[0].geometry.coordinates).toEqual([1, 2])
  })
})

describe("writeCsv", () => {
  it("emits a header covering columns that only appear on a later page", async () => {
    // The reason CSV rows are buffered: the full key set is unknown until the
    // last page arrives, and a header built from page one would drop `ward`.
    list
      .mockResolvedValueOnce(
        page([{ id: "f1", geometry: null, attributes: [{ key: "uprn", value: "1" }] }], "cur") as never,
      )
      .mockResolvedValueOnce(
        page([{ id: "f2", geometry: null, attributes: [{ key: "ward", value: "Holborn" }] }]) as never,
      )

    const text = await (await writeCsv(layerSource)).blob.text()
    const [header] = text.split("\r\n")

    expect(header).toBe("uprn,ward,geometry")
  })

  it("neutralizes a formula payload in a cell", async () => {
    list.mockResolvedValue(
      page([{ id: "f1", geometry: null, attributes: [{ key: "note", value: "=cmd|'/c calc'!A1" }] }]) as never,
    )

    const text = await (await writeCsv(layerSource)).blob.text()
    // No RFC 4180 quoting: the value has no comma, quote, or newline. The
    // apostrophe prefix is the whole defence.
    expect(text).toContain(`'=cmd|'/c calc'!A1`)
  })

  it("quotes as well as neutralizes when the payload also needs escaping", async () => {
    list.mockResolvedValue(
      page([{ id: "f1", geometry: null, attributes: [{ key: "note", value: "=SUM(A1,B1)" }] }]) as never,
    )

    const text = await (await writeCsv(layerSource)).blob.text()
    // Contains a comma, so it is quoted — with the apostrophe inside the quotes.
    expect(text).toContain(`"'=SUM(A1,B1)"`)
  })
})

describe("writeKml", () => {
  it("carries attributes as ExtendedData and names the placemark", async () => {
    list.mockResolvedValue(
      page([
        {
          id: "f1",
          geometry: { type: "Point", coordinates: [1, 2] },
          attributes: [{ key: "name", value: "Depot" }],
        },
      ]) as never,
    )

    const text = await (await writeKml(layerSource)).blob.text()
    expect(text).toContain("<name>Depot</name>")
    expect(text).toContain('<Data name="name">')
    expect(text).toContain("<kml xmlns=")
  })
})

describe("inspectShapeClasses", () => {
  it("reports every geometry class present, so mixed geometry can be warned about", async () => {
    list.mockResolvedValue(
      page([
        { id: "f1", geometry: { type: "Point", coordinates: [1, 1] }, attributes: [] },
        {
          id: "f2",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
          attributes: [],
        },
      ]) as never,
    )

    const classes = await inspectShapeClasses(layerSource)
    expect(classes.sort()).toEqual(["point", "polygon"])
  })
})
