import { describe, expect, it } from "vitest"
import type { ColumnMapping } from "@/shared/contracts/importJob.schema"
import { guessCoordinateColumns, parseCsv, previewCsv } from "../csvParser"

/**
 * CSV parser tests (specs/005-import-export, Phase 11; FR-028–FR-033).
 */

function csvFile(text: string, name = "sites.csv"): File {
  return new File([text], name, { type: "text/csv" })
}

function mapping(overrides: Partial<ColumnMapping> = {}): ColumnMapping {
  return {
    latitudeColumn: "lat",
    longitudeColumn: "lon",
    delimiter: ",",
    hasHeaderRow: true,
    attributeColumns: [],
    ...overrides,
  }
}

describe("guessCoordinateColumns", () => {
  it.each([
    [["lat", "lon"], "lat", "lon"],
    [["Latitude", "Longitude"], "Latitude", "Longitude"],
    [["Y", "X"], "Y", "X"],
    [["northing", "easting"], "northing", "easting"],
    [["lat_dd", "lon_dd"], "lat_dd", "lon_dd"],
  ])("guesses %j", (headers, lat, lon) => {
    expect(guessCoordinateColumns(headers)).toEqual({ latitudeColumn: lat, longitudeColumn: lon })
  })

  it("prefers an exact hint over a substring match", () => {
    // Without exact-first ordering, `latitude_source` could win over `lat`.
    const result = guessCoordinateColumns(["latitude_source", "lat", "lon"])
    expect(result.latitudeColumn).toBe("lat")
  })

  it("returns nothing when no column looks like a coordinate", () => {
    expect(guessCoordinateColumns(["name", "notes"])).toEqual({
      latitudeColumn: undefined,
      longitudeColumn: undefined,
    })
  })
})

describe("previewCsv", () => {
  it("returns headers and the first rows without reading the whole file", async () => {
    const file = csvFile("lat,lon,site\n51.5,-0.12,Depot\n52.5,-1.9,Yard\n53.5,-2.2,Works\n")
    const preview = await previewCsv(file, { previewRows: 2 })

    expect(preview.headers).toEqual(["lat", "lon", "site"])
    expect(preview.rows).toHaveLength(2)
    expect(preview.delimiter).toBe(",")
  })

  it("detects a semicolon delimiter", async () => {
    const preview = await previewCsv(csvFile("lat;lon;site\n51.5;-0.12;Depot\n"))
    expect(preview.delimiter).toBe(";")
    expect(preview.headers).toEqual(["lat", "lon", "site"])
  })

  it("names columns positionally when there is no header row", async () => {
    const preview = await previewCsv(csvFile("51.5,-0.12,Depot\n"), { hasHeaderRow: false })
    expect(preview.headers).toEqual(["column_1", "column_2", "column_3"])
    expect(preview.rows[0].column_3).toBe("Depot")
  })
})

describe("parseCsv", () => {
  it("builds one point feature per row, longitude first", async () => {
    const result = await parseCsv(csvFile("lat,lon,site\n51.5,-0.12,Depot\n"), {
      columnMapping: mapping(),
    })

    expect(result.features).toHaveLength(1)
    // GeoJSON position order is [x, y] — building it from named columns is what
    // makes the classic lat/lng swap impossible to introduce silently.
    expect(result.features[0].geometry.coordinates).toEqual([-0.12, 51.5])
  })

  it("reports a 1-based line number the user can find in a spreadsheet (FR-033)", async () => {
    const result = await parseCsv(csvFile("lat,lon\n51.5,-0.12\n52.5,-1.9\n"), {
      columnMapping: mapping(),
    })

    // Header occupies line 1, so the first data row is line 2.
    expect(result.features.map((f) => f.sourcePosition)).toEqual([2, 3])
  })

  it("starts at line 1 when there is no header row", async () => {
    const result = await parseCsv(csvFile("51.5,-0.12\n"), {
      columnMapping: mapping({
        hasHeaderRow: false,
        latitudeColumn: "column_1",
        longitudeColumn: "column_2",
      }),
    })
    expect(result.features[0].sourcePosition).toBe(1)
  })

  it("carries non-coordinate columns as attributes by default", async () => {
    const result = await parseCsv(csvFile("lat,lon,site,ward\n51.5,-0.12,Depot,Holborn\n"), {
      columnMapping: mapping(),
    })

    expect(result.features[0].properties).toEqual({ site: "Depot", ward: "Holborn" })
    // The coordinate columns are not duplicated into attributes.
    expect(result.features[0].properties).not.toHaveProperty("lat")
  })

  it("honours an explicit attributeColumns selection", async () => {
    const result = await parseCsv(csvFile("lat,lon,site,ward\n51.5,-0.12,Depot,Holborn\n"), {
      columnMapping: mapping({ attributeColumns: ["site"] }),
    })
    expect(result.features[0].properties).toEqual({ site: "Depot" })
  })

  it("skips a row with a missing coordinate and reports it (FR-032)", async () => {
    const result = await parseCsv(csvFile("lat,lon,site\n51.5,-0.12,Depot\n,,Missing\n52.5,-1.9,Yard\n"), {
      columnMapping: mapping(),
    })

    expect(result.features).toHaveLength(2)
    const issue = result.warnings.find((w) => w.category === "missing_coordinate")
    expect(issue?.sourcePosition).toBe(3)
    expect(issue?.message).toMatch(/"lat"/)
  })

  it("skips a row whose coordinate is not a number", async () => {
    const result = await parseCsv(csvFile("lat,lon\nnorth,west\n"), { columnMapping: mapping() })
    expect(result.features).toHaveLength(0)
    expect(result.warnings[0].category).toBe("missing_coordinate")
  })

  it("accepts a comma decimal separator, as used across most of Europe", async () => {
    const result = await parseCsv(csvFile("lat;lon\n51,5074;-0,1278\n"), {
      columnMapping: mapping({ delimiter: ";" }),
    })

    expect(result.features).toHaveLength(1)
    expect(result.features[0].geometry.coordinates).toEqual([-0.1278, 51.5074])
  })

  it("rejects a thousands-separated value rather than guessing at it", async () => {
    // "1,234.5" carries both separators, so which one is decimal is ambiguous.
    // Rewriting the comma would silently corrupt the coordinate, so the row is
    // reported and skipped instead — a visible rejection beats a wrong location.
    const result = await parseCsv(csvFile('lat;lon\n"1,234.5";2\n'), {
      columnMapping: mapping({ delimiter: ";" }),
    })

    expect(result.features).toHaveLength(0)
    expect(result.warnings[0]).toMatchObject({ category: "missing_coordinate", sourcePosition: 2 })
  })

  it("reports the columns it found, for the mapper", async () => {
    const result = await parseCsv(csvFile("lat,lon,site\n51.5,-0.12,Depot\n"), {
      columnMapping: mapping(),
    })
    expect(result.columns).toEqual(["lat", "lon", "site"])
  })

  it("refuses to parse without a column mapping", async () => {
    await expect(parseCsv(csvFile("lat,lon\n1,2\n"), {})).rejects.toThrow(
      /latitude and longitude columns chosen/,
    )
  })

  it("leaves projected coordinates untransformed", async () => {
    const result = await parseCsv(csvFile("northing,easting\n180381,530034\n"), {
      columnMapping: mapping({ latitudeColumn: "northing", longitudeColumn: "easting" }),
      sourceCrs: "EPSG:27700",
    })

    expect(result.features[0].geometry.coordinates).toEqual([530034, 180381])
    expect(result.detectedCrs).toBe("EPSG:27700")
  })
})
