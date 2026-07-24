import { describe, expect, it } from "vitest"
import { geometrySchema } from "../geometry.schema"

describe("geometrySchema", () => {
  it("accepts a Point", () => {
    expect(
      geometrySchema.safeParse({ type: "Point", coordinates: [10, 20] }).success,
    ).toBe(true)
  })

  it("accepts a MultiPoint", () => {
    expect(
      geometrySchema.safeParse({
        type: "MultiPoint",
        coordinates: [[10, 20], [11, 21]],
      }).success,
    ).toBe(true)
  })

  it("accepts a LineString", () => {
    expect(
      geometrySchema.safeParse({
        type: "LineString",
        coordinates: [[10, 20], [11, 21]],
      }).success,
    ).toBe(true)
  })

  it("accepts a MultiLineString", () => {
    expect(
      geometrySchema.safeParse({
        type: "MultiLineString",
        coordinates: [[[10, 20], [11, 21]], [[12, 22], [13, 23]]],
      }).success,
    ).toBe(true)
  })

  it("accepts a Polygon", () => {
    expect(
      geometrySchema.safeParse({
        type: "Polygon",
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
      }).success,
    ).toBe(true)
  })

  it("accepts a MultiPolygon", () => {
    expect(
      geometrySchema.safeParse({
        type: "MultiPolygon",
        coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]],
      }).success,
    ).toBe(true)
  })

  it("rejects an unsupported geometry type", () => {
    expect(
      geometrySchema.safeParse({
        type: "GeometryCollection",
        geometries: [],
      }).success,
    ).toBe(false)
  })

  it("rejects an out-of-range longitude", () => {
    expect(
      geometrySchema.safeParse({ type: "Point", coordinates: [200, 20] }).success,
    ).toBe(false)
  })

  it("rejects an out-of-range latitude", () => {
    expect(
      geometrySchema.safeParse({ type: "Point", coordinates: [10, 91] }).success,
    ).toBe(false)
  })

  it("rejects a polygon ring with fewer than 4 positions", () => {
    expect(
      geometrySchema.safeParse({
        type: "Polygon",
        coordinates: [[[0, 0], [1, 0], [0, 1]]],
      }).success,
    ).toBe(false)
  })
})
