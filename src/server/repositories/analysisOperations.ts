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

/**
 * One chunk of Clip — each of layer A's own features (identity *and
 * attributes* preserved, FR-010/T171), clipped to layer B's combined
 * boundary. Features entirely outside B are omitted. Uses the same
 * old-id→new-id CTE pattern as `buildSpatialPredicateChunkSql` so Clip's
 * result carries the input layer's own attribute schema, not B's.
 */
export function buildClipChunkSql(newLayerId: string, chunkFeatureIds: string[], clipBoundaryLayerId: string): Prisma.Sql {
  return Prisma.sql`
    WITH boundary AS (
      SELECT ST_Union(geometry) AS geom FROM "Feature" WHERE "layerId" = ${clipBoundaryLayerId}
    ), matched AS (
      SELECT a.id AS old_id, ST_Intersection(a.geometry, boundary.geom) AS old_geometry, gen_random_uuid()::text AS new_id
      FROM "Feature" a, boundary
      WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
        AND ST_Intersects(a.geometry, boundary.geom)
    ), ins_feature AS (
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT new_id, ${newLayerId}, old_geometry, NOW(), NOW() FROM matched
    )
    INSERT INTO "FeatureAttribute" (id, "featureId", key, value)
    SELECT gen_random_uuid()::text, matched.new_id, fa.key, fa.value
    FROM matched JOIN "FeatureAttribute" fa ON fa."featureId" = matched.old_id
  `
}

/**
 * One chunk of Erase — each of layer A's own features (identity *and*
 * attributes preserved), with layer B's combined footprint removed
 * (FR-010) — the per-feature complement of Clip.
 *
 * Two degenerate cases are handled explicitly rather than left to the
 * database: an *empty* erase layer makes `ST_Union` return NULL, and
 * `ST_Difference(geom, NULL)` is NULL — which would violate `Feature.
 * geometry`'s NOT NULL constraint, so erasing nothing correctly keeps the
 * feature unchanged. A feature lying entirely *within* the erase footprint
 * differences down to an empty geometry, which is dropped rather than
 * stored as a zero-area row (Erase's defining behaviour).
 */
export function buildEraseChunkSql(newLayerId: string, chunkFeatureIds: string[], eraseLayerId: string): Prisma.Sql {
  return Prisma.sql`
    WITH boundary AS (
      SELECT ST_Union(geometry) AS geom FROM "Feature" WHERE "layerId" = ${eraseLayerId}
    ), computed AS (
      SELECT a.id AS old_id,
             CASE WHEN boundary.geom IS NULL THEN a.geometry ELSE ST_Difference(a.geometry, boundary.geom) END AS old_geometry,
             gen_random_uuid()::text AS new_id
      FROM "Feature" a, boundary
      WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
    ), matched AS (
      SELECT * FROM computed WHERE old_geometry IS NOT NULL AND NOT ST_IsEmpty(old_geometry)
    ), ins_feature AS (
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT new_id, ${newLayerId}, old_geometry, NOW(), NOW() FROM matched
    )
    INSERT INTO "FeatureAttribute" (id, "featureId", key, value)
    SELECT gen_random_uuid()::text, matched.new_id, fa.key, fa.value
    FROM matched JOIN "FeatureAttribute" fa ON fa."featureId" = matched.old_id
  `
}

/**
 * Identity (FR-010) — preserves all of layer A's geometry *and attributes*
 * unchanged (T176). Simplified scope decision: this implementation does
 * not append layer B's attributes for overlapping areas (a full
 * attributed-overlay topology carrying both inputs' schemas is a
 * documented follow-up); every one of A's own attributes survives, and
 * nothing from A is ever removed, matching Identity's formal definition.
 */
