import type { SourceGeometry } from "@/shared/contracts/importChunk.schema"
import type { Position } from "../types/importExport.types"

/**
 * Unambiguous geometry repair applied during preflight (specs/005-import-export,
 * T007; FR-053).
 *
 * Only repairs whose correct outcome is unambiguous are performed here —
 * closing a ring whose first and last positions differ. Anything requiring a
 * judgement call (a self-intersection, an unclosed ring with fewer than three
 * distinct positions) is left alone and rejected by PostGIS `ST_IsValid` at
 * commit time, which is the authority on topological validity (research.md
 * Decision 6).
 */

export interface RepairResult {
  geometry: SourceGeometry
  repaired: boolean
}

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/**
 * Closes one linear ring if its first and last positions differ. A ring with
 * fewer than three positions is left untouched — closing it would produce a
 * degenerate polygon rather than repair a real one.
 */
function closeRing(ring: Position[]): { ring: Position[]; repaired: boolean } {
  if (ring.length < 3) return { ring, repaired: false }
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (samePosition(first, last)) return { ring, repaired: false }
  return { ring: [...ring, [first[0], first[1]]], repaired: true }
}

function closeRings(rings: Position[][]): { rings: Position[][]; repaired: boolean } {
  let repaired = false
  const closed = rings.map((ring) => {
    const result = closeRing(ring)
    if (result.repaired) repaired = true
    return result.ring
  })
  return { rings: closed, repaired }
}

/**
 * Repairs a geometry where the repair is unambiguous, reporting whether
 * anything changed so the import summary can count it (FR-010, FR-053).
 * Non-polygon geometry is returned untouched.
 */
export function repairGeometry(geometry: SourceGeometry): RepairResult {
  if (geometry.type === "Polygon") {
    const { rings, repaired } = closeRings(geometry.coordinates as Position[][])
    return repaired ? { geometry: { type: "Polygon", coordinates: rings }, repaired } : { geometry, repaired: false }
  }

  if (geometry.type === "MultiPolygon") {
    let repaired = false
    const polygons = (geometry.coordinates as Position[][][]).map((rings) => {
      const result = closeRings(rings)
      if (result.repaired) repaired = true
      return result.rings
    })
    return repaired
      ? { geometry: { type: "MultiPolygon", coordinates: polygons }, repaired }
      : { geometry, repaired: false }
  }

  return { geometry, repaired: false }
}
