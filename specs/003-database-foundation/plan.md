# Implementation Plan: Database Foundation

**Branch**: `003-database-foundation` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-database-foundation/spec.md`

---

## Summary

Build the persisted data foundation every future SpatialMindAI-WebGIS feature
depends on: **Project → Layer → Feature (+ FeatureAttribute, FeatureStyle)**,
backed by PostgreSQL + PostGIS via Prisma, exposed through three Route Handler
resource groups (`/api/projects`, `/api/layers`, `/api/features`) and consumed
client-side by a new `src/features/database/` module (services/hooks/store
only — no management UI is built this phase). This is the first feature in the
project to introduce a database at all, so this plan also establishes the
patterns (repository layer, geometry validation, cascade rules, error
envelope) every later feature's data access will reuse. No implementation code
is included in this plan; see `research.md`, `data-model.md`, `contracts/`, and
`quickstart.md` for the supporting design artifacts.

---

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged from Phase 1/2)

**Primary Dependencies**:
- next@16 (App Router + Route Handlers), react@19 / react-dom@19
- prisma / @prisma/client (new — first use in this project), with the
  `postgresqlExtensions` preview feature enabled (Research Decision 1)
- zod (existing dependency, first use for a persisted-data contract rather than
  a proxy's query params)
- @tanstack/react-query@5 (project/layer/feature list and detail caching)
- zustand@5 (new `databaseStore` slice — selection state only, no server data)
- tailwindcss v4 — unchanged; this phase adds no new UI

**Storage**: PostgreSQL 16+ with the PostGIS extension (enabled by the first
migration itself, Research Decision 4), accessed exclusively through Prisma
except for the `Feature.geometry` column, which is read/written via
parameterized raw SQL (Research Decision 1). This is the first feature to
introduce persistent server-side storage into the project.

**Testing**: Vitest + React Testing Library (existing). Repository- and
API-level tests run against a real, ephemeral PostgreSQL + PostGIS instance
rather than a mocked Prisma Client (Research Decision 11); hook/store tests
continue to mock the `services/` layer, matching the `002-search` pattern.

**Target Platform**: Node.js runtime only. Prisma's query engine is not
Edge-runtime-compatible without an additional proxy layer (e.g., Prisma
Accelerate), which this phase does not introduce — every Route Handler added
here MUST run on the Node.js runtime (Next.js's default), never `edge`.

**Project Type**: Web application — single Next.js app. This phase adds the
project's first database-backed Route Handlers under `app/api/projects/`,
`app/api/layers/`, `app/api/features/`, plus a new server-only layer
(`src/server/`) that does not exist yet.

**Performance Goals** (from spec Success Criteria):
- Project creation reflected in under 2 s (SC-001)
- 1,000+ projects × 100+ layers each with no listing degradation (SC-002)
- 100,000-feature layer listing returns in under 2 s (SC-003)
- 100% of invalid-geometry submissions rejected before persistence (SC-004)

**Constraints**:
- SRID fixed at 4326 for every geometry, no exceptions (spec FR-016)
- Exactly six supported geometry types (spec FR-014)
- Layers may mix geometry types freely (confirmed clarification — no
  per-layer geometry-type constraint, FR-012)
- Feature attributes are free-form per feature, not a fixed per-layer schema
  (confirmed clarification, FR-019)
- Cascade deletion is destructive and immediate, no soft-delete (spec
  Assumptions)
- No real authentication system exists yet in this codebase — an interim seam
  is used (Research Decision 6)

**Scale/Scope**: Adds one client feature module (`features/database/`), one
new server-only layer (`src/server/`), six Prisma models, and eleven Route
Handler endpoints across three resource groups. No existing feature
(`dashboard`, `map`, `search`) is modified.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design —
see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | Client code lives under `src/features/database/`; only `app/api/**/route.ts` and `src/server/repositories/*` (called exclusively by Route Handlers) ever import `@prisma/client` — see Research Decision 2 for the explicit reasoning on why a repository layer satisfies this boundary the same way `002-search`'s server-only provider adapter did |
| II. Type Safety | ✅ PASS | Strict TS; zero `any`; Zod schemas in `src/shared/contracts/` are the single source of truth for every request/response shape, `z.infer`'d by both Route Handlers and client services |
| III. Database | ✅ PASS | PostgreSQL + PostGIS only, Prisma the only ORM, GiST spatial index on `Feature.geometry` (Research Decision 4), geometry stored as a native PostGIS type not decomposed lat/lng columns (Research Decision 1), all schema changes via Prisma Migrate, raw SQL confined to parameterized tagged templates |
| IV. GIS Principles | ✅ PASS | All persisted geometry validated via PostGIS `ST_IsValid` (Research Decision 3), never a client-side library; exactly the six mandated geometry types; SRID 4326 fixed platform-wide; topology integrity enforced before commit |
| V. Performance | ✅ PASS | Cursor pagination for 100k-feature layers (Research Decision 5) rather than offset pagination; React Query caching for project/layer/feature reads; no heavy client-only module introduced this phase (no `next/dynamic` need) |
| VI. Security | ✅ PASS | Zod validation before every repository call; parameterized-only raw SQL (no string-concatenated SQL anywhere, Research Decisions 1/3); every Route Handler resolves and enforces the acting user before handler logic runs (Research Decision 6, flagged as an interim seam under Risks below); secrets (`DATABASE_URL`) server-env only |
| VII. Testing | ✅ PASS | Unit (repository functions, Zod schemas), store (`databaseStore` actions), hook (`useProjects`/`useLayers`/`useFeatures` etc. against mocked services), API (all eleven endpoints against a real PostGIS instance, Research Decision 11), integration (full Project→Layer→Feature lifecycle) — see Testing Strategy below |
| VIII. Documentation | ✅ PASS | JSDoc required on every exported repository function, service, and hook; this spec→plan→(tasks→implementation→tests→README) lifecycle is itself the Principle VIII requirement in progress |
| IX. Git Workflow | ✅ PASS (process, not code) | Standard feature-branch/Conventional-Commits/PR-review workflow applies; no exception requested |
| X. Quality Gates | ✅ PASS | TypeScript, ESLint, all applicable test tiers, and `next build` all gate merge, per Quality Gates section below |

**No violations — Complexity Tracking table (bottom of this document) records
one clarifying interpretation (Research Decision 2), not a violation.**

**Re-check after Phase 1 design**: Confirmed still PASS. Data model, contracts,
and quickstart (Phase 1 outputs) did not introduce anything that weakens a
principle — the repository-layer interpretation from Research Decision 2 is
the only point worth a reviewer's explicit attention, and it is recorded below
rather than left implicit.

**Re-check after implementation (T063)**: Confirmed still PASS against the
actually-shipped code, verified directly rather than assumed:
- **I/III**: `grep -rl "@prisma/client" src/features src/app` returns nothing
  — only `src/server/**` files import the Prisma client; every Route Handler
  reaches it exclusively through a repository function.
- **II**: `eslint`'s `@typescript-eslint/no-explicit-any: error` rule passed
  with zero warnings across the entire new surface (repositories, Route
  Handlers, services, hooks, schemas).
- **IV/VI**: every raw SQL call in `featureRepository.ts` is a tagged
  template (`$queryRaw`/`$executeRaw`), never string-concatenated; `ST_IsValid`
  gates every geometry insert/update inside the same transaction.
- **VII**: unit/store/hook/API/integration test tiers all exist and are
  wired to skip (not silently pass) when the test database is unreachable,
  rather than being omitted.
- **X**: `tsc --noEmit`, `eslint`, `vitest run`, and `next build`
  (including `ANALYZE=true`) all pass; the client bundle for `/` is
  unchanged at 146 kB First Load JS (this phase added no new UI).
- One new, minimal deviation from the original five-code error vocabulary is
  recorded: `RATE_LIMITED` (429) was added to `ApiErrorCode` to implement the
  rate limiting this plan's own Section 7/Research Decision 9 already called
  for — flagged explicitly rather than silently introduced, since no other
  existing code correctly represents a throttling outcome.
- The interim authentication seam (Research Decision 6) remains the one
  known, documented gap preventing this phase from being production-safe
  as-is — unchanged in status from the original Constitution Check.

---

## Project Structure

### Documentation (this feature)

```text
specs/003-database-foundation/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   ├── api-contracts.md      # Route Handler request/response contracts
│   ├── repository-api.md     # Route Handler ↔ repository function contracts
│   └── client-api.md         # services/hooks/store contracts
├── checklists/
│   └── requirements.md
└── tasks.md              # Generated by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

```text
src/
├── features/
│   └── database/                      # This feature's client module
│       ├── components/                # Empty this phase — no management UI
│       │                              # built yet; barrel intentionally has
│       │                              # nothing to export from here until a
│       │                              # later feature adds screens
│       ├── hooks/
│       │   ├── useProjects.ts         # + useCreateProject, useUpdateProject,
│       │   │                         #   useDeleteProject
│       │   ├── useLayers.ts           # + useCreateLayer, useRenameLayer,
│       │   │                         #   useReorderLayers, useDeleteLayer
│       │   ├── useFeatures.ts         # + useCreateFeature, useUpdateFeature,
│       │   │                         #   useDeleteFeature
│       │   └── index.ts
│       ├── services/
│       │   ├── projectService.ts      # fetch wrappers: /api/projects*
│       │   ├── layerService.ts        # fetch wrappers: /api/layers*,
│       │   │                         #   /api/projects/:id/layers*
│       │   ├── featureService.ts      # fetch wrappers: /api/features*,
│       │   │                         #   /api/layers/:id/features
│       │   └── queryKeys.ts           # Centralized React Query key factory
│       ├── store/
│       │   └── databaseStore.ts       # Zustand: selectedProjectId/LayerId/
│       │                              #   FeatureId — no server data
│       ├── types/
│       │   └── database.types.ts      # Re-exports of shared contract types
│       ├── __tests__/                 # Unit/hook/store tests (co-located)
│       └── index.ts                   # Public barrel — services, hooks,
│                                      #   store selectors, re-exported types
│
├── server/                            # NEW — server-only, first use in
│   │                                  #   this project (Research Decision 2)
│   ├── db/
│   │   └── prismaClient.ts            # Prisma Client singleton
│   ├── repositories/
│   │   ├── userRepository.ts
│   │   ├── projectRepository.ts
│   │   ├── layerRepository.ts
│   │   └── featureRepository.ts       # Owns FeatureAttribute/FeatureStyle
│   │                                  #   access; raw SQL for `geometry`
│   └── auth/
│       └── getCurrentUser.ts          # Interim seam — Research Decision 6
│
└── shared/
    ├── contracts/                     # NEW — Zod schemas + z.infer types,
    │   ├── geometry.schema.ts         #   single source of truth for both
    │   ├── project.schema.ts          #   server (Route Handlers) and client
    │   ├── layer.schema.ts            #   (services), per Constitution
    │   └── feature.schema.ts          #   Principle II
    └── errors/
        └── apiError.ts                # NEW — shared { code, message } shape
                                        #   and mapping helper (Research
                                        #   Decision 10); every future feature
                                        #   reuses this, not just this one

app/
└── api/
    ├── projects/
    │   ├── route.ts                   # GET (list), POST (create)
    │   └── [projectId]/
    │       ├── route.ts               # GET, PATCH, DELETE
    │       └── layers/
    │           ├── route.ts           # GET (list), POST (create)
    │           └── reorder/
    │               └── route.ts       # PATCH (bulk reorder)
    ├── layers/
    │   └── [layerId]/
    │       ├── route.ts               # PATCH (rename), DELETE
    │       └── features/
    │           └── route.ts           # GET (list, paginated), POST (create)
    └── features/
        └── [featureId]/
            └── route.ts               # GET, PATCH, DELETE
```

**Structure Decision**: Single Next.js app, extending the existing
feature-first `src/features/` layout with one new client module (`database`)
plus a brand-new `src/server/` layer and eleven Route Handlers under
`app/api/`. This is the first phase to introduce `src/server/` at all; every
later feature that needs database access is expected to add its repositories
there and its Route Handlers under `app/api/`, following exactly this
structure rather than inventing a new pattern.

---

## 1. Technical Architecture

**Feature-first**: `src/features/database/` follows the same
components/hooks/services/store/types/`__tests__` shape as `dashboard`, `map`,
and `search`, even though `components/` is empty this phase (Constitution
Principle I).

**Client/server separation**: Client code (`src/features/database/`) never
imports `@prisma/client` or performs a raw SQL call — it only calls its own
`services/*.ts`, which call Route Handlers over `fetch`. Server code
(`src/server/`) never imports anything from `src/features/**` — the dependency
arrow points one way, Route Handler → repository, never the reverse.

**Service layer**: Exists on *both* sides of the API boundary with distinct
meanings — client `services/` wrap `fetch` calls to Route Handlers (existing
project convention); server `src/server/repositories/` wrap Prisma/raw-SQL
calls (new this phase). Neither layer contains business logic beyond request
shaping, validation delegation, and response mapping.

**Repository pattern**: Adopted — see Research Decision 2 for why this pattern
is used and how it stays compliant with Constitution Principle III's
Route-Handler-only database access rule. One repository per aggregate root
(`projectRepository`, `layerRepository`, `featureRepository`), each exposing
plain exported async functions (no class hierarchy — see Research Decision 2's
Alternatives Considered).

**Route Handlers**: Thin controllers — parse/validate the request with a Zod
schema from `src/shared/contracts/`, call exactly one repository function,
map the result (or a thrown typed error) to an HTTP response. No Route Handler
contains a raw SQL string or a multi-step transaction inline — that logic
lives in the repository it calls.

**Prisma data access**: All non-geometry reads/writes go through the generated
Prisma Client as usual. `Feature.geometry` is the one exception, handled via
raw SQL per Research Decision 1.

**PostGIS integration**: Confined to `featureRepository.ts` — `ST_GeomFromGeoJSON`,
`ST_AsGeoJSON`, `ST_IsValid`, and (for bbox-filtered listing) `ST_Intersects`/
`ST_MakeEnvelope`. No other file in the codebase calls a PostGIS function
directly.

---

## 3. Database Design

See `data-model.md` for the full entity-by-entity breakdown. Summary:

- **Prisma schema organization**: one schema file, models grouped in
  dependency order (`User` → `Project` → `Layer` → `Feature` →
  `FeatureAttribute`/`FeatureStyle`), one datasource with the `postgis`
  extension declared (Research Decision 1).
- **PostgreSQL tables**: six tables, one per entity — no polymorphic or
  shared "generic entity" table; normalized per Constitution Principle III.
- **PostGIS geometry columns**: exactly one, `Feature.geometry`, typed
  `geometry(Geometry, 4326)` (Research Decision 1) to allow any of the six
  supported subtypes in a single column rather than one column per subtype.
- **Foreign keys**: `Project.ownerId → User.id`, `Layer.projectId →
  Project.id`, `Feature.layerId → Layer.id`, `FeatureAttribute.featureId →
  Feature.id`, `FeatureStyle.featureId → Feature.id` (unique, one-to-one).
- **Indexes**: `Project(ownerId)`, `Layer(projectId, order)`,
  `Feature(layerId)`, `FeatureAttribute(featureId)`, plus the unique
  composite constraints listed per-entity in `data-model.md`.
- **Spatial indexes**: one GiST index on `Feature.geometry`, added by hand to
  the generated migration (Research Decision 4) — this is the index every
  bbox-filtered or future spatial query relies on.
- **Cascade rules**: every parent→child foreign key is `onDelete: Cascade`
  (Research Decision 7); no cascade is simulated in application code.

---

## 4. API Design

Full request/response contracts: `contracts/api-contracts.md`. Summary of the
three resource groups (Projects, Layers, Features), each supporting the full
CRUD set required by the spec's twelve user stories, plus two bulk/list
operations (layer reorder, paginated feature listing). Every write endpoint
validates its body against a `src/shared/contracts/*.schema.ts` Zod schema
before calling a repository function; every endpoint (read or write) resolves
and checks the acting user first (Research Decision 6). Error handling is
uniform across all eleven endpoints: repository-thrown typed errors
(`DuplicateNameError`, `ValidationError`, `NotFoundError`) are caught once, at
the Route Handler level, and mapped to the shared `{ error: { code, message } }`
envelope (Research Decision 10) — no endpoint invents its own error shape.

---

## 5. Data Flow

```
User Action
    │
    ▼
React Component            (later feature — none built this phase)
    │
    ▼
Zustand (databaseStore)    selection only: which project/layer/feature is active
    │
    ▼
React Query                 useProjects / useLayers / useFeatures / mutations
    │
    ▼
Service                      projectService / layerService / featureService (fetch)
    │
    ▼
Route Handler                app/api/projects|layers|features/**/route.ts
    │  Zod validation (src/shared/contracts/*.schema.ts)
    ▼
Repository                   src/server/repositories/*Repository.ts
    │
    ▼
Prisma                       generated client (all fields except geometry)
    │
    ▼
PostGIS                      raw SQL for `geometry` only: ST_GeomFromGeoJSON,
    │                        ST_IsValid, ST_AsGeoJSON, ST_Intersects
    ▼
Database                     PostgreSQL (project's first persistent store)
    │
    ▼
Response                      { project | layer | feature } or { error }
    │
    ▼
UI Update                     React Query cache updated → dependent hooks
                              re-render (no UI exists yet this phase, but the
                              cache-invalidation contract is established for
                              whichever feature builds the screens next)
```

This is the same seven-layer shape `002-search` established
(Component→Store/Query→Service→Route Handler→external system→Response→UI),
extended with the two layers a real database requires that a stateless proxy
did not: **Repository** (between Route Handler and Prisma) and **PostGIS**
(between Prisma and the database, for the one geometry column).

---

## 6. Validation Strategy

Zod is the single validation technology across every layer that validates
structure (Constitution Principle II); PostGIS is the only validator of
geometric topology (Constitution Principle IV). See Research Decision 3 for
the full rationale.

- **Request validation**: Every Route Handler parses its body/query params
  with a schema from `src/shared/contracts/` before calling a repository.
  Failures return `400 INVALID_INPUT` with a message derived from the Zod
  issue, never a raw Zod error object.
- **Response validation**: Response shapes are the same Zod-inferred types
  used for requests (e.g., a `Project` response matches the shape
  `project.schema.ts` defines) — there is one type per entity, not a separate
  hand-written response type that could drift from the request type.
- **Database validation**: Prisma's own generated types plus the database's
  `NOT NULL`/foreign-key/unique constraints are the last line of defense,
  catching anything a race condition slipped past application-level checks
  (e.g., a duplicate name from a concurrent request).
- **Geometry validation**: Two-layer — Zod structural check (six allowed
  `type` values, correctly-nested finite-number coordinate arrays), then
  PostGIS `ST_IsValid` topological check, both mandatory, neither sufficient
  alone (Research Decision 3).
- **Coordinate validation**: Longitude clamped to -180..180 and latitude to
  -90..90 inside the same Zod geometry schema, recursively across every
  coordinate pair in a `MultiPolygon`'s nested arrays, before any database
  call is made.

---

## 7. Security

- **Authentication boundary**: `getCurrentUser(request)` (Research Decision 6)
  is called first in every Route Handler; this is a placeholder pending a real
  authentication module (flagged under Risks below), but the enforcement
  *point* — before any handler logic runs — is real and permanent.
- **Authorization**: Every repository function accepts and enforces
  `ownerId` as part of its query itself, not as a post-fetch check
  (`repository-api.md`, Cross-Cutting Rules) — a request for another user's
  project returns indistinguishable "not found" data, then the Route Handler
  maps that to `401 UNAUTHORIZED` without revealing whether the resource
  exists (spec Edge Cases).
- **Input validation**: Every write endpoint validates with Zod before
  touching the database (Section 6 above).
- **SQL injection prevention**: 100% of raw SQL (the only kind that touches
  `Feature.geometry`) uses Prisma's parameterized `$queryRaw`/`$executeRaw`
  tagged templates; string concatenation into a raw SQL call is forbidden
  without exception (Constitution Principle VI).
- **Rate limiting**: Per-user, per-minute sliding-window limiter on all
  `POST`/`PATCH`/`DELETE` endpoints across all three resources (Research
  Decision 9); read endpoints are unthrottled this phase.
- **Security headers**: Unaffected by this feature — the existing CSP and
  other headers from `next.config.ts` (Constitution Principle VI) already
  cover same-origin API calls; no new external host is introduced (all
  database access is server-side only).

---

## 8. Performance

- **React Query caching**: Project and layer lists cached with a moderate
  stale time (they change infrequently relative to how often they're read);
  feature lists use a shorter stale time given they're the most frequently
  edited resource, with cache invalidation on every create/update/delete
  mutation (Section 4's contract, `client-api.md`).
- **Lazy loading**: Not applicable this phase — no heavy client-only module
  is introduced (no map-rendering or geometry-drawing UI is built here).
- **Pagination**: Cursor-based for feature listing (Research Decision 5),
  chosen specifically to hit SC-003 (100,000-feature layer, sub-2-second
  response) — offset pagination was rejected precisely because it fails this
  target as page depth grows.
- **Spatial indexing**: One GiST index on `Feature.geometry` (Research
  Decision 4) backs both the plain per-layer listing and the optional bbox
  filter.
- **Query optimization**: `layerRepository.reorderLayers` and
  `featureRepository.createFeature`'s validate-then-insert both run inside a
  single database transaction each, avoiding read-then-write race windows and
  extra round trips.
- **Bundle optimization**: This phase adds no new client-rendered UI, so its
  bundle impact is limited to the `services/hooks/store` code and the shared
  Zod schemas — expected well under any per-feature budget; verified via
  `@next/bundle-analyzer` per Constitution Principle V regardless.

---

## 9. Testing Strategy

| Tier | Coverage |
|---|---|
| **Unit** | Zod schemas (`geometry.schema.ts` accepts all six types, rejects a seventh; coordinate range boundaries); pure helpers (error-mapping in `apiError.ts`) |
| **Store** | `databaseStore` actions: `selectProject` clears dependent `selectedLayerId`/`selectedFeatureId`; `clearSelection` |
| **Hook** | `useProjects`/`useLayers`/`useFeatures` and their mutation counterparts against a mocked `services/*` layer (React Query test wrapper); verifies cache-key correctness and invalidation-on-mutation |
| **API** | All eleven Route Handlers, invoked directly against a real ephemeral PostGIS-backed test database (Research Decision 11): success path, `INVALID_INPUT` (bad structure and failed `ST_IsValid`), `NOT_FOUND`, `DUPLICATE_NAME`, `UNAUTHORIZED` for every endpoint that can produce it |
| **Integration** | Full lifecycle: create project → create two layers → reorder them → create a feature with attributes and style in one → edit its geometry independently of attributes/style → delete the layer → confirm cascade removed the feature/attribute/style rows → delete the project → confirm cascade removed everything else |
| **Accessibility** | Not applicable this phase (no UI); the client hooks/services layer carries no accessibility surface of its own. Deferred to whichever future feature builds the project/layer/feature management screens. |

All new tests are co-located under `features/database/__tests__/` (client
tier) or alongside the repositories/Route Handlers they cover (server tier),
per Constitution Principle VII; no test shares mutable global state — each
resets `databaseStore`, the React Query `QueryClient`, and the test database
(via transaction rollback or truncate) in `beforeEach`.

---

## 10. Deployment

- **Environment variables**: `DATABASE_URL` (PostgreSQL connection string,
  server-only, never `NEXT_PUBLIC_*`); `DEV_USER_ID` (interim auth seam,
  Research Decision 6 — development/staging only, removed once real
  authentication ships).
- **Database migrations**: `prisma migrate deploy` runs as part of the
  deployment pipeline, before the new application version receives traffic —
  never `prisma migrate dev` (a dev-only, interactive command) in any
  non-local environment.
- **Production build**: `next build` must succeed; because this phase's Route
  Handlers require the Node.js runtime (Prisma is not Edge-compatible without
  Accelerate, Technical Context above), none of the new Route Handlers may
  declare `export const runtime = 'edge'`.
- **Vercel deployment**: Vercel Functions run the Node.js runtime by default
  for Route Handlers that don't opt into `edge`, so no special configuration
  is required beyond ensuring `DATABASE_URL` is set per-environment
  (Preview/Production) via Vercel's environment variable management, and that
  `prisma migrate deploy` runs as a build/deploy step (e.g., a Vercel build
  command hook) rather than being triggered by application code at request
  time.
- **PostgreSQL deployment**: This phase assumes a managed PostgreSQL instance
  with PostGIS available (e.g., a Marketplace Postgres integration or an
  external managed database) reachable from the deployment environment via
  `DATABASE_URL`; provisioning that instance itself is an infrastructure
  decision outside this plan's scope, not a code change.

---

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **No real authentication system exists yet** (Research Decision 6) | Every endpoint's authorization check is real, but the *identity* behind it is a placeholder — this is not production-safe as shipped | Isolated behind one function (`getCurrentUser`); a future auth module replaces only its implementation. Flagged explicitly so it is not mistaken for a finished feature; MUST be resolved before any multi-user or public deployment. |
| **Prisma + PostGIS via `Unsupported` + raw SQL is a less-traveled path** than plain relational Prisma usage | Higher chance of a subtle raw-SQL bug (e.g., SRID mismatch, malformed tagged-template parameter) than fully-typed Prisma access | Confined to exactly one file (`featureRepository.ts`); Decision 11's real-PostGIS test strategy specifically targets this surface; every raw SQL call is parameterized, never string-built |
| **Single-instance rate limiter and in-memory state** (Research Decision 9) don't survive multiple deployed instances or restarts | A limiter reset on deploy/restart, or bypassable by hitting different instances behind a load balancer, is a real gap the moment the app scales horizontally | Explicitly scoped as a known, documented limitation (same pattern as `002-search`'s Research Decision 5); moving to a shared store (e.g., Redis) is flagged as a future extension, not attempted now, since current scale/scope is single-instance |
| **Free-form attributes** (no per-field type system) could let inconsistent data accumulate within a single layer over time | Harder to build reliable filtering/analysis UI later without a schema to validate against | Explicitly the approved spec's chosen tradeoff (confirmed via clarification), not an oversight; a per-layer schema/typing layer is called out as a reasonable future extension in both `spec.md`'s Assumptions and here |
| **Cursor pagination's `bbox` filter and the GiST index interact only as well as query-planner statistics allow** at very large scale | A poorly-planned query could regress toward a sequential scan under adversarial data distributions, risking SC-003 | `ANALYZE`/index-usage verification is part of the Section 8 performance spot-check in `quickstart.md`; if a regression is found in practice, a follow-up task (not blocking this plan) would tune the query/index rather than changing the data model |

---

## 12. Development Phases

Structured for `/speckit-tasks` to expand into a dependency-ordered task list,
following the spec's three prioritized user stories:

**Phase 1 — Setup**: Initialize Prisma; add `DATABASE_URL`/`DEV_USER_ID` to
environment config; scaffold `src/server/db/prismaClient.ts`;
`prisma migrate dev --create-only` for the initial schema and hand-edit for
the PostGIS extension + GiST index (Research Decision 4); set up the
Dockerized test-database tooling (Research Decision 11).

**Phase 2 — Foundational** *(blocks every user story)*: `src/shared/errors/apiError.ts`;
`src/shared/contracts/geometry.schema.ts` (six-type union + coordinate-range
validation); `src/server/auth/getCurrentUser.ts` interim seam (Research
Decision 6); `User` model + seed script.

**Phase 3 — User Story 1: Projects (P1)**: `Project` Prisma model +
migration; `projectRepository.ts`; `src/shared/contracts/project.schema.ts`;
`app/api/projects/route.ts` + `app/api/projects/[projectId]/route.ts`;
client `projectService.ts` + `useProjects`/mutations; unit/API/integration
tests for Project CRUD + duplicate-name + ownership enforcement.

**Phase 4 — User Story 2: Layers (P2)**: `Layer` model + migration;
`layerRepository.ts` (including `reorderLayers`, Research Decision 8);
`layer.schema.ts`; the four Layer Route Handlers (list/create, rename/delete,
reorder); client `layerService.ts` + hooks; tests for CRUD + reorder
consistency + cascade-on-project-delete.

**Phase 5 — User Story 3: Features, Attributes, Styles (P3)**: `Feature`/
`FeatureAttribute`/`FeatureStyle` models + migration (including the GiST
index, Research Decision 4); `featureRepository.ts` with the raw-SQL geometry
path (Research Decisions 1, 3, 5); `feature.schema.ts`; the Feature Route
Handlers (paginated list, create, get, update, delete); client
`featureService.ts` + hooks; tests for geometry validation (valid + rejected),
independent attribute/style updates, cascade-on-layer-delete, and the
100,000-feature performance check.

**Phase 6 — Polish & Cross-Cutting**: Rate limiter (Research Decision 9)
applied across all write endpoints; `databaseStore.ts` + its tests; feature
`README.md`; full `quickstart.md` run-through; bundle-analyzer check; final
Constitution Check re-verification.

---

## 13. Quality Gates

Every phase above must pass, with no exception absent a documented Complexity
Tracking entry (none exist for this plan):

- **TypeScript**: `tsc --noEmit` — zero errors
- **ESLint**: `eslint src --max-warnings 0` — zero errors or warnings
- **Vitest**: all applicable tiers from Section 9 passing, including the
  real-PostGIS-backed API tests (Research Decision 11)
- **Production build**: `next build` completes with no errors, with every new
  Route Handler confirmed running on the Node.js runtime (Section 10)

---

## Complexity Tracking

*No violations — one interpretive clarification is recorded, not a
Constitution exception:*

| Interpretation | Why Needed | Basis |
|---|---|---|
| Repository modules under `src/server/repositories/` import `@prisma/client`, not only `app/api/**/route.ts` files themselves | A repository layer is the only reasonable way to give Prisma access a testable, non-duplicated home without inlining raw SQL into every Route Handler | Research Decision 2: this is the same precedent `002-search`'s server-only, Route-Handler-exclusive provider adapter already established as compliant with Constitution Principle I/III's intent |
