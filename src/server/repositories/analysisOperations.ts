import { Prisma } from "@prisma/client"
import { ValidationError } from "@/shared/errors/apiError"

/**
 * PostGIS SQL-fragment builders for every geoprocessing operation (spec
 * 005-spatial-analysis-geoprocessing, extended by 007-spatial-analysis).
 * This file never imports `prismaClient` or opens a database connection —
 * it only constructs `Prisma.Sql` fragments via the `Prisma.sql` tagged
 * template, which `analysisRepository.ts` (the only file in this feature
 * holding a live connection) executes inside its own transaction. Kept
 * separate from the repository purely for the readability of this many
 * operations' worth of SQL, per plan.md's Repository Layer section — not a
 * second repository.
 *
 * Two shapes of builder appear below, matching each operation's natural
 * PostGIS execution shape (research.md Decision 7):
 *  - **Chunk builders** (`build*ChunkSql`) — one output feature per input
 *    feature, safe to run once per keyset-paginated page (T011) so progress
 *    can be reported between chunks (research.md Decision 5).
 *  - **Whole-operation builders** — pairwise overlays, dissolve/merge/split,
 *    and every aggregate statistic. These execute as a single PostGIS
 *    statement rather than being manually chunked in application code:
 *    Postgres itself streams and aggregates server-side, and (per plan.md's
 *    Risks table) a grouping/dissolve operation MUST aggregate across the
 *    entire input before its final `ST_Union` — partially dissolving
 *    per-chunk and merging the partial results would be incorrect, not
 *    just slower.
 */

/** Every builder receives the already ownership-verified input layer ids it needs. */
export interface OperationContext {
  inputLayerIds: string[]
}

export type DistanceUnit = "meters" | "kilometers" | "feet" | "miles"
export type ShortDistanceUnit = "meters" | "kilometers"
export type AreaUnit = "squareMeters" | "squareKilometers" | "squareFeet" | "squareMiles"

/** Converts a user-facing distance + unit into meters, the unit every PostGIS `geography` function in this file expects. */
export function toMeters(distance: number, unit: DistanceUnit): number {
  switch (unit) {
    case "meters":
      return distance
    case "kilometers":
      return distance * 1000
    case "feet":
      return distance * 0.3048
    case "miles":
      return distance * 1609.344
  }
}

/** Converts a user-facing area + unit into square meters, the unit every PostGIS `ST_Area(geography)` call in this file returns (007, Phase 13). */
export function toSquareMeters(area: number, unit: AreaUnit): number {
  switch (unit) {
    case "squareMeters":
      return area
    case "squareKilometers":
      return area * 1_000_000
    case "squareFeet":
      return area * 0.09290304
    case "squareMiles":
      return area * 2_589_988.110336
  }
}

/**
 * One keyset-paginated page of a layer's feature ids, ordered by `id`
 * ascending (research.md Decision 5) — every chunked operation builder
 * below starts its chunk with this fragment, bounding per-chunk
 * memory/query cost regardless of the layer's total size (spec Performance,
 * 100,000-feature target). Pass `afterId: null` for the first page; the
 * caller re-invokes with the previous page's last returned id until a page
 * comes back shorter than `pageSize`.
 */
export function buildChunkPageSql(layerId: string, afterId: string | null, pageSize: number): Prisma.Sql {
  const cursor = afterId ? Prisma.sql`AND id > ${afterId}` : Prisma.empty
  return Prisma.sql`
    SELECT id FROM "Feature"
    WHERE "layerId" = ${layerId} ${cursor}
    ORDER BY id ASC
    LIMIT ${pageSize}
  `
}

// ---------------------------------------------------------------------------
// Buffer Analysis (US1)
// ---------------------------------------------------------------------------

/** One chunk of a non-dissolved Buffer — one output buffer polygon per input feature in this chunk. */
export function buildBufferChunkSql(newLayerId: string, chunkFeatureIds: string[], distanceMeters: number): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_Buffer(geometry::geography, ${distanceMeters})::geometry, NOW(), NOW()
    FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
  `
}

/** Dissolved Buffer (FR-003) — every input feature's buffer merged into one combined result, computed as a single statement. Used by the fast (small-input) path; the chunked accumulator variants below back the background path so plan.md's Performance tier can observe progress ticking for a large dissolved Buffer. */
export function buildDissolvedBufferSql(newLayerId: string, inputLayerId: string, distanceMeters: number): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_Union(ST_Buffer(geometry::geography, ${distanceMeters})::geometry), NOW(), NOW()
    FROM "Feature"
    WHERE "layerId" = ${inputLayerId}
  `
}

