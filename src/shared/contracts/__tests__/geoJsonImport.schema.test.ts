import { describe, expect, it } from "vitest"
import { importFeatureCollectionSchema, propertiesToAttributes } from "../geoJsonImport.schema"

const validPoint = {
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [10, 20] as [number, number] },
  properties: { name: "A" },
}

describe("importFeatureCollectionSchema", () => {
  it("accepts a valid FeatureCollection", () => {
    const result = importFeatureCollectionSchema.safeParse({
      type: "FeatureCollection",
      features: [validPoint],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty features array", () => {
    const result = importFeatureCollectionSchema.safeParse({
      type: "FeatureCollection",
      features: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a feature with an unsupported geometry type", () => {
    const result = importFeatureCollectionSchema.safeParse({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "GeometryCollection", geometries: [] },
          properties: {},
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a feature with no properties", () => {
    const result = importFeatureCollectionSchema.safeParse({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: validPoint.geometry }],
    })
    expect(result.success).toBe(true)
  })
})

describe("propertiesToAttributes", () => {
  it("flattens a properties object into key/value pairs", () => {
    expect(propertiesToAttributes({ name: "A", count: 5 })).toEqual([
      { key: "name", value: "A" },
      { key: "count", value: "5" },
    ])
  })

  it("drops null/undefined values", () => {
    expect(propertiesToAttributes({ a: null, b: undefined, c: "x" })).toEqual([
      { key: "c", value: "x" },
    ])
  })

  it("returns an empty array for null/undefined input", () => {
    expect(propertiesToAttributes(null)).toEqual([])
    expect(propertiesToAttributes(undefined)).toEqual([])
  })
})