export function buildIdentitySql(newLayerId: string, sourceLayerId: string): Prisma.Sql {
  return Prisma.sql`
    WITH matched AS (
      SELECT id AS old_id, geometry AS old_geometry, gen_random_uuid()::text AS new_id
      FROM "Feature"
      WHERE "layerId" = ${sourceLayerId}
    ), ins_feature AS (
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT new_id, ${newLayerId}, old_geometry, NOW(), NOW() FROM matched
    )
    INSERT INTO "FeatureAttribute" (id, "featureId", key, value)
    SELECT gen_random_uuid()::text, matched.new_id, fa.key, fa.value
    FROM matched JOIN "FeatureAttribute" fa ON fa."featureId" = matched.old_id
  `
}

// ---------------------------------------------------------------------------
// Geometry Processing (US5, FR-011/FR-012/FR-014/FR-015)
// ---------------------------------------------------------------------------

/**
 * The shared shape of every per-feature Geometry Processing transform
 * (US5) — `sourceRows` selects `old_id`/`new_geometry` pairs, and this
 * wraps them so that:
 *
 * 1. **Attributes survive.** A geometry-processing result represents the
 *    same real-world feature as its input (unlike Buffer/Overlay's
 *    genuinely-derived geometry), so a geometry-only copy would strip
 *    every attribute — the same defect fixed for Clip/Erase/Identity.
 *    FR-014 requires this explicitly for multipart conversion, where each
 *    dumped part must carry the parent's attributes.
 * 2. **Invalid output is never persisted** (Constitution Principle IV /
 *    T194). NULL, empty, and `ST_IsValid`-failing results are dropped
 *    rather than written; callers pair this with a companion
 *    `…FeatureIdsSql` query so a drop is reported, never silent.
 *
 * Assigning `new_id` *after* `sourceRows` matters: a row-expanding
 * transform (`ST_Dump` for Split / Multipart→Singlepart) produces several
 * rows per input feature, and each part must get its own id while still
 * pointing back at one `old_id` for the attribute copy.
 */
function buildAttributePreservingTransformSql(newLayerId: string, sourceRows: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    WITH computed AS (${sourceRows}
    ), matched AS (
      SELECT old_id, new_geometry, gen_random_uuid()::text AS new_id
      FROM computed
      WHERE new_geometry IS NOT NULL AND NOT ST_IsEmpty(new_geometry) AND ST_IsValid(new_geometry)
    ), ins_feature AS (
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT new_id, ${newLayerId}, new_geometry, NOW(), NOW() FROM matched
    )
    INSERT INTO "FeatureAttribute" (id, "featureId", key, value)
    SELECT gen_random_uuid()::text, matched.new_id, fa.key, fa.value
    FROM matched JOIN "FeatureAttribute" fa ON fa."featureId" = matched.old_id
  `
}

/** One chunk of Simplify (FR-011) — `ST_SimplifyPreserveTopology` is topology-safe by default, unlike bare `ST_Simplify` (research.md Decision 7). */
export function buildSimplifyChunkSql(newLayerId: string, chunkFeatureIds: string[], tolerance: number): Prisma.Sql {
  return buildAttributePreservingTransformSql(
    newLayerId,
    Prisma.sql`
      SELECT id AS old_id, ST_SimplifyPreserveTopology(geometry, ${tolerance}) AS new_geometry
      FROM "Feature"
      WHERE id IN (${Prisma.join(chunkFeatureIds)})`,
  )
}

/** One chunk of Smooth (FR-011), PostGIS >= 3.2's `ST_ChaikinSmoothing`. */
export function buildSmoothChunkSql(newLayerId: string, chunkFeatureIds: string[]): Prisma.Sql {
  return buildAttributePreservingTransformSql(
    newLayerId,
    Prisma.sql`
      SELECT id AS old_id, ST_ChaikinSmoothing(geometry) AS new_geometry
      FROM "Feature"
      WHERE id IN (${Prisma.join(chunkFeatureIds)})`,
  )
}

export type MultipartConversionDirection = "toSinglepart" | "toMultipart"

/** One chunk of a multipart<->singlepart conversion (FR-014) — `toSinglepart` may expand row count (one output row per part via `ST_Dump`, each carrying the parent's attributes); `toMultipart` is a 1:1 `ST_Multi` wrap. */
export function buildMultipartConversionChunkSql(
  newLayerId: string,
  chunkFeatureIds: string[],
  direction: MultipartConversionDirection,
): Prisma.Sql {
  const expression =
    direction === "toSinglepart" ? Prisma.sql`(ST_Dump(geometry)).geom` : Prisma.sql`ST_Multi(geometry)`
  return buildAttributePreservingTransformSql(
    newLayerId,
    Prisma.sql`
      SELECT id AS old_id, ${expression} AS new_geometry
      FROM "Feature"
      WHERE id IN (${Prisma.join(chunkFeatureIds)})`,
  )
}

/** The repair expression itself — an already-valid feature passes through untouched, an invalid one goes through `ST_MakeValid`. Shared so the insert and its "could not repair" companion can never disagree about what repair means. */
const REPAIRED_GEOMETRY = Prisma.sql`CASE WHEN ST_IsValid(geometry) THEN geometry ELSE ST_MakeValid(geometry) END`

/**
 * One chunk of Repair Geometry (FR-015) — an already-valid feature is
 * copied unchanged; an invalid one is passed through `ST_MakeValid`. A
 * feature `ST_MakeValid` still cannot fix is excluded by the shared
 * validity guard and must be reported via `buildUnrepairableFeatureIdsSql`
 * below, so the caller can "clearly report" it per FR-015 rather than
 * silently dropping it.
 */
export function buildRepairGeometryChunkSql(newLayerId: string, chunkFeatureIds: string[]): Prisma.Sql {
  return buildAttributePreservingTransformSql(
    newLayerId,
    Prisma.sql`
      SELECT id AS old_id, ${REPAIRED_GEOMETRY} AS new_geometry
      FROM "Feature"
      WHERE id IN (${Prisma.join(chunkFeatureIds)})`,
  )
}

/** Ids in this chunk that Repair Geometry could not fix (companion to `buildRepairGeometryChunkSql`, FR-015). */
export function buildUnrepairableFeatureIdsSql(chunkFeatureIds: string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT id FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
      AND NOT ST_IsValid(${REPAIRED_GEOMETRY})
  `
}

