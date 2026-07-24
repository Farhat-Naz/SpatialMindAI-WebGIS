import { describe, expect, it } from "vitest"
import { formatArea, formatDistance } from "../formatMeasurement"

describe("formatDistance", () => {
  it("formats sub-kilometer distances in meters", () => {
    expect(formatDistance(250)).toBe("250.0 m")
  })

  it("formats distances of 1km or more in kilometers", () => {
    expect(formatDistance(1500)).toBe("1.50 km")
  })
})

describe("formatArea", () => {
  it("formats sub-hectare areas in square meters", () => {
    expect(formatArea(500)).toBe("500.0 m²")
  })

  it("formats areas of 1 hectare or more in hectares", () => {
    expect(formatArea(25_000)).toBe("2.50 ha")
  })
})