/**
 * Creates the one accumulator `Feature` row a chunked dissolve/union
 * operation progressively merges into — starts as a valid, empty geometry
 * (`ST_Union` treats an empty operand as a no-op) so every chunk's own SQL
 * can use the identical "union this chunk's contribution into the
 * accumulator" statement, with no special-cased first chunk.
 */
export function buildAccumulatorInitSql(accumulatorFeatureId: string, newLayerId: string): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    VALUES (${accumulatorFeatureId}, ${newLayerId}, ST_GeomFromText('GEOMETRYCOLLECTION EMPTY', 4326), NOW(), NOW())
  `
}

/** One chunk of a *chunked* dissolved Buffer (background path) — merges this chunk's buffered union into the accumulator feature (see `buildAccumulatorInitSql`). */
export function buildBufferAccumulateChunkSql(
  accumulatorFeatureId: string,
  chunkFeatureIds: string[],
  distanceMeters: number,
): Prisma.Sql {
  return Prisma.sql`
    UPDATE "Feature" SET geometry = ST_Union(geometry, (
      SELECT ST_Union(ST_Buffer(geometry::geography, ${distanceMeters})::geometry)
      FROM "Feature" WHERE id IN (${Prisma.join(chunkFeatureIds)})
    )), "updatedAt" = NOW()
    WHERE id = ${accumulatorFeatureId}
  `
}

/** One chunk of a *chunked* whole-layer Union (background path, FR-010) — merges this chunk's own (already-unioned) geometry into the accumulator feature. Reused for both input layers' chunks in turn. */
export function buildLayerChunkUnionIntoAccumulatorSql(accumulatorFeatureId: string, chunkFeatureIds: string[]): Prisma.Sql {
  return Prisma.sql`
    UPDATE "Feature" SET geometry = ST_Union(geometry, (
      SELECT ST_Union(geometry) FROM "Feature" WHERE id IN (${Prisma.join(chunkFeatureIds)})
    )), "updatedAt" = NOW()
    WHERE id = ${accumulatorFeatureId}
  `
}

// ---------------------------------------------------------------------------
// Overlay Analysis (US4, FR-010) — pairwise, whole-layer-dissolved results
// ---------------------------------------------------------------------------

function buildWholeLayerBinaryOverlaySql(
  op: "ST_Union" | "ST_Intersection" | "ST_Difference" | "ST_SymDifference",
  newLayerId: string,
  layerAId: string,
  layerBId: string,
): Prisma.Sql {
  const fn = Prisma.raw(op)
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId},
      ${fn}(
        (SELECT ST_Union(geometry) FROM "Feature" WHERE "layerId" = ${layerAId}),
        (SELECT ST_Union(geometry) FROM "Feature" WHERE "layerId" = ${layerBId})
      ), NOW(), NOW()
  `
}

/** Union of two layers' combined footprint (FR-010) — one merged result geometry, not a per-feature attributed overlay topology (documented scope decision). */
export function buildUnionSql(newLayerId: string, layerAId: string, layerBId: string): Prisma.Sql {
  return buildWholeLayerBinaryOverlaySql("ST_Union", newLayerId, layerAId, layerBId)
}

/** Intersection of two layers' combined footprints (FR-010). */
export function buildIntersectSql(newLayerId: string, layerAId: string, layerBId: string): Prisma.Sql {
  return buildWholeLayerBinaryOverlaySql("ST_Intersection", newLayerId, layerAId, layerBId)
}

/** Difference (A minus B) of two layers' combined footprints (FR-010). `erase` (below) is the same PostGIS function, applied per-feature instead of whole-layer. */
export function buildDifferenceSql(newLayerId: string, layerAId: string, layerBId: string): Prisma.Sql {
  return buildWholeLayerBinaryOverlaySql("ST_Difference", newLayerId, layerAId, layerBId)
}

/** Symmetrical Difference of two layers' combined footprints (FR-010). */
export function buildSymmetricalDifferenceSql(newLayerId: string, layerAId: string, layerBId: string): Prisma.Sql {
  return buildWholeLayerBinaryOverlaySql("ST_SymDifference", newLayerId, layerAId, layerBId)
}

