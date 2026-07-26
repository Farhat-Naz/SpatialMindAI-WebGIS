"use client"

import { useMemo } from "react"
import { Polygon } from "react-leaflet"
// The umbrella package, matching spatialMath.ts — the individual @turf/*
// submodules are transitive dependencies here, not declared ones.
import * as turf from "@turf/turf"
import { useFeatures } from "@/features/database/hooks/useFeatures"
import { useAnalysisStore } from "../store/analysisStore"

/** How many cells across the layer's widest axis the density grid uses. */
const GRID_RESOLUTION = 24

/**
 * Density ramp, cool to hot. Five bands rather than a continuous gradient
 * because these are discrete polygons: a reader can match a colour back to
 * a band, which a smooth ramp on chunky cells cannot support honestly.
 */
const DENSITY_COLORS = ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"]

interface DensityCell {
  ring: [number, number][]
  count: number
}

/**
 * Point-density Heatmap (US7, FR-018) — the one raster-adjacent capability
 * this feature actually implements, rendered entirely client-side with
 * Turf and no persisted raster data (research.md Decision 9). It creates
 * no `AnalysisRun`.
 *
 * Rendered as graduated polygons over a square grid rather than a blurred
 * canvas: the cells are real, inspectable geometry whose counts a user can
 * reason about, and it needs no new rendering dependency. Must be mounted
 * inside `<MapContainer>` — it renders react-leaflet children.
 */
export function HeatmapLayer() {
  const heatmapLayerId = useAnalysisStore((state) => state.heatmapLayerId)
  const { data } = useFeatures(heatmapLayerId ?? "")

  const cells = useMemo<DensityCell[]>(() => {
    if (!heatmapLayerId || !data?.features?.length) return []

    // Only point geometry contributes: "point density" over polygons would
    // silently measure their centroids, which is a different statistic.
    const points = data.features
      .map((feature) => feature.geometry as { type?: string; coordinates?: [number, number] })
      .filter((geometry) => geometry?.type === "Point" && Array.isArray(geometry.coordinates))
      .map((geometry) => turf.point(geometry.coordinates as [number, number]))

    if (points.length === 0) return []

    const collection = { type: "FeatureCollection" as const, features: points }
    const [minX, minY, maxX, maxY] = turf.bbox(collection)

    // A single point (or several stacked exactly) has a zero-width extent,
    // which would make an infinitely fine grid — fall back to a small pad.
    const width = Math.max(maxX - minX, 0.0001)
    const height = Math.max(maxY - minY, 0.0001)
    const cellSide = Math.max(width, height) / GRID_RESOLUTION

    const grid = turf.squareGrid([minX - cellSide, minY - cellSide, maxX + cellSide, maxY + cellSide], cellSide, {
      units: "degrees",
    })

    const counted: DensityCell[] = []
    for (const cell of grid.features) {
      const ring = cell.geometry.coordinates[0] as [number, number][]
      const shape = turf.polygon([ring])
      let count = 0
      for (const candidate of points) {
        if (turf.booleanPointInPolygon(candidate, shape)) count += 1
      }
      // Empty cells are dropped rather than drawn transparent: thousands of
      // invisible polygons still cost layout and hit-testing.
      if (count > 0) counted.push({ ring, count })
    }
    return counted
  }, [heatmapLayerId, data])

  if (cells.length === 0) return null

  const maxCount = Math.max(...cells.map((cell) => cell.count))

  return (
    <>
      {cells.map((cell, index) => {
        // Bands are relative to the busiest cell, so a sparse layer still
        // shows contrast instead of rendering entirely in the lowest band.
        const band = Math.min(
          DENSITY_COLORS.length - 1,
          Math.floor((cell.count / maxCount) * DENSITY_COLORS.length),
        )
        return (
          <Polygon
            key={index}
            positions={cell.ring.map(([lng, lat]) => [lat, lng] as [number, number])}
            pathOptions={{
              color: DENSITY_COLORS[band],
              fillColor: DENSITY_COLORS[band],
              fillOpacity: 0.55,
              weight: 0,
            }}
          />
        )
      })}
    </>
  )
}
