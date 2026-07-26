import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  EXPORT_MIME_TYPES,
  exportAnalysisResult,
  exportLayerAsCsv,
  exportLayerAsGeoJson,
  exportLayerAsKml,
} from "../exportService"
import { exportLayerAsGeoJson as databaseExportLayerAsGeoJson } from "@/features/database/services/exportLayer"
import { featureService } from "@/features/database/services/featureService"

// `vi.hoisted` is required because vi.mock factories are hoisted above
// ordinary declarations.
const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))

vi.mock("@/features/database/services/featureService", () => ({ featureService: { list: listMock } }))

const mockedFeatureService = vi.mocked(featureService)

function feature(geometry: unknown, attributes: Record<string, string> = {}) {
  return {
    id: `f-${Math.random()}`,
    geometry,
    attributes: Object.entries(attributes).map(([key, value]) => ({ key, value })),
  }
}

/** Serves the given pages in order, mirroring the cursor-paginated Features API. */
function servePages(pages: { features: unknown[]; nextCursor: string | null }[]) {
  let call = 0
  mockedFeatureService.list.mockImplementation(async () => {
    const page = pages[Math.min(call, pages.length - 1)]
    call += 1
    return page as never
  })
}

const POINT = { type: "Point", coordinates: [1, 2] }
const LINE = { type: "LineString", coordinates: [[0, 0], [1, 1]] }
const POLYGON = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] }

