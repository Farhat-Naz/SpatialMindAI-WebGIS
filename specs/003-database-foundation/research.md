# Research: Database Foundation

**Feature**: 003-database-foundation
**Date**: 2026-07-22

All decisions below are derived from the project constitution
(`.specify/memory/constitution.md` v3.0.0), the approved feature spec
(`spec.md`), and the existing codebase (`001-app-foundation`, `002-search`).
No `NEEDS CLARIFICATION` markers remain in the spec — this document records the
implementation-pattern decisions needed to move from spec to design. This is the
first feature in the project to introduce a database, so several decisions here
establish precedent for every future feature.

---

## Decision 1: Prisma + PostGIS Integration Strategy

**Decision**: Enable Prisma's `postgresqlExtensions` preview feature and declare
the PostGIS extension on the datasource. Every geometry-bearing column (only
`Feature.geometry`) is declared using Prisma's `Unsupported("geometry(Geometry,4326)")`
column type, since Prisma Client has no native geometry scalar. All reads and
writes of that column go through parameterized raw SQL (`$queryRaw`/`$executeRaw`
tagged templates) using PostGIS functions (`ST_GeomFromGeoJSON`, `ST_AsGeoJSON`),
never the generated Prisma Client field accessor (which Prisma itself disables
for `Unsupported` columns).

**Rationale**: PostGIS's `geometry` type has no equivalent in Prisma's type
system; `Unsupported` is Prisma's documented escape hatch for exactly this case,
and keeps the column visible in `prisma migrate`/`prisma studio` schema
introspection even though the client can't type it. Confining all geometry I/O to
raw SQL is also required by Constitution Principle III (Database) and IV (GIS
Principles): every persisted spatial value must be produced/consumed by PostGIS,
never by client-side geometry math.

**Alternatives considered**: Storing geometry as GeoJSON text/JSONB with no
PostGIS geometry column (rejected — violates Constitution Principle III's
explicit requirement that "geometry MUST be stored using PostGIS geometry types
... never decomposed" and would forfeit spatial indexing and `ST_*` query
functions entirely); a third-party Prisma-PostGIS plugin (rejected — adds an
unmaintained/unofficial dependency for a problem `Unsupported` + raw SQL already
solves with only first-party tooling).

---

## Decision 2: Repository Pattern & Database-Access Boundary

**Decision**: Introduce a repository layer at `src/server/repositories/`
(`projectRepository.ts`, `layerRepository.ts`, `featureRepository.ts`), plus a
single Prisma Client singleton at `src/server/db/prismaClient.ts`. Only files
under `src/server/` may import `@prisma/client`; Route Handlers
(`app/api/**/route.ts`) are the only callers of `src/server/repositories/*`, and
no repository is ever imported by client-side code (components, hooks, stores,
`src/features/**/services/*`).

**Rationale**: Constitution Principle I states "Route Handlers ... are the only
code ... permitted to import the Prisma client," which read strictly would
forbid a separate repository module. `002-search`'s `features/search/api/`
(a server-only adapter module called exclusively by its two Route Handlers, and
never by client code) already establishes the accepted precedent for this
project: the constitutional boundary being enforced is *client code must never
reach the database or a credentialed third party directly* — not literally "the
Prisma import statement must appear inside a file named `route.ts`." A
repository layer that (a) lives in a directory no client-side code imports from
and (b) is invoked exclusively by Route Handlers satisfies that boundary while
giving Prisma access a testable, reusable, single-responsibility home instead of
duplicating query logic across every `route.ts`. This decision itself is the
Constitution Check clarification recorded for this plan.

