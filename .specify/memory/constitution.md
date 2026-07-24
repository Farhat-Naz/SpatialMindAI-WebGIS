<!--
## Sync Impact Report

**Version Change**: 2.0.0 → 3.0.0 (MAJOR)

**Bump Rationale**: The Core Principles are fully restructured from 18 principles into
the 10 mandatory engineering categories specified for this phase of the project
(Architecture, Type Safety, Database, GIS Principles, Performance, Security, Testing,
Documentation, Git Workflow, Quality Gates). This is backward-incompatible with
v2.0.0 for three reasons: (1) principle identity/numbering is redefined, not merely
renumbered, since several prior principles are merged or reframed under new headings;
(2) a new Database principle (III) forbids any code outside a Route Handler from
importing the Prisma client — a restriction that did not exist under v2.0.0 and can
require existing code to change; (3) the mandatory Technology Stack changes
(Next.js 15 → 16; PostgreSQL + PostGIS, Prisma, and Zod promoted from
implicit/example usage to mandatory stack entries) is a technology mandate change.
Per the versioning policy, principle redefinition and technology mandate changes
both require a MAJOR bump.

**Modified Principles**:
- "I. Feature-Based Architecture" + "III. Separation of Concerns" + "XII. Folder
  Structure Conventions" → merged into "I. Architecture (Feature-First)"
- "II. Strict TypeScript" + parts of "IX. Security" (Zod validation) → "II. Type
  Safety" (expanded with shared API-contract types requirement)
- "VII. Performance" → "V. Performance" (renumbered, content preserved)
- "IX. Security" → "VI. Security" (renumbered; SQL-injection and auth requirements
  made explicit as standalone bullets rather than embedded prose)
- "VIII. Testing Standards" → "VII. Testing" (renumbered; store/hook/API test tiers
  made explicit as standalone bullets)
- "X. Documentation Requirements" → "VIII. Documentation" (renumbered; Spec Kit
  lifecycle requirement — spec/plan/tasks/implementation/testing/documentation —
  added explicitly)
- "XI. Code Review Standards" → split: PR/branch/commit mechanics moved to new
  "IX. Git Workflow"; the Constitution Check / gate-passing requirement moved to
  "X. Quality Gates"
- "XVII. Production Readiness Requirements" → merged into "X. Quality Gates"

**Added Principles**:
- III. Database (PostgreSQL + PostGIS, Prisma-only ORM, spatial indexes, geometry
  types, migrations, Route-Handler-only DB access)
- IV. GIS Principles (PostGIS-only persisted spatial calculations, client-side math
  limited to transient UI feedback, supported geometry types, SRID/EPSG:4326
  consistency, topology integrity)
- IX. Git Workflow (feature branches, Conventional Commits, mandatory PR review,
  no direct commits to main)

**Removed Sections (as standalone Core Principles)**:
- "IV. State Management Rules", "VI. Accessibility", "XIII. Naming Conventions",
  "XIV. Error Handling Strategy", "XV. Logging Strategy", "XVI. Responsive-First
  Design", "XVIII. AI Integration Guidelines" are no longer standalone numbered
  Core Principles. Their substantive rules are NOT deleted — they are preserved
  verbatim in spirit under the new "Additional Engineering Standards" section so no
  enforceable rule is lost, while the ten numbered Core Principles now map exactly
  to the ten mandatory categories required for this project phase.

**Added Sections**:
- "Additional Engineering Standards" (new, between Core Principles and Technology
  Stack) — preserves State Management, Accessibility, Naming Conventions, Error
  Handling, Logging, Responsive Design, and AI Integration rules from v2.0.0.

**Templates Reviewed**:
- `.specify/templates/plan-template.md` ✅ — Constitution Check gate is derived
  dynamically from this file; no hardcoded principle references to update
- `.specify/templates/spec-template.md` ✅ — technology-agnostic; no changes needed
- `.specify/templates/tasks-template.md` ✅ — generic phase/task structure; already
  supports database/migration, validation, security, and testing task categories
  referenced by the updated principles