/** One chunk of Clip — each of layer A's own features (identity preserved), clipped to layer B's combined boundary (FR-010). Features entirely outside B are omitted. */
export function buildClipChunkSql(newLayerId: string, chunkFeatureIds: string[], clipBoundaryLayerId: string): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_Intersection(a.geometry, boundary.geom), NOW(), NOW()
    FROM "Feature" a
    CROSS JOIN LATERAL (
      SELECT ST_Union(geometry) AS geom FROM "Feature" WHERE "layerId" = ${clipBoundaryLayerId}
    ) boundary
    WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
      AND ST_Intersects(a.geometry, boundary.geom)
  `
}

/** One chunk of Erase — each of layer A's own features (identity preserved), with layer B's combined footprint removed (FR-010) — the per-feature complement of Clip. */
export function buildEraseChunkSql(newLayerId: string, chunkFeatureIds: string[], eraseLayerId: string): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_Difference(a.geometry, boundary.geom), NOW(), NOW()
    FROM "Feature" a
    CROSS JOIN LATERAL (
      SELECT ST_Union(geometry) AS geom FROM "Feature" WHERE "layerId" = ${eraseLayerId}
    ) boundary
    WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
  `
}

/**
 * Identity (FR-010) — preserves all of layer A's geometry unchanged.
 * Simplified scope decision: this implementation does not append layer B's
 * attributes for overlapping areas (a full attributed-overlay topology is a
 * documented follow-up); output geometry is identical to Identity's formal
 * definition (nothing from A is ever removed), which is the part every
 * caller can rely on today.
 */
export function buildIdentitySql(newLayerId: string, sourceLayerId: string): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, geometry, NOW(), NOW()
    FROM "Feature"
    WHERE "layerId" = ${sourceLayerId}
  `
}

// ---------------------------------------------------------------------------
// Geometry Processing (US5, FR-011/FR-012/FR-014/FR-015)
// ---------------------------------------------------------------------------

/** One chunk of Simplify (FR-011) — `ST_SimplifyPreserveTopology` is topology-safe by default, unlike bare `ST_Simplify` (research.md Decision 7). */
export function buildSimplifyChunkSql(newLayerId: string, chunkFeatureIds: string[], tolerance: number): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_SimplifyPreserveTopology(geometry, ${tolerance}), NOW(), NOW()
    FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
  `
}

/** One chunk of Smooth (FR-011), PostGIS >= 3.2's `ST_ChaikinSmoothing`. */
export function buildSmoothChunkSql(newLayerId: string, chunkFeatureIds: string[]): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_ChaikinSmoothing(geometry), NOW(), NOW()
    FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
  `
}

export type MultipartConversionDirection = "toSinglepart" | "toMultipart"

/** One chunk of a multipart<->singlepart conversion (FR-014) — `toSinglepart` may expand row count (one output row per part via `ST_Dump`); `toMultipart` is a 1:1 `ST_Multi` wrap. */
export function buildMultipartConversionChunkSql(
  newLayerId: string,
  chunkFeatureIds: string[],
  direction: MultipartConversionDirection,
): Prisma.Sql {
  if (direction === "toSinglepart") {
    return Prisma.sql`
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT gen_random_uuid()::text, ${newLayerId}, (ST_Dump(geometry)).geom, NOW(), NOW()
      FROM "Feature"
      WHERE id IN (${Prisma.join(chunkFeatureIds)})
    `
  }
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_Multi(geometry), NOW(), NOW()
    FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
  `
}

/**
 * One chunk of Repair Geometry (FR-015) — an already-valid feature is
 * copied unchanged; an invalid one is passed through `ST_MakeValid`. A
 * feature `ST_MakeValid` still cannot fix is excluded here and must be
 * reported via `buildUnrepairableFeatureIdsSql` below, so the caller can
 * "clearly report" it per FR-015 rather than silently dropping it.
 */
