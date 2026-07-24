# Research: Dashboard, Reporting & Analytics (008)

**Input**: `specs/008-dashboard-analytics/spec.md`

**Context**: This feature ships into a codebase that already contains:
005/007 (spatial analysis, `AnalysisRun` + PostGIS-computed statistics),
006-collaboration (fully specced, 0% implemented — `ProjectMember`/
`assertProjectRole` roles, append-only `Activity` audit model), and an
existing client feature module literally named `src/features/dashboard/`
— the **application shell** (`DashboardLayout`, `Navbar`, `Sidebar`,
`StatusBar`), unrelated to the "Dashboard" business entity this spec
describes. Every decision below accounts for all three.

---

## Decision 0: Naming — the new feature module is `src/features/dashboards/` (plural), never `dashboard`

**Decision**: This feature's client module is `src/features/dashboards/`
(plural). The existing `src/features/dashboard/` (singular — the app
shell: `DashboardLayout.tsx`, `Navbar`, `Sidebar`, `StatusBar`,
`useSidebar`, `useBreakpoint`) is **not renamed, not touched, and not
reused as a home for this feature's code** — it is a different concern
(page chrome) that happens to share a name with this spec's "Dashboard"
business entity.

**Rationale**: Constitution Principle I requires feature isolation by
directory; silently dropping "Dashboard, Reporting & Analytics" code into
the existing `dashboard/` directory would conflate the app shell with a
business feature and make `dashboard/`'s barrel ambiguous. Pluralizing is
the smallest possible naming change that resolves the collision without
renaming an already-shipped, widely-imported module.

**Alternatives considered**: Renaming the existing `dashboard/` shell
module and taking over the singular name (rejected — touches a
already-implemented, unrelated feature purely for naming convenience,
violating "do not redesign existing architecture"); naming this feature
`analytics/` instead (rejected — the spec's own vocabulary and Key
Entities are "Dashboard"-centric; `dashboards/` is the more literal,
discoverable name and avoids implying the feature is analytics-only when
US1/US3/US7/US8 are equally about the builder/layout/sharing/template
mechanics).

---

## Decision 1: Widget framework — one `DashboardWidget` row per widget, a discriminated `type` + `config` JSON, not one table per widget type

**Decision**: Every widget on a dashboard (Map, Statistics, Table, Chart-
variant, Gauge, Metric Card, Text, Image, HTML) is one row in a single
`DashboardWidget` table, discriminated by a `type` column, with a `config`
JSON column holding the type-specific configuration (data-source binding,
chart sub-type, display options). Client-side, one `WidgetRenderer`
component dispatches to a per-type React component based on `type`.

**Rationale**: Twelve widget types sharing 90% of their structure
(position, size, title, data-source reference, per-widget filter) is
exactly the shape 005/007 already resolved the same way for twenty-plus
analysis operation types (`AnalysisRun.operationType` + `parameters`
JSON) — reusing that established pattern (Constitution Principle I,
"reuse existing architecture") avoids twelve near-duplicate tables/
repositories/routes for what is structurally one concept with variant
configuration.

**Alternatives considered**: One Prisma model per widget type (rejected —
12 near-identical tables, 12 repositories, and a `UNION`-shaped query
every time "all widgets on this dashboard" is needed, for no benefit
over a discriminated `type` + JSON `config`); a fully generic
"widget plugin registry" with dynamically loaded widget modules
(rejected — over-engineered for 12 known, fixed types; YAGNI).

---

## Decision 2: Grid layout engine — `react-grid-layout` (new dependency), not a hand-rolled CSS grid

**Decision**: Adopt `react-grid-layout` for drag/resize/responsive grid
behavior (US3). Widget position/size are stored as its `{ x, y, w, h }`
layout-item shape, once per breakpoint tier (desktop/tablet/mobile) so
FR-010's responsive reflow is a distinct, explicit saved layout per tier
rather than a single layout CSS-media-queried into readability.

**Rationale**: `react-grid-layout` is the de facto standard for exactly
this use case (draggable, resizable, responsive dashboard grids — used by
Grafana-style tools), has no runtime dependency on a specific chart/data
library, and hand-rolling equivalent drag/resize/collision/responsive-
reflow logic (FR-008/FR-009/FR-010) is a materially larger, harder-to-get-
right undertaking than adopting a mature, widely-used library. No
existing dependency in this codebase provides this capability.