/** T236 (US9) — per-format structural assertions against a fixed feature set. */
describe("exportService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exportLayerAsGeoJson re-exports database's existing function unchanged, not a duplicate (T226)", () => {
    expect(exportLayerAsGeoJson).toBe(databaseExportLayerAsGeoJson)
  })

  describe("CSV (T228)", () => {
    it("flattens attributes to columns and carries geometry in its own column", async () => {
      servePages([
        {
          features: [feature(POINT, { name: "A", zone: "R1" }), feature(LINE, { name: "B", zone: "R2" })],
          nextCursor: null,
        },
      ])

      const text = await (await exportLayerAsCsv("layer-1")).text()
      const [header, ...rows] = text.split("\r\n")

      expect(header).toBe("name,zone,geometry")
      expect(rows).toHaveLength(2)
      expect(rows[0]).toContain("A,R1,")
      expect(rows[0]).toContain('"{""type"":""Point"",""coordinates"":[1,2]}"')
    })

    it("unions columns across pages rather than taking only the first page's keys", async () => {
      servePages([
        { features: [feature(POINT, { name: "A" })], nextCursor: "c1" },
        { features: [feature(POINT, { name: "B", extra: "late" })], nextCursor: null },
      ])

      const text = await (await exportLayerAsCsv("layer-1")).text()
      const [header, ...rows] = text.split("\r\n")

      // "extra" only appears on page 2 - a header built from page 1 alone
      // would silently drop that column.
      expect(header).toBe("extra,name,geometry")
      expect(rows[0].startsWith(",A,")).toBe(true)
      expect(rows[1].startsWith("late,B,")).toBe(true)
    })

    it("escapes commas, quotes, and newlines per RFC 4180", async () => {
      servePages([
        {
          features: [feature(POINT, { note: 'has "quotes", a comma\nand a newline' })],
          nextCursor: null,
        },
      ])

      const text = await (await exportLayerAsCsv("layer-1")).text()

      expect(text).toContain('"has ""quotes"", a comma\nand a newline"')
    })

    it("is typed as CSV", async () => {
      servePages([{ features: [], nextCursor: null }])
      expect((await exportLayerAsCsv("layer-1")).type).toBe(EXPORT_MIME_TYPES.csv)
    })
  })

  describe("KML (T229)", () => {
    it("produces a well-formed document with one Placemark per feature", async () => {
      servePages([{ features: [feature(POINT, { name: "Site" }), feature(LINE)], nextCursor: null }])

      const text = await (await exportLayerAsKml("layer-1")).text()

      expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
      expect(text).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">')
      expect(text.match(/<Placemark>/g)).toHaveLength(2)
      expect(text.trimEnd().endsWith("</kml>")).toBe(true)
    })

    it("maps each GeoJSON geometry type to its KML equivalent", async () => {
      servePages([
        {
          features: [
            feature(POINT),
            feature(LINE),
            feature(POLYGON),
            feature({ type: "MultiPolygon", coordinates: [POLYGON.coordinates] }),
          ],
          nextCursor: null,
        },
      ])

      const text = await (await exportLayerAsKml("layer-1")).text()

      expect(text).toContain("<Point><coordinates>1,2</coordinates></Point>")
      expect(text).toContain("<LineString><coordinates>0,0 1,1</coordinates></LineString>")
      expect(text).toContain("<outerBoundaryIs><LinearRing>")
      // A multipolygon stays one placemark via KML's own MultiGeometry.
      expect(text).toContain("<MultiGeometry>")
    })

    it("carries attributes as ExtendedData and uses name for the placemark title", async () => {
      servePages([{ features: [feature(POINT, { name: "Depot", owner: "City" })], nextCursor: null }])

      const text = await (await exportLayerAsKml("layer-1")).text()

      expect(text).toContain("<name>Depot</name>")
      expect(text).toContain('<Data name="owner"><value>City</value></Data>')
    })

    it("escapes XML-significant characters in names and values", async () => {
      servePages([{ features: [feature(POINT, { name: "A & B <test>" })], nextCursor: null }])

      const text = await (await exportLayerAsKml("layer-1")).text()

      expect(text).toContain("A &amp; B &lt;test&gt;")
      expect(text).not.toContain("<test>")
    })

    it("includes features from every page", async () => {
      servePages([
        { features: [feature(POINT)], nextCursor: "c1" },
        { features: [feature(POINT)], nextCursor: null },
      ])

      const text = await (await exportLayerAsKml("layer-1")).text()
      expect(text.match(/<Placemark>/g)).toHaveLength(2)
    })
  })

  describe("progress reporting (T231)", () => {
    it("reports each page as it loads and never overstates the total", async () => {
      servePages([
        { features: [feature(POINT)], nextCursor: "c1" },
        { features: [feature(POINT)], nextCursor: "c2" },
        { features: [feature(POINT)], nextCursor: null },
      ])
      const seen: [number, number][] = []

      await exportLayerAsKml("layer-1", (loaded, total) => seen.push([loaded, total]))

      // While pages remain the total is "at least one more"; the final
      // call reports a settled total equal to what was actually loaded.
      expect(seen).toEqual([
        [1, 2],
        [2, 3],
        [3, 3],
      ])
    })
  })

  describe("exportAnalysisResult (T227)", () => {
    it("exports a run's result layer as GeoJSON via the shared assembler", async () => {
      servePages([{ features: [feature(POINT, { name: "A" })], nextCursor: null }])

      const { blob, featureCount } = await exportAnalysisResult(
        { resultLayerId: "layer-1", resultData: null },
        "geojson",
      )
      const parsed = JSON.parse(await blob.text())

      expect(parsed.type).toBe("FeatureCollection")
      expect(parsed.features).toHaveLength(1)
      expect(parsed.features[0].properties).toEqual({ name: "A" })
      expect(featureCount).toBe(1)
    })

    it("reports the feature count for a layer-backed export", async () => {
      servePages([{ features: [feature(POINT), feature(LINE)], nextCursor: null }])

      const { featureCount } = await exportAnalysisResult({ resultLayerId: "layer-1", resultData: null }, "kml")
      expect(featureCount).toBe(2)
    })

    it("serializes a statistics run's payload when there is no result layer", async () => {
      const { blob, featureCount } = await exportAnalysisResult(
        { resultLayerId: null, resultData: { featureCount: 3, totalAreaSquareMeters: 42 } },
        "geojson",
      )

      // Statistics produce no geometry, so the payload itself is the export
      // rather than the operation failing.
      expect(JSON.parse(await blob.text())).toEqual({ featureCount: 3, totalAreaSquareMeters: 42 })
      expect(featureCount).toBe(0)
      expect(mockedFeatureService.list).not.toHaveBeenCalled()
    })

    it("renders a layerless payload as a single CSV row when CSV is requested", async () => {
      const { blob } = await exportAnalysisResult(
        { resultLayerId: null, resultData: { featureCount: 3, totalAreaSquareMeters: 42 } },
        "csv",
      )

      expect(await blob.text()).toBe("featureCount,totalAreaSquareMeters\r\n3,42")
    })
  })
})