export function buildRepairGeometryChunkSql(newLayerId: string, chunkFeatureIds: string[]): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId},
      CASE WHEN ST_IsValid(geometry) THEN geometry ELSE ST_MakeValid(geometry) END,
      NOW(), NOW()
    FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
      AND ST_IsValid(CASE WHEN ST_IsValid(geometry) THEN geometry ELSE ST_MakeValid(geometry) END)
  `
}

/** Ids in this chunk that Repair Geometry could not fix (companion to `buildRepairGeometryChunkSql`, FR-015). */
export function buildUnrepairableFeatureIdsSql(chunkFeatureIds: string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT id FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
      AND NOT ST_IsValid(CASE WHEN ST_IsValid(geometry) THEN geometry ELSE ST_MakeValid(geometry) END)
  `
}

/** Split (FR-012) — cuts every feature of the target layer using the combined "blade" geometry of the splitter layer (`ST_Split`), one output row per resulting part. */
export function buildSplitSql(newLayerId: string, targetLayerId: string, splitterLayerId: string): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, (ST_Dump(ST_Split(a.geometry, splitter.blade))).geom, NOW(), NOW()
    FROM "Feature" a
    CROSS JOIN LATERAL (
      SELECT ST_Union(geometry) AS blade FROM "Feature" WHERE "layerId" = ${splitterLayerId}
    ) splitter
    WHERE a."layerId" = ${targetLayerId}
  `
}

/** Merge (FR-012) — concatenates every feature from every input layer into one output layer unchanged (does not union/dissolve geometry — that is Dissolve's job). */
export function buildMergeSql(newLayerId: string, inputLayerIds: string[]): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, geometry, NOW(), NOW()
    FROM "Feature"
    WHERE "layerId" IN (${Prisma.join(inputLayerIds)})
  `
}

/**
 * Dissolve by attribute (FR-013) — one output feature per unique
 * `attributeKey` value, unioning every input feature sharing that value.
 * Always a single whole-layer statement (never per-chunk — see file doc).
 */
export function buildDissolveSql(newLayerId: string, inputLayerId: string, attributeKey: string): Prisma.Sql {
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, ST_Union(f.geometry), NOW(), NOW()
    FROM "Feature" f
    JOIN "FeatureAttribute" fa ON fa."featureId" = f.id AND fa.key = ${attributeKey}
    WHERE f."layerId" = ${inputLayerId}
    GROUP BY fa.value
  `
}

// ---------------------------------------------------------------------------
// Spatial Query & Selection (US2, FR-004/FR-005/FR-006)
// ---------------------------------------------------------------------------

export type SpatialRelationship = "intersects" | "within" | "contains" | "touches" | "crosses" | "overlaps"

const SPATIAL_PREDICATE_FUNCTION: Record<SpatialRelationship, string> = {
  intersects: "ST_Intersects",
  within: "ST_Within",
  contains: "ST_Contains",
  touches: "ST_Touches",
  crosses: "ST_Crosses",
  overlaps: "ST_Overlaps",
}

/**
 * One chunk of a spatial-predicate selection (FR-004) — copies each of
 * `referenceLayerId`-relative-matching features from this chunk of the
 * source layer into the result layer, preserving the source feature's own
 * geometry/identity. Backs `spatialJoin`/`pointInPolygon`/`selectByLocation`
 * (all reuse this with the appropriate relationship) as well as the
 * dedicated `touches`/`crosses`/`overlaps` operationTypes. `relationship`
 * is always drawn from this file's own fixed `SPATIAL_PREDICATE_FUNCTION`
 * lookup, never interpolated from user input directly (Constitution
 * Principle VI).
 */
export function buildSpatialPredicateChunkSql(
  newLayerId: string,
  chunkFeatureIds: string[],
  referenceLayerId: string,
  relationship: SpatialRelationship,
): Prisma.Sql {
  const predicateFn = Prisma.raw(SPATIAL_PREDICATE_FUNCTION[relationship])
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, a.geometry, NOW(), NOW()
    FROM "Feature" a
    WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
      AND EXISTS (
        SELECT 1 FROM "Feature" b
        WHERE b."layerId" = ${referenceLayerId}
          AND ${predicateFn}(a.geometry, b.geometry)
      )
  `
}

export type AttributeFilterOperator = "eq" | "neq" | "contains" | "gt" | "lt" | "gte" | "lte"

export interface AttributeFilter {
  key: string
  operator: AttributeFilterOperator
  value: string
}

