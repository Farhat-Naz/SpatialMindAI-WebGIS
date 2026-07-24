# Data Model: Database Foundation

**Feature**: 003-database-foundation
**Date**: 2026-07-22

This is the authoritative persisted data model for the platform's foundation —
every future feature that stores a project, layer, or spatial feature builds on
these six entities. All six are Prisma models backed by PostgreSQL/PostGIS
tables (see Research Decisions 1–4, 7, 12 for the integration choices behind
the fields below). This document describes organization, fields, constraints,
relationships, and lifecycle; it intentionally does not include literal
`schema.prisma` syntax or migration SQL, which belong to the implementation
phase.

---

## Schema Organization

One Prisma schema file, one `postgresql` datasource with the `postgis`
extension declared and the `postgresqlExtensions` preview feature enabled, one
`prisma-client-js` generator. Models are declared in the dependency order
below (parent before child), matching the folder-per-aggregate convention used
by the repository layer (Research Decision 2): `User` and `Project` are
introduced by the project aggregate, `Layer` by the layer aggregate, and
`Feature`/`FeatureAttribute`/`FeatureStyle` by the feature aggregate.

---

## Entity: User

**Repository**: `src/server/repositories/userRepository.ts` (minimal — this
phase only needs lookup-by-id, since account creation/login is out of scope
per spec Assumptions and Research Decision 6)

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `email` | string | Unique |
| `name` | string? | Optional display name |
| `createdAt` | timestamp | Auto-set on creation |
| `updatedAt` | timestamp | Auto-refreshed on update |

**Relationships**: One `User` owns many `Project` (see FK on `Project.ownerId`).

**Lifecycle**: Out of scope this phase beyond existing as the owner reference
every `Project` requires; created via the interim seam described in Research
Decision 6, not via a public API endpoint.

---

## Entity: Project

**Repository**: `src/server/repositories/projectRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `name` | string | Non-empty; unique **per owner** (FR-002) |
| `description` | string? | Optional |
| `ownerId` | identifier (string) | Foreign key → `User.id` |
| `createdAt` | timestamp | Auto-set on creation, immutable thereafter (FR-025) |
| `updatedAt` | timestamp | Auto-refreshed on every update (FR-025) |

**Relationships**: Belongs to one `User` (`onDelete: Cascade` — deleting a user
deletes their projects, per the same cascading-integrity principle as Decision
7, though user deletion itself is out of scope this phase). Owns many `Layer`
(`onDelete: Cascade` on the `Layer` side — deleting a project deletes all its
layers, and transitively their features/attributes/styles, per FR-004/SC-006).

**Constraints**:
- Unique composite constraint on `(ownerId, name)` enforces FR-002's
  per-owner name uniqueness; two different owners may each have a project
  named "Downtown Survey."
- Indexed on `ownerId` to keep "list my projects" (FR-005) efficient as the
  number of projects grows (SC-002: 1,000+ projects).

**Lifecycle**: Create → Update (name/description, `updatedAt` refreshed,
`createdAt` untouched) → Delete (cascades to every nested `Layer`/`Feature`/
`FeatureAttribute`/`FeatureStyle`, per Research Decision 7 — irreversible, no
soft-delete/trash per spec Assumptions).

---

## Entity: Layer

**Repository**: `src/server/repositories/layerRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `name` | string | Non-empty; unique **per project** (FR-008) |
| `order` | integer | Unique per project; determines draw/list order (FR-011) |
| `projectId` | identifier (string) | Foreign key → `Project.id` |
| `createdAt` | timestamp | Auto-set on creation |
| `updatedAt` | timestamp | Auto-refreshed on update |

**Relationships**: Belongs to one `Project` (`onDelete: Cascade`). Owns many
`Feature` (`onDelete: Cascade` — deleting a layer deletes all its features,
transitively their attributes/styles, per FR-010).

**Constraints**:
- Unique composite constraint on `(projectId, name)` enforces FR-008.
- Indexed on `(projectId, order)` so "list this project's layers in order"
  (FR-011) is a single indexed range scan, not a sort over an unindexed column.
- No geometry-type constraint on the layer itself — per the confirmed
  clarification, a layer may contain features of more than one supported
  geometry type (FR-012); geometry-type homogeneity is explicitly not
  enforced at this level.

**Lifecycle**: Create (assigned the next `order` value within its project) →
Rename (identity and contained features unaffected, FR-009) → Reorder (bulk
rewrite of `order` across some/all sibling layers in one transaction, Research
Decision 8) → Delete (cascades to every nested `Feature`/`FeatureAttribute`/
`FeatureStyle`).

---

## Entity: Feature

