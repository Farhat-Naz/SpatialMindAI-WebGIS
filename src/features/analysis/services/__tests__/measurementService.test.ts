import { describe, expect, it } from "vitest"
import type { LatLng } from "@/shared/types/common.types"
import { measurementService } from "../measurementService"

describe("measurementService", () => {
  it("distance: returns null until at least 2 points are drawn", () => {
    expect(measurementService.measure("distance", [{ lat: 0, lng: 0 }])).toEqual({ value: null, unit: null })
  })

  it("distance: sums segment lengths across a multi-point draw", () => {
    const points: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }]
    const result = measurementService.measure("distance", points)
    expect(result.unit).toBe("meters")
    // Two ~111.2km segments.
    expect(result.value).toBeGreaterThan(222000)
    expect(result.value).toBeLessThan(222800)
  })

  it("radius: returns null until 2 points exist (center + edge)", () => {
    expect(measurementService.measure("radius", [{ lat: 0, lng: 0 }])).toEqual({ value: null, unit: null })
  })

  it("bearing/azimuth: due east is 90°/90°", () => {
    const points: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]
    expect(measurementService.measure("bearing", points).value).toBeCloseTo(90, 1)
    expect(measurementService.measure("azimuth", points).value).toBeCloseTo(90, 1)
  })

  it("area/perimeter: returns null until at least 3 points exist", () => {
    const twoPoints: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }]
    expect(measurementService.measure("area", twoPoints)).toEqual({ value: null, unit: null })
    expect(measurementService.measure("perimeter", twoPoints)).toEqual({ value: null, unit: null })
  })

  it("area/perimeter: closes the ring automatically for a triangle draw", () => {
    const triangle: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }, { lat: 0.01, lng: 0.01 }]
    const area = measurementService.measure("area", triangle)
    expect(area.unit).toBe("squareMeters")
    expect(area.value).toBeGreaterThan(0)

    const perimeter = measurementService.measure("perimeter", triangle)
    expect(perimeter.unit).toBe("meters")
    expect(perimeter.value).toBeGreaterThan(0)
  })

  it("coordinates: formats the first drawn point, matching the project's display convention", () => {
    const result = measurementService.measure("coordinates", [{ lat: -8.7654321, lng: 12.34567 }])
    expect(result.value).toBeNull()
    expect(result.formatted).toEqual({ lat: "-8.7654", lng: "12.3457" })
  })
})