**Alternatives considered**: `dnd-kit` + a hand-rolled CSS grid (rejected
— `dnd-kit` handles drag mechanics only; resize-with-collision and
responsive-breakpoint layout logic would still need to be built from
scratch, effectively re-deriving `react-grid-layout`); CSS Grid with
manual drag via native HTML5 drag-and-drop (rejected — no resize
support, no collision handling, materially worse UX for the exact
scenario spec.md's US3 describes).

---

## Decision 3: Chart library — Recharts (new dependency), via shadcn/ui's chart wrapper already anticipated by this codebase's UI system

**Decision**: Adopt Recharts for Bar/Line/Area/Pie charts and the Gauge
widget (a radial/progress variant built on Recharts primitives).

**Rationale**: This codebase already standardizes on shadcn/ui (Radix
primitives) for every interactive control (Constitution's Technology
Stack table); shadcn/ui's own official chart components are a thin
wrapper over Recharts, so choosing Recharts lets chart widgets be styled
and composed with the exact same `shadcn/ui` conventions (theming,
Tailwind tokens, dark/light mode) every other component in this codebase
already uses, rather than introducing a second, visually inconsistent
charting paradigm. Recharts is React-native (no imperative canvas/SVG
management to bridge), tree-shakeable per chart type, and has no
dependency on D3's full surface.

**Alternatives considered**: Chart.js (rejected — canvas-based and
imperative, doesn't integrate with shadcn/ui's component-composition
model, and canvas charts are harder to make accessible per FR's
accessibility requirements than Recharts' SVG output); D3 directly
(rejected — far more implementation effort for the same four chart types
plus a gauge, and this codebase has no existing D3 usage to build on);
Visx/Nivo (rejected — no existing shadcn/ui integration precedent the
way Recharts has, and no other justification to prefer them over the
already-shadcn-aligned choice).

---

## Decision 4: Map Widget reuses the existing `map` feature's `MapContainer`, dynamically imported — not a second Leaflet integration

**Decision**: The Map Widget renders the existing `src/features/map`
module's `MapContainer` (or a props-configurable variant of it) scoped to
a chosen layer/project, consuming `map`'s public barrel only — never
reimplementing Leaflet setup, tile layers, or `react-leaflet`
wiring a second time.

**Rationale**: Constitution Principle I forbids reaching into another
feature's internals, but explicitly permits (and this codebase already
practices, e.g. 007's reuse of `database`'s `exportLayerAsGeoJson`)
consuming a feature's public barrel; a second, parallel Leaflet
integration inside `dashboards/` would violate "reuse existing
architecture" for the single most expensive dependency (Leaflet +
`react-leaflet` + Leaflet-Geoman) already loaded elsewhere in the app.

**Alternatives considered**: A lightweight, read-only "mini-map" built
from scratch for widget use (rejected — duplicates Leaflet setup and
dynamic-import/`ssr:false` wiring the `map` feature already solved
correctly per Constitution Principle V).

---

## Decision 5: Statistics/Analytics engine — reuse 007's `AnalysisRun`/PostGIS statistics operations as the data source; add one new lightweight aggregation path only for platform-level counts

**Decision**: A Statistics/Metric/Chart widget bound to spatial data
(feature count, area, length, density, etc.) queries the **same** PostGIS
aggregate functions 007 already introduced (`buildStatisticsSql` and
friends in `analysisOperations.ts`) — either by referencing a pinned,
already-computed `AnalysisRun` result, or by issuing a live read-only
call to the same builder functions for an always-current value. This
feature adds exactly one new, narrow aggregation path: **platform-scoped
counts** not already exposed by any existing repository (dashboard count,
widget count, storage bytes used) via small, indexed `COUNT`/`SUM`
queries added directly to a new `dashboardAnalyticsRepository.ts`.

**Rationale**: Constitution Principle IV requires authoritative spatial
aggregates to be computed in PostGIS, and 007 already built exactly the
function set this feature's spatial widgets need — recomputing them a
second time inside `dashboards/` would be a direct architecture
duplication the "reuse existing architecture" instruction forbids.
Platform-level counts (storage, dashboard/widget counts) have no existing
home because no prior feature needed them, so a small, new, narrowly-
scoped repository is the correct minimal addition, not a violation.

**Alternatives considered**: A separate, dashboard-owned copy of every
statistics SQL builder (rejected — direct duplication of 007's already-
approved work); computing spatial aggregates client-side with Turf.js for
dashboard widgets (rejected outright by Constitution Principle IV —
persisted/authoritative spatial results must come from PostGIS).