/**
 * Ids in this chunk whose geometry a no-parameter/tolerance transform
 * leaves unchanged (T192) — Simplify below its tolerance, Smooth on an
 * already-smooth shape, Repair on already-valid input. Reported as
 * "no change needed" rather than treated as a failure (spec.md Edge
 * Cases): the run succeeds, it simply had nothing to do.
 */
export function buildUnchangedFeatureIdsSql(chunkFeatureIds: string[], transform: GeometryNoOpTransform): Prisma.Sql {
  const expression = NO_OP_TRANSFORM_EXPRESSION[transform]
  return Prisma.sql`
    SELECT id FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
      AND ${expression} IS NOT NULL
      AND ST_OrderingEquals(geometry, ${expression})
  `
}

export type GeometryNoOpTransform = "smoothGeometry" | "repairGeometry"

/** Fixed lookup — never interpolated from user input (Constitution Principle VI). Simplify is excluded because its expression needs the run's tolerance; it has its own builder below. */
const NO_OP_TRANSFORM_EXPRESSION: Record<GeometryNoOpTransform, Prisma.Sql> = {
  smoothGeometry: Prisma.sql`ST_ChaikinSmoothing(geometry)`,
  repairGeometry: REPAIRED_GEOMETRY,
}

/** Simplify's own no-op probe (T192) — separate from `buildUnchangedFeatureIdsSql` because the expression is parameterized by the run's tolerance. */
export function buildUnchangedBySimplifyFeatureIdsSql(chunkFeatureIds: string[], tolerance: number): Prisma.Sql {
  return Prisma.sql`
    SELECT id FROM "Feature"
    WHERE id IN (${Prisma.join(chunkFeatureIds)})
      AND ST_OrderingEquals(geometry, ST_SimplifyPreserveTopology(geometry, ${tolerance}))
  `
}

