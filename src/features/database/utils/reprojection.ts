import proj4 from "proj4"
import parseWkt from "wkt-parser"

const SOURCE_DEF_NAME = "SPATIALMIND_SHAPEFILE_SOURCE"

/**
 * Reprojects a single `[x, y]` coordinate from the coordinate system
 * described by `sourceWkt` (a Shapefile `.prj` file's contents) to WGS84
 * (EPSG:4326) longitude/latitude, per Research Decision 19.
 */
export function reprojectCoordinateToWgs84(
  coordinate: [number, number],
  sourceWkt: string,
): [number, number] {
  // proj4's published type definitions only accept a registered definition
  // name (string), not the raw params object wkt-parser returns — register
  // it once under a fixed name, then transform by name.
  proj4.defs(SOURCE_DEF_NAME, parseWkt(sourceWkt) as unknown as proj4.ProjectionDefinition)
  const [lng, lat] = proj4(SOURCE_DEF_NAME, "WGS84", coordinate)
  return [lng, lat]
}

/**
 * Recursively reprojects every `[x, y]` pair in a nested coordinate array
 * (Point/MultiPoint/LineString/MultiLineString/Polygon/MultiPolygon shape)
 * to WGS84, preserving the array's nesting structure.
 */
export function reprojectCoordinatesToWgs84<T>(coordinates: T, sourceWkt: string): T {
  if (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
  ) {
    return reprojectCoordinateToWgs84(coordinates as [number, number], sourceWkt) as unknown as T
  }

  if (Array.isArray(coordinates)) {
    return coordinates.map((entry) => reprojectCoordinatesToWgs84(entry, sourceWkt)) as unknown as T
  }

  return coordinates
}
