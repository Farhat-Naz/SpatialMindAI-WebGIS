import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { parseKml } from "../kmlParser"

/**
 * KML / KMZ parser tests (specs/005-import-export, Phase 10; FR-022–FR-027).
 */

const FIXTURES = resolve(process.cwd(), "src/features/import-export/__tests__/fixtures")

function fixtureFile(name: string, type = ""): File {
  return new File([readFileSync(resolve(FIXTURES, name))], name, { type })
}

describe("parseKml — plain .kml", () => {
  it("reads every placemark regardless of geometry type", async () => {
    const result = await parseKml(fixtureFile("places.kml"), {})

    // Depot, Yard A, Route 1, Zone.
    expect(result.features).toHaveLength(4)
    const types = result.features.map((feature) => feature.geometry.type).sort()
    expect(types).toEqual(["LineString", "Point", "Point", "Polygon"])
  })

  it("reports WGS84 without asking the user (FR-024)", async () => {
    const result = await parseKml(fixtureFile("places.kml"), {})
    // KML fixes its coordinate system by specification — there is nothing to
    // detect and nothing to choose.
    expect(result.detectedCrs).toBe("EPSG:4326")
  })

  it("preserves the placemark name as an attribute", async () => {
    const result = await parseKml(fixtureFile("places.kml"), {})
    const names = result.features.map((feature) => feature.properties.name)

    expect(names).toContain("Depot")
    expect(names).toContain("Zone")
  })

  it("preserves the description", async () => {
    const result = await parseKml(fixtureFile("places.kml"), {})
    const depot = result.features.find((feature) => feature.properties.name === "Depot")
    expect(depot?.properties.description).toBe("Main depot")
  })

  it("carries the folder path as an attribute (FR-025)", async () => {
    const result = await parseKml(fixtureFile("places.kml"), {})

    const depot = result.features.find((feature) => feature.properties.name === "Depot")
    const yard = result.features.find((feature) => feature.properties.name === "Yard A")
    const zone = result.features.find((feature) => feature.properties.name === "Zone")

    // `@tmcw/togeojson` flattens folders away entirely, so the hierarchy is
    // recovered from the DOM — otherwise KML's own organization is simply lost.
    expect(depot?.properties.folderPath).toBe("North")
    expect(yard?.properties.folderPath).toBe("North/Yards")
    expect(zone?.properties.folderPath).toBe("South")
  })

  it("drops altitude and says so once, not once per feature (FR-026)", async () => {
    const result = await parseKml(fixtureFile("places.kml"), {})

    // Every stored position is 2D, because the geometry column is.
    for (const feature of result.features) {
      const flat = JSON.stringify(feature.geometry.coordinates)
      const positions = flat.match(/\[[-\d.]+,[-\d.]+(,[-\d.]+)?\]/g) ?? []
      expect(positions.every((position) => position.split(",").length === 2)).toBe(true)
    }

    const altitudeWarnings = result.warnings.filter((warning) => /altitude/i.test(warning.message))
    // A 10,000-placemark tour must not produce 10,000 identical issues.
    expect(altitudeWarnings).toHaveLength(1)
  })

  it("reports unsupported content rather than failing on it (FR-027)", async () => {
    const result = await parseKml(fixtureFile("places.kml"), {})
    const messages = result.warnings.map((warning) => warning.message).join(" ")

    // The fixture carries a GroundOverlay and a NetworkLink.
    expect(messages).toMatch(/overlays/i)
    expect(messages).toMatch(/NetworkLink|external KML/i)
    // Reported and skipped — the placemarks still import.
    expect(result.features).toHaveLength(4)
  })

  it("rejects malformed XML with a clear message", async () => {
    const file = new File(["<kml><Document><Placemark>"], "broken.kml")
    await expect(parseKml(file, {})).rejects.toThrow(/not well-formed XML/i)
  })
})

describe("parseKml — .kmz", () => {
  it("unzips the archive and reads the document inside (FR-022)", async () => {
    const result = await parseKml(fixtureFile("places.kmz", "application/vnd.google-earth.kmz"), {})
    expect(result.features).toHaveLength(4)
  })

  it("produces output indistinguishable from the equivalent .kml", async () => {
    const fromKml = await parseKml(fixtureFile("places.kml"), {})
    const fromKmz = await parseKml(fixtureFile("places.kmz"), {})

    // The archive is opened client-side, so the server sees identical chunks
    // either way — which is why there is no separate KMZ endpoint.
    expect(fromKmz.features).toEqual(fromKml.features)
    expect(fromKmz.detectedCrs).toBe(fromKml.detectedCrs)
  })

  it("ignores non-KML assets in the archive", async () => {
    // The fixture also contains `images/scan.png`.
    const result = await parseKml(fixtureFile("places.kmz"), {})
    expect(result.features).toHaveLength(4)
  })

  it("rejects an archive with no .kml document", async () => {
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    zip.file("readme.txt", "no kml here")
    const buffer = await zip.generateAsync({ type: "arraybuffer" })

    await expect(
      parseKml(new File([buffer], "empty.kmz", { type: "application/zip" }), {}),
    ).rejects.toThrow(/contains no \.kml document/i)
  })
})

describe("parseKml — cancellation", () => {
  it("honours an already-aborted signal", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(parseKml(fixtureFile("places.kml"), { signal: controller.signal })).rejects.toThrow()
  })
})