/** Split (FR-012) — cuts every feature of the target layer using the combined "blade" geometry of the splitter layer (`ST_Split`), one output row per resulting part, each keeping the original feature's attributes. */
export function buildSplitSql(newLayerId: string, targetLayerId: string, splitterLayerId: string): Prisma.Sql {
  return buildAttributePreservingTransformSql(
    newLayerId,
    Prisma.sql`
      SELECT a.id AS old_id, (ST_Dump(ST_Split(a.geometry, splitter.blade))).geom AS new_geometry
      FROM "Feature" a
      CROSS JOIN LATERAL (
        SELECT ST_Union(geometry) AS blade FROM "Feature" WHERE "layerId" = ${splitterLayerId}
      ) splitter
      WHERE a."layerId" = ${targetLayerId}`,
  )
}

/** The distinct PostGIS geometry type names present across one or more layers (`POINT`, `MULTIPOLYGON`, …) — backs Merge's pre-run compatibility check (T193). */
export function buildLayerGeometryTypesSql(layerIds: string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT GeometryType(geometry) AS type
    FROM "Feature"
    WHERE "layerId" IN (${Prisma.join(layerIds)})
  `
}

/**
 * Collapses a PostGIS geometry type name to the family Merge cares about
 * (T193): a layer of `POINT`s and a layer of `MULTIPOINT`s merge together
 * fine, but points and polygons do not. Single- and multi- variants of
 * one shape are therefore the same family.
 */
export function toGeometryFamily(geometryType: string): string {
  return geometryType.toUpperCase().replace(/^MULTI/, "")
}

/** Merge (FR-012) — concatenates every feature from every input layer into one output layer unchanged, attributes included (does not union/dissolve geometry — that is Dissolve's job). */
export function buildMergeSql(newLayerId: string, inputLayerIds: string[]): Prisma.Sql {
  return buildAttributePreservingTransformSql(
    newLayerId,
    Prisma.sql`
      SELECT id AS old_id, geometry AS new_geometry
      FROM "Feature"
      WHERE "layerId" IN (${Prisma.join(inputLayerIds)})`,
  )
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
/**
 * One chunk of a spatial-predicate selection (FR-004) — copies each
 * matching source feature's geometry *and* attributes into the result
 * layer via a CTE that computes the old-id→new-id mapping once and reuses
 * it for both inserts (a selection's output represents the same
 * real-world feature, unlike Buffer/Overlay's genuinely-derived geometry,
 * so its attributes must survive — a plain geometry-only copy would leave
 * every matched feature attribute-less, defeating the point of "select by
 * location/attribute"). Backs `spatialJoin`/`pointInPolygon`/
 * `selectByLocation` (all reuse this with the appropriate relationship) as
 * well as the dedicated `touches`/`crosses`/`overlaps` operationTypes.
 * `relationship` is always drawn from this file's own fixed
 * `SPATIAL_PREDICATE_FUNCTION` lookup, never interpolated from user input
 * directly (Constitution Principle VI).
 */
export function buildSpatialPredicateChunkSql(
  newLayerId: string,
  chunkFeatureIds: string[],
  referenceLayerId: string,
  relationship: SpatialRelationship,
): Prisma.Sql {
  const predicateFn = Prisma.raw(SPATIAL_PREDICATE_FUNCTION[relationship])
  return Prisma.sql`
    WITH matched AS (
      SELECT a.id AS old_id, a.geometry AS old_geometry, gen_random_uuid()::text AS new_id
      FROM "Feature" a
      WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
        AND EXISTS (
          SELECT 1 FROM "Feature" b
          WHERE b."layerId" = ${referenceLayerId}
            AND ${predicateFn}(a.geometry, b.geometry)
        )
    ), ins_feature AS (
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT new_id, ${newLayerId}, old_geometry, NOW(), NOW() FROM matched
    )
    INSERT INTO "FeatureAttribute" (id, "featureId", key, value)
    SELECT gen_random_uuid()::text, matched.new_id, fa.key, fa.value
    FROM matched JOIN "FeatureAttribute" fa ON fa."featureId" = matched.old_id
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

/**
 * One chunk of Select by Attribute (FR-006) — copies each matching
 * feature's geometry *and* attributes into the result layer (same
 * old-id→new-id CTE pattern and rationale as `buildSpatialPredicateChunkSql`).
 * `filter` is always passed as parameterized values, never
 * string-concatenated into SQL text (Constitution Principle VI).
 */
export function buildSelectByAttributeChunkSql(
  newLayerId: string,
  chunkFeatureIds: string[],
  filter: AttributeFilter,
): Prisma.Sql {
  const comparison = buildAttributeComparisonSql(filter.operator, filter.value)
  return Prisma.sql`
    WITH matched AS (
      SELECT a.id AS old_id, a.geometry AS old_geometry, gen_random_uuid()::text AS new_id
      FROM "Feature" a
      JOIN "FeatureAttribute" fa ON fa."featureId" = a.id AND fa.key = ${filter.key}
      WHERE a.id IN (${Prisma.join(chunkFeatureIds)})
        AND ${comparison}
    ), ins_feature AS (
      INSERT INTO "Feature" (id, "layerId", geometry, "createdAt", "updatedAt")
      SELECT new_id, ${newLayerId}, old_geometry, NOW(), NOW() FROM matched
    )
    INSERT INTO "FeatureAttribute" (id, "featureId", key, value)
    SELECT gen_random_uuid()::text, matched.new_id, fa.key, fa.value
    FROM matched JOIN "FeatureAttribute" fa ON fa."featureId" = matched.old_id
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

/**
 * Metres per degree of latitude. `Feature.geometry` is fixed at EPSG:4326,
 * so a grid built with `ST_SquareGrid` is sized in degrees — this converts
 * the caller's metric cell size into that unit. It is exact for latitude
 * and an over-estimate for longitude away from the equator, which is why
 * the density result reports the grid's *measured* cell area rather than
 * assuming the requested size (see `buildDensityGridSql`).
 */
const METERS_PER_DEGREE_LATITUDE = 111_320

/** Converts a metric cell size to the degree units `ST_SquareGrid` works in. */
export function toDegrees(meters: number): number {
  return meters / METERS_PER_DEGREE_LATITUDE
}

/** A grid finer than this over the layer's extent is refused rather than attempted (T205) — cell count grows with the *square* of the inverse cell size, so a small mistake turns into millions of cells. */
export const MAX_DENSITY_GRID_CELLS = 250_000

/** How many cells a density grid would contain over the layer's extent — the pre-run guard against an accidentally tiny cell size. */
export function buildDensityGridSizeSql(layerId: string, cellSizeDegrees: number): Prisma.Sql {
  return Prisma.sql`
    SELECT COALESCE(
      CEIL((ST_XMax(bounds) - ST_XMin(bounds)) / ${cellSizeDegrees} + 1)
      * CEIL((ST_YMax(bounds) - ST_YMin(bounds)) / ${cellSizeDegrees} + 1),
      0
    )::float8 AS cells
    FROM (SELECT ST_Extent(geometry)::geometry AS bounds FROM "Feature" WHERE "layerId" = ${layerId}) extent
  `
}

/**
 * Density Analysis (US6.4, FR-016) — features per unit area, measured over
 * a real square grid laid across the layer's extent at the caller's cell
 * size.
 *
 * US6.4 asks for "features-per-unit-area" against a reference area, not a
 * raster surface, and US6 requires statistics to produce no layer — so the
 * grid is computed and then *summarized* (occupied cells, peak and mean
 * occupancy, overall density) rather than persisted as cells. That makes
 * `cellSize` genuinely determine the result while keeping Density a
 * read-only statistic.
 *
 * `meanCellAreaSquareMeters` is measured from the generated cells via a
 * geography cast rather than derived from the requested size: a grid sized
 * in degrees is not metrically square away from the equator, and reporting
 * the size that was asked for instead of the one that was used would
 * overstate the result's precision.
 */
export function buildDensityGridSql(layerId: string, cellSizeMeters: number): Prisma.Sql {
  const cellSizeDegrees = toDegrees(cellSizeMeters)
  return Prisma.sql`
    WITH bounds AS (
      SELECT ST_SetSRID(ST_Extent(geometry)::geometry, 4326) AS geom FROM "Feature" WHERE "layerId" = ${layerId}
    ), total AS (
      SELECT COUNT(*)::int AS feature_count FROM "Feature" WHERE "layerId" = ${layerId}
    ), cells AS (
      SELECT (ST_SquareGrid(${cellSizeDegrees}, bounds.geom)).geom AS cell
      FROM bounds WHERE bounds.geom IS NOT NULL
    ), counted AS (
      SELECT
        cells.cell,
        ST_Area(cells.cell::geography) AS cell_area,
        (SELECT COUNT(*) FROM "Feature" f WHERE f."layerId" = ${layerId} AND ST_Intersects(f.geometry, cells.cell)) AS n
      FROM cells
    )
    SELECT jsonb_build_object(
      'featureCount', (SELECT feature_count FROM total),
      'cellSizeMeters', ${cellSizeMeters},
      'cellCount', COUNT(*),
      'occupiedCellCount', COUNT(*) FILTER (WHERE n > 0),
      'maxFeaturesPerCell', COALESCE(MAX(n), 0),
      'meanFeaturesPerOccupiedCell', COALESCE(AVG(n) FILTER (WHERE n > 0), 0),
      'meanCellAreaSquareMeters', COALESCE(AVG(cell_area), 0),
      'densityPerCell', CASE WHEN COUNT(*) > 0
        THEN (SELECT feature_count FROM total)::float8 / COUNT(*) ELSE 0 END,
      'densityPerSquareMeter', CASE WHEN COALESCE(SUM(cell_area), 0) > 0
        THEN (SELECT feature_count FROM total)::float8 / SUM(cell_area) ELSE 0 END
    ) AS result
    FROM counted
  `
}

/**
 * Summarize (US6, FR-016) — every statistic `buildStatisticsSql` exposes
 * individually, computed in one pass over the layer.
 *
 * `geometryTypes` is what lets the UI show only the applicable cards: a
 * point layer has no meaningful area or length, and reporting `0 m²` for
 * one is worse than omitting it, because a zero reads as a measurement
 * rather than as "not applicable". Single- and multi- variants collapse to
 * one family for the same reason `toGeometryFamily` exists.
 *
 * Areas and lengths are geography casts (true metres), while the geometry
 * outputs stay in EPSG:4326 — matching every other statistic's units.
 */
export function buildSummarySql(layerId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT jsonb_build_object(
      'featureCount', COUNT(*),
      'geometryTypes', COALESCE(jsonb_agg(DISTINCT regexp_replace(GeometryType(geometry), '^MULTI', '')), '[]'::jsonb),
      'totalAreaSquareMeters', COALESCE(SUM(ST_Area(geometry::geography)), 0),
      'averageAreaSquareMeters', COALESCE(AVG(ST_Area(geometry::geography)), 0),
      'totalLengthMeters', COALESCE(SUM(ST_Length(geometry::geography)), 0),
      'averageLengthMeters', COALESCE(AVG(ST_Length(geometry::geography)), 0),
      'boundingBox', ST_AsGeoJSON(ST_Envelope(ST_Collect(geometry)))::jsonb,
      'centroid', ST_AsGeoJSON(ST_Centroid(ST_Collect(geometry)))::jsonb,
      'convexHull', ST_AsGeoJSON(ST_ConvexHull(ST_Collect(geometry)))::jsonb,
      'extent', ST_AsGeoJSON(ST_SetSRID(ST_Extent(geometry)::geometry, 4326))::jsonb
    ) AS result
    FROM "Feature" WHERE "layerId" = ${layerId}
  `
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
