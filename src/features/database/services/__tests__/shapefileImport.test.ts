import { beforeEach, describe, expect, it, vi } from "vitest"
import { convertShapefileToFeatures } from "../shapefileImport"

const UTM_ZONE_33N_WKT =
  'PROJCS["WGS 84 / UTM zone 33N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",15],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1]]'

function fakeFile(name: string, content: string): File {
  return new File([content], name)
}

function makeSource(records: { geometry: unknown; properties?: Record<string, unknown> }[]) {
  let index = 0
  return {
    bbox: [0, 0, 0, 0],
    read: vi.fn(async () => {
      if (index >= records.length) return { done: true, value: undefined }
      const value = records[index]
      index += 1
      return { done: false, value }
    }),
    cancel: vi.fn(async () => {}),
  }
}

const openMock = vi.fn()

vi.mock("shapefile", () => ({
  open: (...args: unknown[]) => openMock(...args),
}))

describe("convertShapefileToFeatures", () => {
  beforeEach(() => {
    openMock.mockReset()
  })

  it("converts a valid WGS84 Shapefile set to a matching feature count", async () => {
    openMock.mockResolvedValue(
      makeSource([
        { geometry: { type: "Point", coordinates: [1, 2] }, properties: { name: "A" } },
        { geometry: { type: "Point", coordinates: [3, 4] }, properties: { name: "B" } },
      ]),
    )

    const result = await convertShapefileToFeatures({
      shp: fakeFile("roads.shp", ""),
      dbf: fakeFile("roads.dbf", ""),
    })

    expect(result.status).toBe("success")
    expect(result.features).toHaveLength(2)
    expect(result.features?.[0].geometry).toEqual({ type: "Point", coordinates: [1, 2] })
    expect(result.features?.[0].properties).toEqual({ name: "A" })
  })

  it("reprojects coordinates to WGS84 when a .prj file is present", async () => {
    openMock.mockResolvedValue(
      makeSource([{ geometry: { type: "Point", coordinates: [500000, 5540000] } }]),
    )

    const result = await convertShapefileToFeatures({
      shp: fakeFile("roads.shp", ""),
      dbf: fakeFile("roads.dbf", ""),
      prj: fakeFile("roads.prj", UTM_ZONE_33N_WKT),
    })

    expect(result.status).toBe("success")
    const [lng, lat] = (result.features?.[0].geometry as { coordinates: [number, number] })
      .coordinates
    expect(lng).toBeCloseTo(15.0, 1)
    expect(lat).toBeCloseTo(50.0, 1)
  })

  it("rejects a set missing the required .dbf file, before opening anything", async () => {
    const result = await convertShapefileToFeatures({ shp: fakeFile("roads.shp", "") })

    expect(result.status).toBe("error")
    expect(result.errorMessage).toMatch(/\.dbf/)
    expect(openMock).not.toHaveBeenCalled()
  })

  it("rejects an unsupported geometry type", async () => {
    openMock.mockResolvedValue(
      makeSource([{ geometry: { type: "GeometryCollection", geometries: [] } }]),
    )

    const result = await convertShapefileToFeatures({
      shp: fakeFile("roads.shp", ""),
      dbf: fakeFile("roads.dbf", ""),
    })

    expect(result.status).toBe("error")
    expect(result.errorMessage).toBeTruthy()
  })

  it("rejects a record with null geometry", async () => {
    openMock.mockResolvedValue(makeSource([{ geometry: null }]))

    const result = await convertShapefileToFeatures({
      shp: fakeFile("roads.shp", ""),
      dbf: fakeFile("roads.dbf", ""),
    })

    expect(result.status).toBe("error")
    expect(result.errorMessage).toMatch(/no geometry/)
  })

  it("rejects an empty Shapefile", async () => {
    openMock.mockResolvedValue(makeSource([]))

    const result = await convertShapefileToFeatures({
      shp: fakeFile("roads.shp", ""),
      dbf: fakeFile("roads.dbf", ""),
    })

    expect(result.status).toBe("error")
    expect(result.errorMessage).toMatch(/no features/)
  })
})