- `.specify/templates/commands/` — directory does not exist; skipped
- `README.md` / `docs/quickstart.md` — not present at repo root; skipped

**Deferred TODOs**: None — all placeholders resolved. RATIFICATION_DATE preserved
from v1.0.0 (2026-06-29, the project's original adoption date).
-->

# SpatialMind AI Constitution

## Core Principles

### I. Architecture (Feature-First)

Code MUST be organized by feature, not by technical layer. Each feature directory
under `src/features/<name>/` MUST own its `components/`, `hooks/`, `services/`,
`store/`, `types/`, and `__tests__/`. Cross-feature imports MUST go through the
feature's public barrel (`index.ts`) only. Shared, feature-agnostic code lives in
`src/shared/`.

- Components MUST be presentational only: they render markup and wire up event
  handlers, and MUST NOT contain data fetching, business logic, or direct store
  mutation logic inline.
- Business logic MUST live in named custom hooks (`hooks/`) for client-side
  behavior, or in `services/` functions for anything that talks to a backend.
- State mutations MUST occur only through Zustand store actions — no component or
  hook may reach into a store's internals and mutate state directly.
- Server communication MUST go only through the feature's service layer
  (`services/*.ts`); components and hooks MUST NOT call `fetch`, a Route Handler,
  or Prisma directly.
- **Route Handlers (`app/api/**/route.ts`) are the only code in the entire codebase
  permitted to import the Prisma client or otherwise touch the database.** No
  component, hook, store, or service file may import `@prisma/client`.

**Rationale**: Feature isolation enables parallel development and safe removal of
entire capabilities. Confining database access to Route Handlers gives one
enforceable boundary for authentication, validation, and connection-pool
management in an application otherwise rendered mostly on the client.

### II. Type Safety

All code MUST be written in TypeScript in `strict` mode. `tsc --noEmit` MUST report
zero errors before merge.

- The `any` type MUST NOT be used; `unknown` with type narrowing, generics, or
  discriminated unions MUST be used instead.
- `@ts-ignore` and `@ts-expect-error` MUST NOT be used to silence type errors — the
  error MUST be fixed at its source.
- Every Route Handler MUST validate its input (body, query params, path params)
  with a **Zod** schema before the value is used for anything, including a
  database query.
- API contracts MUST use shared types: a Zod schema (with `z.infer`) or a shared
  type module MUST be the single source of truth for a request/response shape,
  imported by both the Route Handler and the client `services/` function that
  calls it. Hand-duplicated shapes on each side of an API boundary are forbidden.

**Rationale**: Type safety is the primary defense against class-wide runtime bugs
in a geospatial domain where coordinate types, projections, and feature schemas
are easily confused. Shared, schema-derived types keep the client and server sides
of an API from silently drifting apart.

### III. Database

**PostgreSQL with the PostGIS extension** is the only persistence layer.
**Prisma** is the only ORM permitted.

- Every column storing geometry or used in a spatial predicate MUST have a
  spatial index (GiST) defined in the Prisma schema/migration.
- Geometry MUST be stored using PostGIS geometry types (`Geometry`, `Point`,
  `LineString`, `Polygon`, `MultiPolygon`), never decomposed into separate
  latitude/longitude float columns.
- All schema changes MUST go through Prisma Migrate (`prisma migrate dev` /
  `deploy`); manual DDL against a shared or production database is forbidden.
- Raw SQL is permitted only via Prisma's parameterized `$queryRaw`/`$executeRaw`
  tagged templates for PostGIS functions the Prisma client does not expose
  natively — string-concatenated SQL is forbidden under all circumstances.
- Per Principle I, only Route Handlers may open a Prisma Client instance.

**Rationale**: A single ORM and a single migration path keep the schema
reproducible across environments; mandatory spatial indexes are what make
PostGIS queries perform at enterprise data volumes rather than degrading to full
table scans.

### IV. GIS Principles

- Any spatial calculation whose result is persisted or used to drive an
  authoritative server-side query result (area, distance, intersection,
  buffering, containment) MUST be computed in PostGIS (`ST_Area`, `ST_Distance`,
  `ST_Intersects`, `ST_Buffer`, etc.), never recomputed in JavaScript as the
  system of record.
- Client-side geometry math (Leaflet/Turf.js) is permitted **only** for
  transient UI feedback — a draw-tool preview, a live measurement readout — that
  is never treated as the persisted source of truth.
- Supported geometry types are **Point, LineString, Polygon, and MultiPolygon**
  (plus their PostGIS `Multi*` counterparts where applicable). Support for any
  additional geometry type requires a constitution amendment.
- SRID MUST be stored and asserted consistently. **EPSG:4326 (WGS84)** is the
  default SRID for all stored geometry; a feature MUST NOT introduce a different
  SRID without documenting the transform and validating it end-to-end.
- Topology integrity MUST be preserved: geometry MUST be validated
  (`ST_IsValid`) before persistence, and an operation that could produce invalid
  topology (self-intersections, unclosed rings) MUST be rejected or explicitly
  repaired (`ST_MakeValid`) — it MUST NOT be stored invalid silently.

**Rationale**: Centralizing authoritative spatial math in PostGIS avoids the
classic GIS bug class of client and server disagreeing on an area or distance
because of floating-point or projection differences, and a fixed default SRID
prevents silent coordinate-system mismatches across features.

### V. Performance

- Any module that depends on browser-only globals or is heavy (Leaflet,
  Turf.js, Proj4js, chart libraries) MUST be loaded via `next/dynamic` with
  `{ ssr: false }`, lazy-loaded at its point of use, and MUST NOT be part of the
  initial route bundle.
- Server state MUST be cached via **TanStack React Query**; query keys MUST be
  centralized per feature (`services/queryKeys.ts`) to prevent cache collisions.
- `@next/bundle-analyzer` MUST be run before merging any PR that adds a new
  dependency over 20 KB gzipped.
- Components MUST avoid unnecessary re-renders: memoize expensive map
  computations, keep Zustand selectors narrow, and avoid subscribing to more
  store state than a component actually renders.

**Rationale**: Mapping and spatial-analysis libraries are heavy; eager loading
and unmemoized map re-renders destroy Time-to-Interactive and frame rate on the
low-bandwidth or field-network conditions enterprise GIS users often operate
under.

### VI. Security

- Every response MUST carry CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Strict-Transport-Security`, and a restrictive `Permissions-Policy`. The CSP
  MUST NOT include `'unsafe-eval'` in production.
- Every Route Handler MUST validate and parse its input with Zod (Principle II)
  before use — untyped `request.json()` output MUST NOT be trusted as-is.
- **SQL injection prevention**: all database access MUST go through Prisma's
  query builder or a parameterized `$queryRaw` tagged template (Principle III).
  String-concatenated SQL is forbidden without exception.
- **Authentication MUST be enforced** on every protected Route Handler before any
  handler logic runs; there is no protected endpoint that skips the auth check
  "temporarily."
- Secrets MUST be read from environment variables server-side only and MUST
  NEVER be committed to version control, embedded in a client component, or
  exposed via a `NEXT_PUBLIC_*` variable.

**Rationale**: Explicit, non-negotiable rules for injection prevention and
auth-before-handler-logic close the two attack surfaces most common in
data-backed mapping platforms that expose both public tiles and private,
authenticated spatial data.

### VII. Testing

Every feature MUST include, at minimum:

- **Unit tests** (Vitest) for every custom hook and pure utility function.
- **Store tests** for every Zustand store's actions and selectors.
- **Hook tests** for custom hooks with async behavior or side effects.
- **Component tests** (Vitest + React Testing Library) for every component with
  conditional rendering, user interaction, or ARIA state.
- **API tests** for every Route Handler, covering validation failure, success,
  and error-response paths.
- **Integration tests** covering the feature's primary user journey end-to-end
  within the app shell.
- **Accessibility checks** for interactive components (axe/RTL a11y assertions),
  against a WCAG 2.2 AA baseline.

Tests MUST be co-located under the feature's `__tests__/` directory and MUST NOT
share mutable global state between test cases. A feature MUST NOT be marked
complete while any of the above tiers relevant to it is missing.

**Rationale**: In a platform with overlapping map layers, async data, Zustand
stores, and a database-backed API, each tier catches regressions at the level
where they actually originate — a store bug, a hook race condition, or an
unvalidated API input each need a different test shape to be caught reliably.

### VIII. Documentation

- Every exported function, hook, service, and store action MUST carry a
  single-line JSDoc summary stating what it does and any non-obvious constraint
  (units, coordinate reference system, side effects).
- Architecture decisions that deviate from a mandated pattern in this
  constitution MUST be documented in the relevant feature's `plan.md` Complexity
  Tracking table.
- Every feature REQUIRES the full Spec Kit lifecycle before being considered
  done: `spec.md`, `plan.md`, `tasks.md`, implementation, tests (Principle VII),
  and a feature-level `README.md` documenting purpose, public API, a usage
  example, and known limitations.

**Rationale**: Undocumented coordinate/unit assumptions are the single most
common source of silent GIS bugs; requiring the full spec-to-documentation
lifecycle per feature keeps a large, multi-version codebase auditable as it
grows.

### IX. Git Workflow

- All work MUST happen on a feature branch (e.g. `NNN-feature-name`); direct
  commits to `main` are forbidden.
- Commits MUST follow **Conventional Commits** (`feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`, etc.).
- Every change to `main` MUST go through a **Pull Request** with at least one
  peer review before merge; changes to this constitution or to a feature's
  public barrel (`index.ts`) contract REQUIRE two reviews.
- `main` MUST always remain in a deployable state — a PR MUST NOT be merged
  while any Quality Gate (Principle X) is failing.

**Rationale**: A branch-and-review discipline tied to Conventional Commits keeps
history readable and changelog-generation automatable, and protects `main` as
the one branch that must always be safe to deploy.

### X. Quality Gates

Every PR MUST pass all of the following before merge, with no exception absent a
documented Complexity Tracking justification:

- **TypeScript**: `tsc --noEmit` — zero errors.
- **ESLint**: `eslint src --max-warnings 0` — zero errors or warnings.
- **Tests**: all applicable tiers from Principle VII passing.
- **Production build**: `next build` MUST complete successfully with no errors.

In addition: a Lighthouse Accessibility score ≥ 90 MUST be verified on any new
route; all security headers from Principle VI MUST be confirmed present on the
deployed response; and no `TODO` marking unfinished error handling or a
stubbed-out API call may remain in place of a real Route Handler.

**Rationale**: A single enumerated, mechanically-checked gate list is what turns
"production-ready" from a subjective judgment call into a verifiable checklist
before every merge.

## Additional Engineering Standards

These standards are mandatory and enforceable exactly like the Core Principles
above; they are grouped separately because they are operational conventions
rather than one of the ten required top-level categories.

### State Management

Client/UI state (theme, sidebar state, modal visibility, map viewport, selected
tool) MUST be managed with Zustand. Server state MUST be fetched, cached, and
synchronized with TanStack React Query — it MUST NOT be copied into a Zustand
store as a shadow cache. Mutations MUST use `useMutation` with explicit
`onSuccess` cache invalidation, not manual refetch calls scattered across
components.

### Accessibility

Every interactive element MUST be keyboard-navigable with a visible focus
indicator. Color contrast and all other success criteria MUST meet WCAG 2.2 AA.
Map controls (zoom, scale, layer switcher, draw tools) MUST carry ARIA labels
reflecting their action, not their icon. Live-updating regions (coordinate
readout, async status) MUST use `aria-live="polite"`. `shadcn/ui` (Radix)
primitives MUST be used for interactive controls in preference to hand-rolled
HTML.

### Naming Conventions

Components MUST be `PascalCase` matching their filename. Hooks MUST be named
`useX` in `camelCase`. Zustand stores MUST be named `useXStore` in file
`xStore.ts`. Route Handlers MUST live at `route.ts` under a noun-pluralized,
kebab-case directory reflecting the resource (`app/api/map-layers/route.ts`).
Types/interfaces MUST be `PascalCase` with no `I`-prefix. Booleans MUST be
prefixed `is`/`has`/`should`.

### Error Handling

Every async boundary (Route Handler, React Query fetcher, Leaflet event
handler) MUST catch and classify its own errors. Route Handlers MUST return a
typed error shape (`{ error: { code, message } }`) with an appropriate HTTP
status, never a bare 500 with a leaked stack trace. Any feature that can fail
visibly to the user MUST render an explicit error state with a recovery action
where one exists. React error boundaries MUST wrap each top-level feature
mounted in the dashboard shell.

### Logging

Client-side, only actionable warnings/errors MUST be logged via a shared
`shared/lib/logger.ts` wrapper, not raw `console.*` calls. Route Handlers MUST
log every request's method, path, status code, and duration in structured
(JSON) form. Logs MUST NOT include secrets, full PII-bearing request bodies, or
API keys. Debug-only logging MUST use the logger's `debug` level, a no-op in
production builds.

### Responsive Design

Layouts MUST be authored mobile-first using Tailwind's default breakpoint for
the smallest viewport, remaining fully functional at 320 px width with no
horizontal scroll. Breakpoint-dependent JavaScript behavior MUST use a shared
`useBreakpoint`/`useMediaQuery` hook. Touch targets MUST be at least 44×44 px
on touch-capable viewports.

### AI Integration (Future Features)

Any future AI-powered feature MUST treat the LLM provider as a third-party API:
all model calls MUST be issued from a Route Handler, never the client. Streaming
responses MUST use the Vercel AI SDK's streaming primitives. AI-generated
content that results in a state mutation MUST require explicit user
confirmation before the mutation is applied. Prompts and system instructions
MUST be version-controlled alongside the feature's code.

## Technology Stack

The following technologies are **mandatory** for all features. Alternatives
require a written rationale and governance approval (see Amendment procedure
below).

| Concern | Mandated Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI Library | React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui (Radix UI primitives) |
| Mapping | React Leaflet (Leaflet, dynamic import, SSR disabled) |
| Global/UI State | Zustand v5+ |
| Server State / Caching | TanStack React Query v5+ |
| Validation | Zod (mandatory for every API input; Principles II, VI) |
| Backend-for-Frontend | Next.js Route Handlers (`app/api/**/route.ts`) — the only DB-accessing code (Principle I) |
| Database | PostgreSQL + PostGIS extension (Principle III) |
| ORM | Prisma — the only ORM (Principle III) |
| Unit / Component Testing | Vitest + React Testing Library |
| Linting | ESLint (`next/core-web-vitals` + `typescript-eslint`), zero warnings |

Spatial-analysis (Turf.js) and projection (Proj4js) libraries are pre-approved
for transient, client-side UI feedback under Principles IV and V (dynamic
import, `ssr: false`) but MUST NOT be used to compute persisted or authoritative
spatial results. No additional state management libraries, CSS frameworks,
mapping libraries, ORMs, or database engines may be introduced without amending
this constitution.

## Governance

This constitution supersedes all other development guidelines. Where conflict
exists between this document and any other convention, this document prevails.

**Amendment procedure**:
1. Author opens a PR with changes to this file and a completed Sync Impact
   Report.
2. At least one peer review is required; changes to Core Principles require
   two.
3. Dependent templates (plan, spec, tasks) MUST be reviewed for consistency in
   the same PR; update them if a principle change affects their content.
4. Bump the version per the semantic versioning rules below.

**Compliance**: All PRs MUST include a "Constitution Check" confirming no
principle is violated. Complexity exceptions MUST be documented in the plan's
Complexity Tracking table with a justification.

**Versioning policy**:
- PATCH — wording clarifications, typo fixes, non-semantic refinements.
- MINOR — new principle or section added, or existing guidance materially
  expanded, with no existing principle redefined or weakened.
- MAJOR — a principle removed, redefined (e.g. a compliance bar raised or
  lowered), or a technology/architecture mandate changed in a way that can
  require existing code to change.

**Version**: 3.0.0 | **Ratified**: 2026-06-29 | **Last Amended**: 2026-07-22