function buildAttributeComparisonSql(operator: AttributeFilterOperator, value: string): Prisma.Sql {
  switch (operator) {
    case "eq":
      return Prisma.sql`fa.value = ${value}`
    case "neq":
      return Prisma.sql`fa.value != ${value}`
    case "contains":
      return Prisma.sql`fa.value ILIKE ${`%${value}%`}`
    case "gt":
      return Prisma.sql`fa.value::numeric > ${value}::numeric`
    case "lt":
      return Prisma.sql`fa.value::numeric < ${value}::numeric`
    case "gte":
      return Prisma.sql`fa.value::numeric >= ${value}::numeric`
    case "lte":
      return Prisma.sql`fa.value::numeric <= ${value}::numeric`
  }
}

/** One chunk of Select by Attribute (FR-006) — `filter` is always passed as parameterized values, never string-concatenated into SQL text (Constitution Principle VI). */
export function buildSelectByAttributeChunkSql(
  newLayerId: string,
  chunkFeatureIds: string[],
  filter: AttributeFilter,
): Prisma.Sql {
  const comparison = buildAttributeComparisonSql(filter.operator, filter.value)
  return Prisma.sql`
    INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, ${newLayerId}, a.geometry, NOW(), NOW()
    FROM "Feature" a
    JOIN "FeatureAttribute" fa ON fa."featureId" = a.id AND fa.key = ${filter.key}
    WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
      AND ${comparison}
  `
}

/** Near Analysis (FR-005) — for every source feature, its single nearest reference feature and the distance to it (`resultData`, not a new layer), using the `<->` KNN operator against `Feature.geometry`'s GiST index. */
export function buildNearAnalysisSql(
  sourceLayerId: string,
  referenceLayerId: string,
  maxDistanceMeters: number | null,
): Prisma.Sql {
  const distanceFilter =
    maxDistanceMeters != null
      ? Prisma.sql`AND ST_DWithin(a.geometry::geography, nearest.geometry::geography, ${maxDistanceMeters})`
      : Prisma.empty
  return Prisma.sql`
    SELECT jsonb_agg(jsonb_build_object(
      'sourceFeatureId', a.id,
      'nearestFeatureId', nearest.id,
      'distanceMeters', ST_Distance(a.geometry::geography, nearest.geometry::geography)
    )) AS result
    FROM "Feature" a
    CROSS JOIN LATERAL (
      SELECT b.id, b.geometry
      FROM "Feature" b
      WHERE b."layerId" = ${referenceLayerId}
      ORDER BY a.geometry <-> b.geometry
      LIMIT 1
    ) nearest
    WHERE a."layerId" = ${sourceLayerId}
    ${distanceFilter}
  `
}