**Repository**: `src/server/repositories/featureRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `layerId` | identifier (string) | Foreign key → `Layer.id` |
| `geometry` | PostGIS `geometry(Geometry, 4326)` | Required; one of the six supported subtypes (see Geometry Rules below); read/written only via raw SQL (Research Decision 1) |
| `createdAt` | timestamp | Auto-set on creation |
| `updatedAt` | timestamp | Auto-refreshed on update |

**Relationships**: Belongs to one `Layer` (`onDelete: Cascade`). Owns zero or
more `FeatureAttribute` (`onDelete: Cascade`). Owns at most one `FeatureStyle`
(`onDelete: Cascade`, one-to-one).

**Constraints**:
- A GiST spatial index on `geometry` (Research Decision 4) is what makes
  bounding-box retrieval (Research Decision 5) and future spatial queries
  (containment, intersection) efficient at the 100,000-feature-per-layer scale
  required by SC-003.
- Indexed on `layerId` for the base "features in this layer" access pattern
  independent of any spatial filter.

**Geometry Rules** (Constitution Principle IV):
- Exactly six supported shapes: `Point`, `MultiPoint`, `LineString`,
  `MultiLineString`, `Polygon`, `MultiPolygon` (FR-014). Any other GeoJSON
  geometry type (`GeometryCollection`, etc.) is rejected as `INVALID_INPUT`.
- SRID is fixed at **4326** (WGS84 longitude/latitude) for every geometry in
  the platform — there is no per-feature or per-layer override (FR-016).
- Every geometry must pass PostGIS `ST_IsValid` before it is persisted — self-
  intersecting polygon boundaries, unclosed rings, and empty geometries are
  rejected rather than stored (FR-015, Research Decision 3).

**Lifecycle**: Create (shape + optional attributes + optional style, all
three independent per FR-013) → Edit shape (FR-017, re-validated exactly like
creation — both structural and topological checks re-run) → Edit
attributes/style independently (FR-017/FR-021/FR-024 — none of the three
mutate the other two) → Delete (removes the feature and its owned attributes/
style; sibling features in the same layer are unaffected, FR-018).

---

## Entity: FeatureAttribute

**Repository**: Owned by `featureRepository.ts` (attributes are always
accessed in the context of their parent feature — see Research Decision 12 for
why this is a normalized child table rather than a JSONB column)

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `featureId` | identifier (string) | Foreign key → `Feature.id` |
| `key` | string | Non-empty; unique **per feature** |
| `value` | string | No type coercion enforced this phase (Research Decision 12) |

**Relationships**: Belongs to one `Feature` (`onDelete: Cascade`).

**Constraints**:
- Unique composite constraint on `(featureId, key)` — a feature cannot have
  two attributes with the same name; setting a value for an existing key is an
  update, not a duplicate insert.
- Indexed on `featureId`.
- No cross-feature schema constraint: two features in the same layer are not
  required to share attribute names or count (FR-019), per the confirmed
  clarification (free-form, not per-layer schema).

**Lifecycle**: A feature may be created or edited with zero attributes
(FR-020). Individual attributes may be added, changed, or removed without
affecting the feature's shape or style (FR-021).

---

## Entity: FeatureStyle

**Repository**: Owned by `featureRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `featureId` | identifier (string) | Foreign key → `Feature.id`; **unique** (one-to-one) |
| `color` | string | Required whenever a style row exists |
| `strokeWidth` | number? | Optional; meaningful for line/polygon-outline rendering |
| `fillOpacity` | number? | Optional; meaningful for polygon fill rendering |

**Relationships**: Belongs to exactly one `Feature` (`onDelete: Cascade`).

**Constraints**: Unique constraint on `featureId` enforces the one-to-one
relationship (FR-022).

**Lifecycle**: A feature created without an explicit style has no
`FeatureStyle` row at all; retrieval applies a single documented
platform-wide default (color/weight/opacity) in that case (FR-023). Setting a
style for the first time inserts the row; changing it updates the existing row
independently of the feature's shape/attributes (FR-024).

---

## Relationship Summary

```
User 1──* Project 1──* Layer 1──* Feature 1──* FeatureAttribute
                                      │
                                      └──0..1 FeatureStyle
```

Every arrow is an `onDelete: Cascade` foreign key (Research Decision 7) —
deleting any parent atomically removes every descendant, with no
intermediate/orphaned state observable (FR-004, FR-010, SC-006).

---

## Shared Types Referenced

| Type | Definition | Source |
|---|---|---|
| `GeoJSONGeometry` | Discriminated union over the six supported geometry shapes and their coordinate arrays | `src/shared/contracts/geometry.schema.ts` (Zod schema + inferred type, Research Decision 3) |
| `ApiError` | `{ code: 'INVALID_INPUT' \| 'NOT_FOUND' \| 'DUPLICATE_NAME' \| 'DATABASE_ERROR' \| 'UNAUTHORIZED'; message: string }` | `src/shared/errors/apiError.ts` (Research Decision 10) |
