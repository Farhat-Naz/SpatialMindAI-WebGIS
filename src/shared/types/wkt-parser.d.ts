/**
 * `wkt-parser` ships no TypeScript declarations. It parses a WKT (or
 * PROJJSON) coordinate-system definition into a plain object accepted by
 * `proj4()` as a projection definition — used to reproject Shapefile `.prj`
 * definitions to WGS84 (Research Decision 19).
 */
declare module "wkt-parser" {
  export interface WktParserResult {
    [key: string]: unknown
  }

  export default function parseWkt(wkt: string): WktParserResult
}
