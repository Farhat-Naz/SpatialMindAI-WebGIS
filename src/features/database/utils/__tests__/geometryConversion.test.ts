import { describe, expect, it } from "vitest"
import { circleToPolygon, rectangleToPolygon } from "../geometryConversion"

describe("rectangleToPolygon", () => {
  it("produces a closed Polygon with exactly 5 positions (4 corners + closing point)", () => {
    const geometry = rectangleToPolygon({ north: 10, south: 0, east: 20, west: 5 })
    expect(geometry.type).toBe("Polygon")
    if (geometry.type === "Polygon") {
      expect(geometry.coordinates).toHaveLength(1)
      expect(geometry.coordinates[0]).toHaveLength(5)
      expect(geometry.coordinates[0][0]).toEqual(geometry.coordinates[0][4])
    }
  })
})

describe("circleToPolygon", () => {
  it("produces a Polygon approximating a circle with the requested vertex count", () => {
    const geometry = circleToPolygon([10, 20], 1000, 64)
    expect(geometry.type).toBe("Polygon")
    if (geometry.type === "Polygon") {
      // Turf's circle closes the ring, so it returns steps + 1 positions.
      expect(geometry.coordinates[0].length).toBe(65)
      expect(geometry.coordinates[0][0]).toEqual(geometry.coordinates[0][64])
    }
  })

  it("defaults to 64 steps when none is provided", () => {
    const geometry = circleToPolygon([10, 20], 500)
    expect(geometry.type).toBe("Polygon")
    if (geometry.type === "Polygon") {
      expect(geometry.coordinates[0].length).toBe(65)
    }
  })
})
