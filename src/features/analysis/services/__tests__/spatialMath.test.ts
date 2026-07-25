import { describe, expect, it } from "vitest"
import {
  formatCoordinate,
  measureArea,
  measureAzimuth,
  measureBearing,
  measureDistance,
  measureLength,
  measurePerimeter,
  measureRadius,
  type Position,
} from "../spatialMath"

describe("spatialMath", () => {
  it("measureDistance: 1 degree of great-circle separation is ~111.2km, along either a meridian or the equator", () => {
    const alongMeridian = measureDistance([0, 0], [0, 1])
    const alongEquator = measureDistance([0, 0], [1, 0])

    expect(alongMeridian).toBeGreaterThan(111000)
    expect(alongMeridian).toBeLessThan(111400)
    expect(alongEquator).toBeGreaterThan(111000)
    expect(alongEquator).toBeLessThan(111400)
  })

  it("measureDistance: unit conversion is consistent (1000m == 1km)", () => {
    const meters = measureDistance([0, 0], [0, 1], "meters")
    const kilometers = measureDistance([0, 0], [0, 1], "kilometers")
    expect(meters / 1000).toBeCloseTo(kilometers, 6)
  })

  it("measureRadius delegates to the same great-circle distance as measureDistance", () => {
    const center: Position = [10, 20]
    const edge: Position = [10.5, 20.5]
    expect(measureRadius(center, edge)).toBe(measureDistance(center, edge))
  })

  it("measureBearing: due north is 0°, due east is 90°, due west is -90°", () => {
    expect(measureBearing([0, 0], [0, 1])).toBeCloseTo(0, 1)
    expect(measureBearing([0, 0], [1, 0])).toBeCloseTo(90, 1)
    expect(measureBearing([0, 0], [-1, 0])).toBeCloseTo(-90, 1)
  })

  it("measureAzimuth: normalizes a negative bearing into 0-360°", () => {
    const bearing = measureBearing([0, 0], [-1, 0])
    const azimuth = measureAzimuth([0, 0], [-1, 0])
    expect(bearing).toBeLessThan(0)
    expect(azimuth).toBeCloseTo(bearing + 360, 6)
    expect(azimuth).toBeGreaterThanOrEqual(0)
    expect(azimuth).toBeLessThan(360)
  })

  it("measureArea: a small square near the equator matches the flat-earth approximation within tolerance", () => {
    const square = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [0, 0.01],
          [0.01, 0.01],
          [0.01, 0],
          [0, 0],
        ],
      ],
    }
    const area = measureArea(square)
    // ~1113.2m per side near the equator → ~1.24e6 m²
    expect(area).toBeGreaterThan(1_000_000)
    expect(area).toBeLessThan(1_500_000)
  })

  it("measurePerimeter: matches 4x the flat-earth side length for the same square", () => {
    const square = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [0, 0.01],
          [0.01, 0.01],
          [0.01, 0],
          [0, 0],
        ],
      ],
    }
    const perimeter = measurePerimeter(square)
    expect(perimeter).toBeGreaterThan(4000)
    expect(perimeter).toBeLessThan(5000)
  })

  it("measureLength: accepts both a bare geometry and a Feature, with matching results", () => {
    const line = { type: "LineString" as const, coordinates: [[0, 0], [0, 1]] }
    const feature = { type: "Feature" as const, properties: {}, geometry: line }
    expect(measureLength(line)).toBeCloseTo(measureLength(feature), 6)
  })

  it("formatCoordinate: formats to 4 decimal places, lat/lng in the project's existing display convention", () => {
    expect(formatCoordinate([12.34567, -8.7654321])).toEqual({ lat: "-8.7654", lng: "12.3457" })
  })
})