**Alternatives considered**: Inlining all Prisma/raw-SQL calls directly inside
each `route.ts` (rejected — duplicates the same query logic across list/detail
Route Handlers for the same entity, and makes repository-level unit testing
impossible without spinning up a full Route Handler); a generic `DataAccessLayer`
class per entity with inheritance (rejected — unnecessary abstraction for three
straightforward aggregates; plain exported functions per repository are simpler
and match the project's existing service-module style).

---

## Decision 3: Two-Layer Geometry & Coordinate Validation

**Decision**: Validate every incoming geometry in two layers, both mandatory:
(1) a Zod schema validates *structure* — that `type` is one of the six
supported values and `coordinates` is a correctly-nested array of finite numbers
within valid ranges (longitude -180..180, latitude -90..90) at every nesting
level appropriate to the geometry type; (2) after structural validation passes,
the repository calls PostGIS `ST_IsValid(ST_GeomFromGeoJSON($1))` to check
*topological* validity (closed rings, no self-intersections) before any insert
or update commits. A structurally-valid-but-topologically-invalid geometry
(e.g., a self-intersecting polygon) is rejected with `INVALID_INPUT`, matching
spec FR-015 and Edge Cases.

**Rationale**: Zod cannot express topological constraints (ring closure,
self-intersection) — those are inherently geometric computations that
Constitution Principle IV mandates be performed in PostGIS, not recomputed in
JavaScript. Conversely, PostGIS alone cannot cheaply reject a malformed JSON
shape (wrong nesting, non-numeric coordinates) before it's serialized into a SQL
call. The two layers are complementary, not redundant: Zod is the fast,
in-process first line of defense; PostGIS is the authoritative topology check.

**Alternatives considered**: A JavaScript geometry library (e.g., Turf.js) for
topology checks (rejected — Constitution Principle IV forbids using client-side
geometry math as the authoritative check for anything persisted; `ST_IsValid` is
also more battle-tested for edge cases like antimeridian-crossing rings than a
JS reimplementation); skipping structural Zod validation and relying on
`ST_GeomFromGeoJSON` to throw on bad input (rejected — a raw Postgres exception
is a poor source for a clean `INVALID_INPUT` error message, and would mean
malformed JSON reaches the database layer at all).

---

## Decision 4: Spatial Indexing & Migration Strategy

**Decision**: Generate the initial Prisma migration with `prisma migrate dev
--create-only`, then hand-edit the generated SQL to add an explicit
`CREATE INDEX ... USING GIST (geometry)` on `Feature`. This edited migration is
then applied normally (`prisma migrate dev` / `prisma migrate deploy`) and is
committed to version control like any other migration, per Constitution
Principle III ("all schema changes MUST go through Prisma Migrate").

**Implementation note (discovered during T008)**: with
`previewFeatures = ["postgresqlExtensions"]` and `extensions = [postgis]`
declared on the datasource (Decision 1), Prisma's migration engine emits
`CREATE EXTENSION IF NOT EXISTS "postgis";` itself, automatically, as the first
statement of the very first migration — no hand-edit is needed for the
extension statement specifically. The GiST index (item 3 below) is the only
DDL that still requires a manual addition, since Prisma has no schema syntax
for an index method.

**Rationale**: Prisma's schema DSL has no syntax for `USING GIST` or
extension-enablement DDL, so both must be added to the generated migration by
hand — this is Prisma's own documented pattern for PostGIS support, not a
deviation from "Prisma Migrate only." Doing this once, in the migration file
itself (rather than as a separate manual script run against the database),
keeps the spatial index reproducible across every environment (dev, CI,
staging, production) the same way the rest of the schema is.

**Alternatives considered**: Creating the GiST index manually against each
database after deployment (rejected — directly violates Principle III's ban on
manual DDL against a shared/production database, and is not reproducible/
auditable); a Prisma `postgres` "native database functions" workaround
(rejected — does not cover index-method DDL, only function defaults).

---

## Decision 5: Feature Listing Pagination

**Decision**: `GET /api/layers/:layerId/features` uses cursor (keyset)
pagination — `?cursor=<featureId>&limit=<n>` — ordered by `id`, with an optional
`?bbox=minLng,minLat,maxLng,maxLat` filter that adds a PostGIS
`ST_Intersects(geometry, ST_MakeEnvelope(...))` predicate, using the GiST index
from Decision 4.

**Rationale**: Spec SC-003 requires a 100,000-feature layer to return in under 2
seconds; offset-based pagination (`OFFSET n LIMIT m`) degrades linearly as `n`
grows because Postgres must still scan and discard the skipped rows, while
keyset pagination stays roughly constant-time regardless of how deep into the
list a page is. The optional bbox filter lets a future map-viewport feature
request only the features currently visible, using the same spatial index
rather than a second one.

**Alternatives considered**: Offset/limit pagination (rejected — fails the
100,000-feature performance target as page depth grows); returning all features
unpaginated (rejected — directly contradicts SC-003 and risks unbounded
response payloads).

---

## Decision 6: Authentication Boundary (Interim Seam)

**Decision**: Every Route Handler resolves the acting user through a single
seam, `getCurrentUser(request)` in `src/server/auth/getCurrentUser.ts`, called
before any repository access. No end-user authentication system (login,
sessions, password/OAuth) exists anywhere in the codebase yet — this module is
the first to introduce the `User` entity at all — so this phase implements
`getCurrentUser` as an explicit, clearly-isolated placeholder (a single seeded
"default" user, selected via a `DEV_USER_ID` environment variable) rather than
a real credential check.

**Rationale**: Constitution Principle VI requires authentication to be enforced
on every protected Route Handler "before any handler logic runs" — this is
satisfied structurally today (every handler calls the seam first, and
ownership checks in FR-006 already branch on the resolved user), but the seam's
*implementation* cannot yet distinguish real users because no login mechanism
exists in this codebase. Isolating the placeholder behind one function means a
future authentication module replaces only `getCurrentUser`'s body — no Route
Handler, repository, or authorization check changes when real sessions arrive.
This gap is also recorded under Risks in `plan.md`.

**Alternatives considered**: Deferring all authorization checks until a real
auth module ships (rejected — would ship FR-006/ownership checks as dead code
and leave every endpoint effectively public, failing Constitution Principle VI
outright); building a minimal real login flow as part of this module (rejected
— explicitly out of scope per the approved spec, which scopes this module to
data storage/CRUD, not identity).

---

## Decision 7: Cascading Deletion

**Decision**: Cascading deletes (Project → Layer → Feature → FeatureAttribute /
FeatureStyle, and User → Project) are declared as `onDelete: Cascade`
referential actions in the Prisma schema itself, enforced by PostgreSQL foreign
keys — not simulated with application-level multi-step delete code.

**Rationale**: A database-level `ON DELETE CASCADE` is atomic and cannot leave
an orphaned row behind even if the application process crashes mid-request,
directly satisfying spec FR-004/FR-010/SC-006 ("no orphaned records remain
retrievable") and Constitution Principle X's ban on partial-completion states.

**Alternatives considered**: Application-level cascading (delete features, then
attributes/styles, then the layer, then the project, in application code)
(rejected — not atomic across multiple statements without an explicit
transaction wrapper that duplicates what the database's own foreign key
constraint already guarantees for free, and is strictly more code to maintain).

---

## Decision 8: Layer Reordering

**Decision**: `Layer.order` is a plain integer, unique per project. Reordering
is exposed as a single bulk endpoint,
`PATCH /api/projects/:projectId/layers/reorder`, accepting the full ordered list
of the project's layer IDs and rewriting every affected `order` value inside one
Prisma transaction.

**Rationale**: Spec FR-011 requires reordering to be reflected consistently on
every subsequent read; a single full-list, transactional rewrite avoids the
class of bug where reordering two layers independently (e.g., two separate
"move up"/"move down" calls) leaves a duplicate or gap in `order` under
concurrent requests, satisfying the Edge Case "two layers assigned the same
draw-order position."

**Alternatives considered**: Fractional/"lexorank"-style ordering keys allowing
single-row moves without rewriting siblings (rejected — meaningfully more
complex for a data volume where a project has at most ~100 layers per SC-002;
rewriting up to 100 rows in one transaction is cheap and simpler to reason
about correctly).

---

## Decision 9: Rate Limiting

**Decision**: A per-user, per-minute sliding-window limiter (in-memory,
single-process) guards the write endpoints (`POST`/`PATCH`/`DELETE` across all
three resources), returning `429` with a `RATE_LIMITED`-style outcome when
exceeded. Read endpoints (`GET`) are not rate-limited in this phase.

**Rationale**: Constitution's Performance/Security principles and the user's
requested plan sections call for rate limiting; write endpoints are the
meaningful abuse/cost surface (each write reaches PostGIS and, for features,
runs a topology check), while reads are the platform's core, expected-high-
volume path (SC-003) and should not be artificially throttled. This mirrors
`002-search`'s Research Decision 5 (in-memory, single-instance-scoped limiter),
extended here to user-scoped rather than upstream-provider-scoped limiting.

**Alternatives considered**: No rate limiting this phase (rejected — write
endpoints that reach a shared database are a real cost/abuse surface once real
authentication exists); a distributed rate limiter (e.g., Redis-backed) from day
one (rejected — unjustified operational complexity before the app is deployed
across more than one instance; flagged as a future extension, exactly as
`002-search` flagged its own limiter's single-instance scope).

---

## Decision 10: Error Response Envelope

**Decision**: Every Route Handler returns `{ error: { code, message } }` on
failure, where `code` is one of the five values fixed by the spec:
`INVALID_INPUT`, `NOT_FOUND`, `DUPLICATE_NAME`, `DATABASE_ERROR`,
`UNAUTHORIZED`. A shared `ApiError` type and a `toErrorResponse(code, message)`
helper live in `src/shared/errors/`, used by every repository/Route Handler in
the project going forward, not just this feature.

**Rationale**: Matches spec FR-027 and Constitution Principle VI/X (typed error
shape, no leaked stack traces), and reuses the exact envelope shape
`002-search` already established (`{ error: { code, message } }`), so client
error-handling code added by any future feature can branch on `error.code`
uniformly across the whole API surface rather than per-feature shapes.

**Alternatives considered**: A per-resource bespoke error shape (rejected —
would fragment client error handling across features for no benefit); HTTP
status code alone with no body (rejected — provides no machine-readable
distinction between, e.g., `NOT_FOUND` and `DATABASE_ERROR`, both of which a
caller must handle differently).

---

## Decision 11: Testing Against Real PostGIS

**Decision**: Repository-level and API-level tests run against a real,
ephemeral PostgreSQL + PostGIS instance (a Dockerized test database, started for
the test run and migrated via `prisma migrate deploy` before tests execute),
rather than a mocked Prisma Client. Hook/component/store tests continue to mock
the `services/` layer (no real network or database call), matching the existing
`002-search` testing pattern.

**Rationale**: This feature's correctness is dominated by raw-SQL PostGIS
behavior (`ST_IsValid`, `ST_GeomFromGeoJSON`, `ST_AsGeoJSON`, the GiST index)
that a mocked Prisma Client cannot exercise meaningfully — a mock would only
prove the repository *called* `$queryRaw` with some string, not that the query
is correct or that invalid topology is actually rejected. Constitution
Principle VII requires API tests to cover "validation failure, success, and
error-response paths," which for this feature specifically means real
PostGIS validation behavior.

**Alternatives considered**: Mocking `@prisma/client` entirely for repository
tests (rejected — cannot validate the one thing most likely to break: PostGIS
raw SQL correctness); running tests against the shared development database
(rejected — violates test isolation and risks leaving test data in a
non-ephemeral database).

---

## Decision 12: Free-Form Attribute Storage Model

**Decision**: `FeatureAttribute` is a normalized child table (one row per
key/value pair, foreign-keyed to `Feature`), storing `value` as text. No
per-field type system (number/boolean/date) is enforced by the schema in this
phase — any type coercion for display is a future, feature-specific concern.

**Rationale**: This directly implements the approved spec's Key Entities
section, which specifies `FeatureAttribute` as its own entity, and the
Assumptions section's explicit choice (confirmed via clarification) of
free-form, per-feature attributes rather than a per-layer fixed schema. A
normalized row-per-attribute table (rather than a single JSONB blob column)
keeps attribute storage queryable and consistent with Constitution Principle
III's database-normalization expectation, while still allowing every feature to
carry a completely independent set of attribute names, satisfying FR-019/FR-020.

**Alternatives considered**: A single `attributes JSONB` column on `Feature`
(rejected — the approved spec explicitly models `FeatureAttribute` as a
distinct entity with its own identity, and a JSONB blob would make per-key
constraints like FR-021's "add/change/remove individual attribute values"
harder to express as isolated, independently-testable operations).