/** Distance Matrix (FR-005) — every source/target feature pair's distance (`resultData`). O(N*M) rows — intended for the moderate-size selections spec.md's Distance Matrix scenario describes, not full 100k-feature layers. */
export function buildDistanceMatrixSql(layerAId: string, layerBId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT jsonb_agg(jsonb_build_object(
      'sourceFeatureId', a.id,
      'targetFeatureId', b.id,
      'distanceMeters', ST_Distance(a.geometry::geography, b.geometry::geography)
    )) AS result
    FROM "Feature" a
    CROSS JOIN "Feature" b
    WHERE a."layerId" = ${layerAId} AND b."layerId" = ${layerBId}
  `
}

// ---------------------------------------------------------------------------
// Spatial Statistics (US6, FR-016) — whole-layer/selection aggregates, resultData only
// ---------------------------------------------------------------------------

export type StatisticType =
  | "featureCount"
  | "totalLength"
  | "averageLength"
  | "averageArea"
  | "extent"
  | "areaCalculation"
  | "lengthCalculation"
  | "centroid"
  | "convexHull"
  | "boundingBox"
  | "densityAnalysis"

/** Every FR-016 statistic (US6) — always resultData, never a new Layer (research.md Decision 1: "AnalysisStatistics" is not a table). */
export function buildStatisticsSql(layerId: string, statType: StatisticType): Prisma.Sql {
  switch (statType) {
    case "featureCount":
      return Prisma.sql`SELECT jsonb_build_object('featureCount', COUNT(*)) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "totalLength":
    case "lengthCalculation":
      return Prisma.sql`SELECT jsonb_build_object('totalLengthMeters', COALESCE(SUM(ST_Length(geometry::geography)), 0)) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "averageLength":
      return Prisma.sql`SELECT jsonb_build_object('averageLengthMeters', COALESCE(AVG(ST_Length(geometry::geography)), 0)) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "averageArea":
      return Prisma.sql`SELECT jsonb_build_object('averageAreaSquareMeters', COALESCE(AVG(ST_Area(geometry::geography)), 0)) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "areaCalculation":
      return Prisma.sql`SELECT jsonb_build_object('totalAreaSquareMeters', COALESCE(SUM(ST_Area(geometry::geography)), 0)) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "centroid":
      return Prisma.sql`SELECT jsonb_build_object('centroid', ST_AsGeoJSON(ST_Centroid(ST_Collect(geometry)))::jsonb) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "convexHull":
      return Prisma.sql`SELECT jsonb_build_object('convexHull', ST_AsGeoJSON(ST_ConvexHull(ST_Collect(geometry)))::jsonb) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "boundingBox":
      return Prisma.sql`SELECT jsonb_build_object('boundingBox', ST_AsGeoJSON(ST_Envelope(ST_Collect(geometry)))::jsonb) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "extent":
      return Prisma.sql`SELECT jsonb_build_object('extent', ST_AsGeoJSON(ST_SetSRID(ST_Extent(geometry)::geometry, 4326))::jsonb) AS result FROM "Feature" WHERE "layerId" = ${layerId}`
    case "densityAnalysis":
      // Feature count per square meter of the layer's convex hull — one
      // density value, not a grid-cell density surface. A fuller grid-based
      // implementation is a documented follow-up (matches plan.md's own
      // precedent for scoping down a genuinely larger sub-feature).
      return Prisma.sql`
        SELECT jsonb_build_object(
          'featureCount', COUNT(*),
          'convexHullAreaSquareMeters', ST_Area(ST_ConvexHull(ST_Collect(geometry))::geography),
          'densityPerSquareMeter', CASE WHEN ST_Area(ST_ConvexHull(ST_Collect(geometry))::geography) > 0
            THEN COUNT(*) / ST_Area(ST_ConvexHull(ST_Collect(geometry))::geography)
            ELSE 0 END
        ) AS result
        FROM "Feature" WHERE "layerId" = ${layerId}
      `
  }
}

// ---------------------------------------------------------------------------
// Coordinate Conversion / CRS Transformation (005-originated, unchanged SRID policy)
// ---------------------------------------------------------------------------

/** Parses an `"EPSG:<code>"` string into its numeric SRID — the only CRS identifier format this feature accepts (research.md Decision 13). */
function parseEpsgCode(crs: string): number {
  const match = /^EPSG:(\d+)$/i.exec(crs.trim())
  if (!match) {
    throw new ValidationError(`Unrecognized CRS "${crs}" — expected the form "EPSG:<code>".`)
  }
  return Number(match[1])
}

/** Coordinate Conversion (005) — reprojects raw `[x, y]` pairs from `sourceCrs` into the platform's fixed WGS84 default, for preview only (`resultData`, no layer involved). */
export function buildCoordinateConversionSql(coordinates: [number, number][], sourceCrs: string): Prisma.Sql {
  const srid = parseEpsgCode(sourceCrs)
  const valueRows = Prisma.join(coordinates.map(([x, y]) => Prisma.sql`(${x}::float8, ${y}::float8)`))
  return Prisma.sql`
    SELECT jsonb_agg(jsonb_build_object('x', ST_X(transformed.geom), 'y', ST_Y(transformed.geom))) AS result
    FROM (VALUES ${valueRows}) AS input(x, y)
    CROSS JOIN LATERAL (
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint(input.x, input.y), ${srid}), 4326) AS geom
    ) transformed
  `
}

/** CRS Transformation (005) — reprojects a whole layer's features to `targetCrs` for preview only (`resultData`, never persisted as a new layer — matches 005's original design). */
export function buildCrsTransformationPreviewSql(layerId: string, targetCrs: string): Prisma.Sql {
  const srid = parseEpsgCode(targetCrs)
  return Prisma.sql`
    SELECT jsonb_agg(jsonb_build_object(
      'featureId', id,
      'geometry', ST_AsGeoJSON(ST_Transform(geometry, ${srid}))::jsonb
    )) AS result
    FROM "Feature"
    WHERE "layerId" = ${layerId}
  `
}