---

## Decision 6: Live analytics refresh — React Query polling as the guaranteed baseline; 006's SSE channel as an optional enhancement (same shape as 007 Decision 5/6)

**Decision**: Data-driven widgets refresh via React Query's
`refetchInterval` (default aligned with SC-002's 30-second bound),
identical in spirit to 007 research.md's Decision 5/6 for analysis-job
polling. Where a dashboard is viewing a project that already has
006-collaboration's SSE stream (`GET /api/projects/:projectId/stream`)
available, a widget MAY additionally subscribe to that existing channel
for faster-than-30-second updates on the specific event types 006 already
publishes (feature/layer changes) — additive only, never required.

**Rationale**: Directly reuses two already-established patterns instead
of inventing a third real-time mechanism: 007's polling-as-baseline
philosophy (portable across every deployment target) and 006's existing
SSE infrastructure (rather than building a second live-update channel).
No new real-time transport is introduced by this feature.

**Alternatives considered**: A new WebSocket-based live-update channel
dedicated to dashboards (rejected — 006 already reserves real-time
transport decisions for presence/live-cursor use cases; a second
mechanism for the same "something changed, refresh" purpose is
unjustified duplication); polling-only with no SSE enhancement at all
(considered acceptable and is the fallback — SSE is explicitly optional).

---

## Decision 7: Dashboard/widget/report permissions — extend 006's `assertProjectRole`, plus one new "dashboard share" grant layered on top

**Decision**: Authorization has two layers, in order: (1) 006-
collaboration's existing `assertProjectRole` — a user must be at least a
project Viewer to see any dashboard in that project at all, and at least
an Editor to create/modify one; (2) a new, dashboard-specific
`DashboardShare` grant (view/edit) or a `visibility: "public"` flag that
can *broaden* access beyond a user's base project role (e.g., a project
Viewer can be granted "edit" on one specific dashboard) but never
*narrows* it below what their project role already allows.

**Rationale**: Directly reuses 006's role infrastructure exactly as 007
already chose to (research.md precedent), while the spec's own US7
requires a capability 006's project-level roles don't provide on their
own — sharing one specific dashboard with one specific person at a
specific permission, independent of that person's broader project role.
Layering a narrow, dashboard-scoped grant on top of (never replacing)
project roles is the minimal addition that satisfies FR-023/024/026
without inventing a parallel permission system.

**Same sequencing dependency as 007**: this still depends on 006's
`assertProjectRole`/`ProjectMember` landing (or being implemented as a
shared prerequisite) — carried forward, not re-litigated, in this
feature's Complexity Tracking.

