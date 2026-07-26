import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatisticsCards, type StatisticsResult } from "../StatisticsCards"

/**
 * T212 (US6) — per-result-shape rendering. The core requirement is that a
 * point layer's cards omit area and length while a polygon layer's include
 * them: a zero area on a point layer would read as a measurement rather
 * than as "not applicable".
 */
const POLYGON_SUMMARY: StatisticsResult = {
  featureCount: 3,
  geometryTypes: ["POLYGON"],
  totalAreaSquareMeters: 1234.5,
  averageAreaSquareMeters: 411.5,
  totalLengthMeters: 0,
  averageLengthMeters: 0,
  boundingBox: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  centroid: { type: "Point", coordinates: [0.5, 0.5] },
  convexHull: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  extent: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
}

const POINT_SUMMARY: StatisticsResult = {
  ...POLYGON_SUMMARY,
  geometryTypes: ["POINT"],
}

const LINE_SUMMARY: StatisticsResult = {
  ...POLYGON_SUMMARY,
  geometryTypes: ["LINESTRING"],
  totalLengthMeters: 980.25,
  averageLengthMeters: 326.75,
}

describe("StatisticsCards", () => {
  it("a polygon layer shows area statistics", () => {
    render(<StatisticsCards result={POLYGON_SUMMARY} />)

    expect(screen.getByText(/total area/i)).toBeTruthy()
    expect(screen.getByText(/average area/i)).toBeTruthy()
    // Length is not applicable to polygons.
    expect(screen.queryByText(/total length/i)).toBeNull()
    expect(screen.queryByText(/average length/i)).toBeNull()
  })

  it("a point layer omits both area and length", () => {
    render(<StatisticsCards result={POINT_SUMMARY} />)

    expect(screen.getByText(/feature count/i)).toBeTruthy()
    expect(screen.queryByText(/total area/i)).toBeNull()
    expect(screen.queryByText(/average area/i)).toBeNull()
    expect(screen.queryByText(/total length/i)).toBeNull()
    expect(screen.queryByText(/average length/i)).toBeNull()
  })

  it("a line layer shows length statistics but not area", () => {
    render(<StatisticsCards result={LINE_SUMMARY} />)

    expect(screen.getByText(/total length/i)).toBeTruthy()
    expect(screen.getByText(/average length/i)).toBeTruthy()
    expect(screen.queryByText(/total area/i)).toBeNull()
  })

  it("a mixed-geometry layer shows both area and length", () => {
    render(<StatisticsCards result={{ ...POLYGON_SUMMARY, geometryTypes: ["POLYGON", "LINESTRING"] }} />)

    expect(screen.getByText(/total area/i)).toBeTruthy()
    expect(screen.getByText(/total length/i)).toBeTruthy()
  })

  it("every statistic FR-016 names has a card on a mixed-geometry summary", () => {
    render(<StatisticsCards result={{ ...POLYGON_SUMMARY, geometryTypes: ["POLYGON", "LINESTRING"] }} />)

    for (const label of [
      /feature count/i,
      /total area/i,
      /average area/i,
      /total length/i,
      /average length/i,
      /bounding box/i,
      /centroid/i,
      /convex hull/i,
      /extent/i,
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it("formats numbers and geometry readably rather than dumping JSON", () => {
    render(<StatisticsCards result={POLYGON_SUMMARY} />)

    expect(screen.getByText(/1,234\.5 m²/)).toBeTruthy()
    expect(screen.getByText(/Point: \[0\.5,0\.5\]/)).toBeTruthy()
  })

  it("a single-statistic run without geometryTypes still shows the value it asked for", () => {
    // featureCount/areaCalculation etc. return one field and no type hint;
    // filtering on a missing hint would hide the very statistic requested.
    render(<StatisticsCards result={{ totalAreaSquareMeters: 500 }} />)

    expect(screen.getByText(/total area/i)).toBeTruthy()
    expect(screen.getByText(/500 m²/)).toBeTruthy()
  })

  it("renders densityAnalysis's own payload", () => {
    render(
      <StatisticsCards result={{ featureCount: 10, convexHullAreaSquareMeters: 2000, densityPerSquareMeter: 0.005 }} />,
    )

    expect(screen.getByText(/density \(features\/m²\)/i)).toBeTruthy()
    expect(screen.getByText(/convex hull area/i)).toBeTruthy()
  })

  it("says so plainly when a run produced no statistics", () => {
    render(<StatisticsCards result={{}} />)

    expect(screen.getByText(/no statistics/i)).toBeTruthy()
  })

  it("omits a statistic that is absent rather than rendering NaN", () => {
    render(<StatisticsCards result={{ featureCount: 2, geometryTypes: ["POLYGON"] }} />)

    expect(screen.getByText(/feature count/i)).toBeTruthy()
    expect(screen.queryByText(/total area/i)).toBeNull()
    expect(screen.queryByText(/NaN/)).toBeNull()
  })
})