**Alternatives considered**: Dashboard permissions entirely independent
of project roles (rejected — a user who loses project access but keeps a
stale dashboard share would retain access to project data through the
dashboard, a security hole); reusing `AnalysisRun`'s pattern of "any
project member reads, Editor+ writes" with no per-dashboard override at
all (rejected — does not satisfy US7's explicit "share with a specific
person at a specific permission" and "public" requirements).

---

## Decision 8: Public dashboards are an authenticated-visibility flag, not a new anonymous-access surface

**Decision**: `Dashboard.visibility: "private" | "public"` is checked
*after* `getCurrentUser` already resolved an authenticated session — a
"public" dashboard is reachable by any signed-in platform user's request,
never by an unauthenticated one (per spec.md's Assumptions/FR-025). No
new unauthenticated route, token-based public-link mechanism, or
anonymous session concept is introduced.

**Rationale**: Matches the spec's explicit resolution of this exact
question; keeps every dashboard-serving Route Handler on the codebase's
one existing authentication seam (`getCurrentUser`) rather than adding a
second, weaker auth path for "public" requests.

**Alternatives considered**: A signed public-link token bypassing
authentication (rejected — explicitly out of scope per spec.md's
resolved Assumption; would also be a new security surface — token
leakage, revocation — disproportionate to this phase's requirements).

---

## Decision 9: Export engine — client-side only, extending 007's Shapefile-writer precedent with three more narrowly-scoped new dependencies

**Decision**: Every export path (whole-dashboard, chart/widget image,
table data, PDF/Excel/CSV/HTML report) runs **client-side**, producing a
Blob for direct download — no server-side file generation or storage, per
007's already-established Decision 10 philosophy (no file-storage
mechanism exists anywhere in this codebase to build on). This requires
three new, narrow, well-established dependencies beyond what 007 already
introduces:

- **PDF** (whole-dashboard/report export): `jsPDF` + `html2canvas` —
  renders the dashboard/report DOM to a canvas, embeds it in a generated
  PDF. The same `html2canvas` capture also serves **chart/widget image
  export** (FR-031) with no additional dependency.
- **Excel**: `xlsx` (SheetJS) — the de facto standard for generating
  `.xlsx` client-side, used for both Report-as-Excel (US5) and
  Table-Widget-as-data-file export (US9) where the target format is
  Excel rather than CSV.
- **CSV / HTML report**: no new dependency — hand-rolled serialization,
  identical in spirit to 007's hand-rolled KML serializer (tabular CSV
  and a self-contained HTML document are both simple enough not to
  justify a dependency).

**Rationale**: Keeps this feature's export behavior consistent with 007's
already-reviewed export philosophy (client-driven, no new server file-
storage subsystem) while acknowledging PDF/Excel generation are
capabilities nothing in this codebase can currently do at all — three
small, single-purpose, browser-compatible libraries are the minimal
addition that satisfies FR-016/FR-030/FR-031/FR-032, each flagged in this
plan's Complexity Tracking exactly as 007 flagged its one new dependency.

**Alternatives considered**: Server-side headless-browser PDF rendering
(Puppeteer/Playwright) for higher-fidelity PDF output (rejected — a
headless browser runtime is a heavy, environment-sensitive dependency
that does not run uniformly across all five required deployment targets,
especially constrained serverless environments, and is disproportionate
next to the lighter client-side alternative that already satisfies
FR-016); a single "universal" export library covering PDF+Excel+image
(rejected — no such single well-established library exists without
pulling in far more surface than needed; three focused libraries is a
smaller total footprint than one large one).

---

## Decision 10: Scheduled Reports — DB-backed due-time rows + one idempotent "run due reports" endpoint triggered by each platform's own scheduler; no in-app job queue

**Decision**: `ScheduledReport` stores a recurrence rule and a computed
`nextRunAt`. One Route Handler, `POST /api/reports/scheduled/run-due`, is
idempotent and safe to call repeatedly: it finds every `ScheduledReport`
whose `nextRunAt` has passed, generates a `Report` for each (reusing
Decision 9's client-unavailable-here problem is sidestepped because
*scheduled* report generation happens server-side, deterministically, at
the moment the endpoint runs — see note below), advances `nextRunAt`, and
returns. Each of the five deployment targets triggers this endpoint via
its own native scheduling capability (Vercel Cron, Railway Cron,
a host crontab for Docker, AWS EventBridge Scheduler, or Supabase's
`pg_cron`) — documented per-target in Deployment Notes, not built into
this application.

**Important nuance vs. Decision 9**: scheduled report generation cannot
be "client-side" the way on-demand export is, because no browser is open
when a schedule fires. This endpoint therefore performs report
*generation* server-side for the CSV/HTML/Excel formats (straightforward
server-side serialization of already-server-held data), while PDF
generation — which depends on rendering the dashboard's visual DOM via
`html2canvas` — is **not available for scheduled reports** in this phase;
a scheduled report is restricted to CSV/Excel/HTML, and PDF remains an
on-demand, client-side-only export. This restriction is recorded as an
Assumption addition below (spec.md did not explicitly resolve this, but
it follows directly from spec.md's approved "in-app only" delivery model
and Decision 9's client-side PDF approach — no browser is present to
render a PDF when a schedule fires).

**Rationale**: Avoids introducing a job-queue/worker subsystem (the exact
concern 007 research.md Decision 5 already ruled out for a different
reason — portability); reuses the "external platform scheduler calls one
idempotent endpoint" pattern, which is the only scheduling approach that
is genuinely portable across Vercel/Railway/Docker/AWS/Supabase without
picking a platform-specific mechanism as this application's only option.

**Alternatives considered**: An in-process `setInterval`/long-lived timer
inside the Next.js server (rejected — does not work reliably on
serverless targets where the process is not guaranteed to stay warm,
and duplicates work if multiple instances run the same timer); a full
job-queue product (rejected per the same reasoning 007 already
established — disproportionate new infrastructure for this need).

---

## Decision 11: Audit logging reuses 006's `Activity` model — extended `targetType` values, no new audit table

**Decision**: Every dashboard create/edit/delete/share/export/report
action (FR-042) writes one `Activity` row (006-collaboration's existing
append-only, project-scoped audit entity), adding `"dashboard"`,
`"widget"`, `"report"` to its `targetType` enum and reusing its existing
`action` verbs (`create`/`edit`/`delete`/`share`/`export`) — no new
verb is invented where an existing one already fits.

**Rationale**: Direct continuation of 007's research.md Decision 4,
which already established that this codebase's one project-scoped audit
trail is `Activity`, not a per-feature audit table.

**Alternatives considered**: A dashboard-specific `DashboardAuditLog`
table (rejected — duplicates `Activity`'s exact purpose, fragmenting "what
happened in this project" the same way 007 already rejected).

---

## Decision 12: Caching strategy — `AnalyticsSnapshot` as a short-TTL, compute-on-stale-read cache table; no new cache infrastructure (Redis, etc.)

**Decision**: `AnalyticsSnapshot` stores a pre-computed aggregate result
(e.g., "this project's full statistics summary") keyed by
`(projectId, snapshotType)` with a `computedAt` timestamp. A read for
that aggregate checks whether the existing snapshot is older than a
short TTL (aligned with SC-002's 30-second freshness bound); if stale, it
recomputes synchronously (via Decision 5's existing PostGIS/repository
calls), writes the new snapshot, and returns it — otherwise it serves the
cached row directly, avoiding a repeated expensive aggregate query for
every dashboard viewer within the TTL window.

**Rationale**: Satisfies the Performance section's "efficient
aggregation"/"caching" requirements with a plain Postgres table read
instead of introducing a new caching layer (Redis, in-memory LRU shared
across serverless instances is impossible anyway) — consistent with
research.md's repeated theme across 007 and this feature of preferring
"one more indexed Postgres table" over new infrastructure whenever it
meets the requirement.

**Alternatives considered**: An external cache (Redis via a Marketplace
integration) — rejected as disproportionate; this feature's freshness
bound (30 seconds) and query cost do not require a dedicated cache
service, and a new external dependency would need to work identically
across all five deployment targets, which a Postgres-table-based cache
already does without extra provisioning.

---

## Decision 13: Widget lifecycle and error handling — per-widget error boundary, "data source unavailable" as data, not an exception

**Decision**: `WidgetRenderer` (Decision 1) wraps every individual widget
in its own React error boundary, so one widget's rendering failure never
takes down the rest of the dashboard. A widget whose bound data source
(layer, `AnalysisRun` result) has been deleted receives a well-typed
"unavailable" response from its data hook (not a thrown error) and
renders the FR-040 "data source no longer available" state as an
ordinary render branch.

**Rationale**: Directly satisfies spec.md's Edge Cases ("data source
unavailable" and "widget failure isolation" are both explicit
requirements) and matches Constitution's Additional Standards (Error
Handling: "React error boundaries MUST wrap each top-level feature
mounted in the dashboard shell" — this feature applies that same
philosophy one level deeper, per-widget, since a dashboard's whole value
is that many independent widgets coexist).

**Alternatives considered**: One error boundary around the whole
dashboard grid (rejected — one bad widget would blank the entire
dashboard, failing FR-040/spec Edge Cases' explicit isolation
requirement).

---

## Decision 14: Accessibility — Recharts' SVG output plus explicit data-table fallbacks; keyboard-operable grid via `react-grid-layout`'s existing a11y hooks

**Decision**: Every chart widget renders an adjacent, visually-hidden
(`sr-only`) or toggleable data-table representation of the same data, so
a screen reader user gets the underlying numbers even though a chart is
inherently a visual medium. Grid drag/resize (Decision 2) exposes a
keyboard-operable alternative (arrow-key move, `+`/`-` or a dedicated
resize control) alongside pointer drag, since `react-grid-layout`'s
pointer-only interaction is not keyboard-accessible by default and must
be supplemented, not assumed.

**Rationale**: Satisfies spec.md's Accessibility section (keyboard
navigation, screen reader support) and Constitution's existing
Accessibility standard (WCAG 2.2 AA) for a widget type — charts — that
has no accessible-by-default representation in any charting library,
Recharts included.

**Alternatives considered**: Relying on Recharts' default ARIA output
alone (rejected — insufficient on its own for a screen reader user to
extract the actual data values, only the chart's presence); mouse-only
grid interaction with no keyboard alternative (rejected outright by
FR/Constitution's keyboard-accessibility requirement).

---

## Decision 15: Security model — same five-layer Route Handler shape as every prior feature, extended with dashboard-share-aware scoping

**Decision**: Every dashboard/widget/report/share Route Handler follows
the identical shape 005/006/007 already established: `getCurrentUser` →
`assertProjectRole` (Decision 7) → `assertWriteRateLimit` (new
`"dashboard:write"` bucket, same rate-limiter, no new mechanism) → Zod
validate → repository call (which additionally checks any
`DashboardShare` override) → `handleRouteError`.

**Rationale**: Zero new security mechanism introduced — every layer is
either already-adopted (auth, rate limiting, Zod, error mapping) or the
one narrow addition Decision 7 already justified (dashboard-share
scoping).

**Alternatives considered**: None seriously — this is direct pattern
reuse, not a new design choice requiring alternatives.

---

## Decision 16: Large-dashboard performance — lazy widget mounting + server-side pagination for Table Widgets, no client-side full-dataset loads

**Decision**: Widgets outside the current viewport (below the fold on a
100-widget dashboard) are not mounted/fetched until scrolled into view
(intersection-observer-gated lazy mount). Table Widgets page through the
existing cursor-paginated Features API exactly as every other feature in
this codebase already does — never loading an entire layer's features
client-side at once.

**Rationale**: Directly targets the Performance section's "100 widgets"
/"large statistics datasets"/"server-side pagination" requirements using
patterns (cursor pagination, lazy loading) already established elsewhere
in this codebase, rather than a novel virtualization scheme.

**Alternatives considered**: Eagerly mounting/fetching all 100 widgets on
load (rejected — directly contradicts the Performance section's explicit
scale target and would front-load 100 concurrent data requests on
dashboard open).

---

## Decision 17: Generated `Report` files are persisted as a Postgres `Bytes` column — the one place this feature stores a file server-side, and why that doesn't contradict Decision 9

**Decision**: Unlike ad-hoc dashboard/widget/table exports (Decision 9,
client-side only, never persisted), a generated `Report` row stores its
output file directly in Postgres via Prisma's `Bytes` column type
(`fileContent`), alongside `format`/`sizeBytes`/`generatedAt`. No object
storage service (S3, Vercel Blob, etc.) is introduced.

**Rationale**: Two spec requirements make Reports structurally different
from a one-off export: (1) FR-018/FR-033/SC-007 require a **persistent,
per-user list** of past reports that remain downloadable later, across
sessions — an in-browser Blob cannot survive that; (2) Decision 10's
Scheduled Reports generate with **no browser present at all**, so there
is no client to hold the file even momentarily. Some form of server-side
persistence is therefore unavoidable for Reports specifically, and a
Postgres `Bytes` column is the smallest addition that provides it: no new
external service, no new environment variable/secret, works identically
across all five deployment targets (a Postgres column, unlike an object-
storage bucket, needs no per-target provisioning), and reports are
documents at a moderate, bounded scale (not the 100k-feature-record scale
07's spatial data operates at) — well within what Postgres's automatic
TOAST compression handles routinely. A time/count-based retention rule
(data-model.md) keeps this table from growing unbounded.

**Rationale for why this does not contradict Decision 9**: Decision 9's
"no server-side file storage" scope was specifically about the ad-hoc,
interactive export actions (US9 — export *right now*, from an open
browser session); Reports (US5) are a distinct entity the spec itself
requires to persist and be listed later, and are explicitly the one case
Decision 9's own reasoning ("no browser is open when a schedule fires")
already anticipated needing different treatment.

**Alternatives considered**: Regenerating a report on-demand from saved
parameters instead of storing bytes (rejected — a report is defined as a
"point-in-time" snapshot per spec.md's Key Entities; regenerating later
against possibly-changed underlying data would silently produce a
different document than the one the user actually generated, which is
incorrect, not just a performance trade-off); external object storage
(rejected — new external dependency requiring per-deployment-target
provisioning and new environment variables/secrets, disproportionate to
the moderate scale reports actually operate at).

---

## Summary of resolved unknowns

No `[NEEDS CLARIFICATION]` markers remain from the spec, and none were
introduced during planning. Four genuinely new dependencies are
introduced (`react-grid-layout`, `recharts`, `jsPDF` + `html2canvas`,
`xlsx`) — each narrowly scoped to one capability this codebase has no
existing way to provide, each flagged in plan.md's Complexity Tracking
with the same rigor 007 applied to its one new dependency. Every other
decision reuses an already-established pattern from 005, 006, or 007
rather than introducing a new architectural concept.
