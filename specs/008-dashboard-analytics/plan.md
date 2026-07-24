# Implementation Plan: Dashboard, Reporting & Analytics

**Branch**: `008-dashboard-analytics` | **Date**: 2026-07-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-dashboard-analytics/spec.md`

---

## Summary

This plan covers the full 008 spec — all ten user stories (Dashboard
Builder, Widgets, Layout, Live Analytics, Reporting, Filtering, Sharing,
Templates, Export, Administration) — as a **new** client feature module
(`src/features/dashboards/`, plural, distinct from the existing app-shell
`src/features/dashboard/` singular module) layered on top of the fully
established repository/route-handler/auth/audit conventions from
003/004/006/007, reusing 007's spatial-statistics PostGIS functions and
006's role/activity model rather than reimplementing either.

Five findings shape this plan significantly:

1. **Naming collision resolved, not touched**: the existing `dashboard/`
   (singular) feature module is the app shell and is never modified;
   this feature lives entirely in the new `dashboards/` (plural) module
   (research.md Decision 0).
2. **Ten new Prisma models**, one of them (`WidgetLayout`) intentionally
   holding multiple rows per widget (one per responsive breakpoint), and
   `WidgetConfiguration` deliberately *not* a separate table — it is
   `DashboardWidget.config` JSON, mirroring 007's operationType/
   parameters consolidation pattern (data-model.md).
3. **Four new npm dependencies** — `react-grid-layout` (grid/drag/resize),
   `recharts` (charts, chosen for its existing shadcn/ui integration),
   `jsPDF` + `html2canvas` (PDF/image export), `xlsx` (Excel) — the
   largest new-dependency footprint of any feature planned so far,
   because charting/grid-layout/document-generation are capabilities
   this codebase has never needed before 008. Each is narrowly scoped,
   justified individually in Complexity Tracking below, exactly as 007
   justified its one new dependency.
4. **Reports are the one entity that stores files server-side**
   (a Postgres `Bytes` column, not object storage) — required because a
   report must remain downloadable across sessions and a scheduled
   report has no browser present at generation time; every *ad-hoc*
   export (US9) stays client-side-only, unpersisted, matching 007's
   export philosophy exactly (research.md Decisions 9, 17).
5. **Scheduling has no in-app job queue** — one idempotent
   `POST /api/reports/scheduled/run-due` endpoint is triggered by each
   deployment target's own native scheduler (Vercel Cron, Railway Cron, a
   Docker host's crontab, AWS EventBridge, or Supabase `pg_cron`),
   keeping this feature portable across all five required targets
   without a new job-queue dependency (research.md Decision 10).

---

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged)

**Primary Dependencies**:
- next@16, react@19/react-dom@19, @tanstack/react-query@5, zustand@5, zod
  (existing — reused, no new state/validation library)
- shadcn/ui (existing — `Dialog`, `Tabs`, `AlertDialog`, `Slider`,
  `ToggleGroup` reused for widget config forms, share dialog, template
  picker)
- PostGIS functions — reuses 007's existing statistics builders
  (`analysisOperations.ts`) unchanged for every spatial widget/analytics
  snapshot; **no new PostGIS function is introduced**
- **Four new npm dependencies** (research.md Decisions 2, 3, 9):
  `react-grid-layout` (dashboard grid/drag/resize), `recharts` (Bar/Line/
  Area/Pie/Gauge charts, shadcn/ui-aligned), `jspdf` + `html2canvas`
  (client-side PDF + widget/chart image export), `xlsx` (client- and
  server-side Excel generation) — each justified in Complexity Tracking;
  each MUST clear `@next/bundle-analyzer` before merge (Constitution
  Principle V)

**Storage**: Ten new Prisma models (data-model.md): `Dashboard`,
`DashboardWidget`, `WidgetLayout`, `DashboardTemplate`, `DashboardShare`,
`DashboardFavorite`, `DashboardFilter`, `Report` (the one model with a
`Bytes` file-content column, research.md Decision 17), `ScheduledReport`,
`AnalyticsSnapshot`. One migration. No existing column, index, or model
changes — only new back-relation arrays on `Project`/`User`.

**Testing**: Vitest + React Testing Library (unchanged). New Route
Handlers tested against the real ephemeral PostGIS test database,
skip-if-unavailable, matching 003–007's established pattern. New tiers
specific to this feature: widget-type rendering/error-isolation tests,
grid-layout persistence tests, and a report-generation tier covering all
four formats' structural validity.

**Target Platform**: Unchanged — Node.js runtime, single Postgres/PostGIS
instance. The one platform-sensitive piece (Scheduled Reports' trigger)
is deliberately externalized to each deployment target's native
scheduler rather than built into the app (research.md Decision 10;
Deployment Notes below).

**Project Type**: Web application — single Next.js app. Adds one new
top-level client feature module, `src/features/dashboards/` (research.md
Decision 0), following the exact same internal structure every existing
feature module uses. Adds ~20 new Route Handler files under `app/api/`.
No existing feature module, Route Handler, or repository function is
rewritten — only new back-relation fields on `Project`/`User` (additive).

**Performance Goals** (from spec Success Criteria):
- SC-001: create a dashboard + first working widget in under 3 minutes.
- SC-002: widgets reflect a data change within 30 seconds, 95% of
  observed cases, with no manual reload.
- SC-003: 100 dashboards/project, 100 widgets/dashboard, no meaningfully
  degraded load time versus a smaller dashboard.
- SC-004: every report format opens correctly in a standard external
  tool, 100% of the time for valid input.
- SC-005: layout/filters/widget configuration restored exactly on 100%
  of reopens.
- SC-006: 100% of insufficiently-permissioned write attempts blocked,
  zero resulting data changes.
- SC-008: every interactive control keyboard-operable, across every
  widget type.

**Constraints**:
- No job queue/message broker — DB-backed `nextRunAt` + externally-
  triggered idempotent endpoint only (research.md Decision 10).
- No server-side ad-hoc export storage — every US9 export is a client-
  side Blob download (research.md Decision 9); only `Report` (US5)
  persists file bytes server-side, and only because the spec requires
  it (Decision 17).
- Scheduled reports are restricted to Excel/CSV/HTML — PDF requires a
  browser DOM to render via `html2canvas`, which is not present when a
  schedule fires server-side (research.md Decision 10, `ScheduledReport`
  schema constraint).
- "Public" dashboards remain authenticated-only — no anonymous access
  path is introduced (research.md Decision 8).
- Administration (US10) is Project-Owner-scoped only — no new
  platform-wide administrator role (spec.md's resolved Assumption).

**Scale/Scope**: Ten new Prisma models, six new repository files, ~20
new Route Handler files, four new Zod contract files, one new client
feature module with ~9 services, ~15 hooks, 2 stores, and roughly 25–30
new UI components (12 widget-type renderers plus dashboard/grid/panel
chrome).

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1
design — see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | All new client code lives in the new `src/features/dashboards/` module with its own barrel; the existing `dashboard/` (singular, app-shell) module is untouched (research.md Decision 0); only six new repository files import `@prisma/client` for this feature's concerns |
| II. Type Safety | ✅ PASS | `DashboardWidget.config`/`DashboardFilter.config` are each validated by a per-type Zod discriminated union before persistence, mirroring `analysis.schema.ts`'s established pattern; no `any` introduced |
| III. Database | ✅ PASS | Ten new models added via `prisma migrate dev`; every new geometry-adjacent concern (`DashboardFilter`'s spatial filter) stores GeoJSON in `Json`, converted transiently at query time rather than adding a redundant indexed geometry column — no new persisted geometry column beyond what 003/007 already established is needed |
| IV. GIS Principles | ✅ PASS | Every spatial statistic a widget displays is computed via 007's existing PostGIS builders (research.md Decision 5); a spatial filter's geometry passes `ST_IsValid` before use, matching `MeasurementHistory`'s existing rule; no client-side spatial aggregate is ever treated as authoritative |
| V. Performance | ✅ PASS | Four new dependencies, each dynamically imported at its point of use (`react-grid-layout`/`recharts` only inside `dashboards/`'s components, `jspdf`/`html2canvas`/`xlsx` only inside the export/report action path), each cleared through `@next/bundle-analyzer` before merge (Quality Gates below); widgets outside the viewport are lazy-mounted (research.md Decision 16) |
| VI. Security | ✅ PASS | Every endpoint follows `getCurrentUser` → `assertProjectRole` (+ `DashboardShare` override, research.md Decision 7) → `assertWriteRateLimit` → Zod validate → repository call → `handleRouteError`; every action is logged via 006's `Activity` model (research.md Decision 11); the one unauthenticated-by-necessity endpoint (`run-due`, research.md Decision 10) uses a server-only shared-secret header, never `getCurrentUser` |
| VII. Testing | ✅ PASS | Unit/store/hook/API/integration/accessibility tiers planned per user story, plus new widget-rendering-isolation and report-format-validity tiers (Testing Strategy) |
| VIII. Documentation | ✅ PASS | spec→plan→(tasks→implementation→tests→docs) lifecycle in progress; JSDoc required on every new exported function |
| IX. Git Workflow | ✅ PASS (process) | Standard workflow applies |
| X. Quality Gates | ✅ PASS | TypeScript/ESLint/tests/`next build` all gate merge; bundle-analyzer is mandatory given four new dependencies (Constitution Principle V) |

**One flagged, justified item — not a violation**: like 007, this
feature's authorization depends on 006-collaboration's not-yet-
implemented `assertProjectRole`/`ProjectMember`/`Activity` infrastructure
(and, if 007 has not yet landed either, on 007's `AnalysisRun` statistics
builders this feature reuses for spatial widgets). Recorded in Complexity
Tracking below as a sequencing dependency, not a principle violation.

**No other violations.**

**Re-check after Phase 1 design**: Confirmed still PASS. `data-model.md`
and `contracts/` confirm the scope stays at ten new models and four new
npm dependencies, each individually justified — no further deviation
surfaced during design.

---

## Project Structure

### Documentation (this feature)

```text
specs/008-dashboard-analytics/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/              # Phase 1 output
│   ├── api-contracts.md
│   ├── client-api.md
│   └── repository-api.md
└── tasks.md               # Phase 2 output (/speckit-tasks — NOT created by this command)
```

### Source Code (repository root) — additions only

```text
prisma/
└── schema.prisma                                    # MODIFIED: + 10 new models, + back-relations on Project/User

src/
├── server/
│   └── repositories/
│       ├── dashboardRepository.ts                    # NEW — Dashboard, DashboardFavorite
│       ├── widgetRepository.ts                        # NEW — DashboardWidget, WidgetLayout
│       ├── dashboardAnalyticsRepository.ts              # NEW — AnalyticsSnapshot + new platform-count aggregates
│       ├── dashboardShareRepository.ts                   # NEW — DashboardShare
│       ├── dashboardFilterRepository.ts                   # NEW — DashboardFilter
│       └── reportRepository.ts                             # NEW — Report, ScheduledReport
│
├── app/api/
│   ├── projects/[projectId]/
│   │   ├── dashboards/route.ts                        # NEW
│   │   ├── analytics/[snapshotType]/route.ts            # NEW
│   │   └── reports/route.ts                               # NEW
│   ├── dashboards/[dashboardId]/
│   │   ├── route.ts                                    # NEW
│   │   ├── duplicate/route.ts                           # NEW
│   │   ├── favorite/route.ts                             # NEW
│   │   ├── widgets/route.ts                               # NEW
│   │   ├── widgets/[widgetId]/data/route.ts                # NEW
│   │   ├── layout/route.ts                                 # NEW
│   │   ├── shares/route.ts                                  # NEW
│   │   ├── shares/[userId]/route.ts                          # NEW
│   │   ├── filters/route.ts                                   # NEW
│   │   ├── reports/route.ts                                    # NEW
│   │   └── scheduled-reports/route.ts                            # NEW
│   ├── widgets/[widgetId]/route.ts                       # NEW — PATCH/DELETE a widget directly (doesn't need the dashboardId prefix)
│   ├── scheduled-reports/[scheduledReportId]/route.ts    # NEW
│   ├── reports/[reportId]/download/route.ts                # NEW
│   ├── reports/scheduled/run-due/route.ts                    # NEW
│   ├── dashboard-templates/route.ts                            # NEW
│   └── filters/[filterId]/route.ts                                # NEW
│
├── shared/
│   ├── contracts/
│   │   ├── dashboard.schema.ts                        # NEW
│   │   ├── widget.schema.ts                            # NEW — per-type discriminated union
│   │   ├── dashboardFilter.schema.ts                     # NEW
│   │   └── report.schema.ts                               # NEW
│   └── errors/apiError.ts                              # REUSED unchanged (FORBIDDEN already added by 006/007)
│
└── features/dashboards/                                # NEW module (research.md Decision 0)
    ├── components/          # ~25-30 components — see contracts/client-api.md's tree
    ├── hooks/                # ~15 hooks across 6 files
    ├── services/             # ~9 services
    ├── store/                # dashboardBuilderStore.ts, dashboardFilterStore.ts
    ├── types/dashboard.types.ts
    └── index.ts

src/features/dashboard/components/DashboardLayout.tsx      # MODIFIED: adds one new nav entry/route link to Dashboards — no structural change to the shell itself
```

**Structure Decision**: One new top-level client feature module,
`src/features/dashboards/` (plural), never conflated with the existing
`src/features/dashboard/` (singular) app-shell module (research.md
Decision 0) — the only touch to the shell is a navigation entry linking
to the new Dashboards area, not a restructuring of `DashboardLayout.tsx`
itself. Server-side, six new repository files (one per primary
table-group) and roughly twenty new Route Handler files, all additive.

---

## Architecture

### Dashboard repository layer

`dashboardRepository.ts` owns `Dashboard`/`DashboardFavorite` exactly as
`layerRepository.ts` owns `Layer` — one file, one primary concern,
following the codebase's established one-file-per-concern convention
(contracts/repository-api.md).

### Widget repository layer

`widgetRepository.ts` owns `DashboardWidget`/`WidgetLayout` together
(the two are always read/written as a unit — a widget without a layout
row per breakpoint is an invalid state), including `resolveWidgetData`'s
dispatch across five different data-source kinds by delegating to the
already-existing repository each kind belongs to (007's
`analysisOperations.ts`, `featureRepository.ts`, 006's
`activityRepository.ts`) rather than re-implementing any of their query
logic.

### Reporting services

Server-side, `reportRepository.ts` owns `Report`/`ScheduledReport`,
including the one background-triggered function (`runDueScheduledReports`,
called only by the `run-due` Route Handler). Client-side,
`reportService.ts` + `dashboardExportService.ts` split "persisted Report
generation" from "ad-hoc, unpersisted export" per research.md Decisions 9
and 17 — two distinct concerns that happen to share the same
PDF/Excel/CSV/HTML format vocabulary but different persistence models.

### Analytics engine

`dashboardAnalyticsRepository.ts` is the compute-if-stale-else-serve
cache layer over `AnalyticsSnapshot` (research.md Decision 12),
delegating every spatial aggregate to 007's existing builders and adding
only the genuinely new platform-count queries (dashboard/widget counts,
storage-usage proxy) this feature is the first to need.

### Route Handlers

Unchanged shape from every existing endpoint:
`getCurrentUser` → `assertProjectRole`/`resolveEffectivePermission` →
`assertWriteRateLimit` → Zod parse → repository call →
`handleRouteError`. The one structurally different handler is
`POST /api/reports/scheduled/run-due`, which authenticates via a shared
secret header instead of `getCurrentUser` (research.md Decision 10) —
the same "one handler with a different shape for a good, documented
reason" precedent 006-collaboration's SSE stream endpoint already set.

### React Query

One centralized `queryKeys.ts` (contracts/client-api.md) covering every
new entity. `useWidgetData`'s `refetchInterval` (research.md Decision 6)
is the feature's one recurring-poll hook, paused for widgets outside the
viewport (research.md Decision 16).

### Zustand

`dashboardBuilderStore` (in-progress editing state, session-only,
mirroring 007's `analysisStore`) and `dashboardFilterStore` (in-progress
global filter state, viewer-facing rather than editor-facing) stay
deliberately separate — the same split rationale 007 already documented
for `analysisStore`/`analysisPanelStore`.

### Dashboard rendering / Widget rendering / Grid layout

`DashboardGrid` wraps `react-grid-layout`, feeding it `WidgetLayout` rows
per the active breakpoint and persisting `onLayoutChange` via
`useSaveLayout` (debounced at drag/resize end, not per-frame).
`WidgetRenderer` is the one place `DashboardWidget.type` is dispatched to
a concrete component, each wrapped in its own error boundary (research.md
Decision 13) so one widget's failure never blanks the dashboard.

### Shared UI components

Every dialog/form/toggle reuses existing `shadcn/ui` primitives already
in `src/shared/components/ui/` (`Dialog`, `AlertDialog`, `Slider`,
`ToggleGroup`, `Tooltip`) — no new base UI primitive is introduced by
this feature; only `recharts`-based chart components and
`react-grid-layout`'s grid are genuinely new UI building blocks, and both
are wrapped in this feature's own components rather than added to
`src/shared/components/ui/` (they are dashboard-specific, not
general-purpose primitives every feature would reuse).

### Export services

`dashboardExportService.ts` (ad-hoc, unpersisted — US9) and
`reportService.ts` (persisted `Report` generation — US5) both use
`html2canvas`/`jsPDF`/`xlsx` for their respective client-side generation
paths, sharing the same underlying capture/serialization helpers where
the output format overlaps (e.g., both need a "render this DOM node to a
PNG" helper) — factored into one small shared utility,
`src/features/dashboards/services/captureUtils.ts`, rather than
duplicated between the two services.

### Statistics engine

Not a new engine — this feature's "statistics engine" *is* 007's already-
built `analysisOperations.ts` statistics builders, invoked read-only from
`dashboardAnalyticsRepository.ts` (Architecture → Analytics engine,
above).

---

## Database Changes

See data-model.md in full. Summary: one migration creating ten new
tables (`Dashboard`, `DashboardWidget`, `WidgetLayout`,
`DashboardTemplate`, `DashboardShare`, `DashboardFavorite`,
`DashboardFilter`, `Report`, `ScheduledReport`, `AnalyticsSnapshot`) plus
back-relation arrays on `Project`/`User`. `Report.fileContent` is the
only new `Bytes` column in the schema. Cascade rules follow the existing
`Project → child` pattern throughout. Seed data adds the five built-in
`DashboardTemplate` rows.

## Performance

- **100 dashboards / 100 widgets**: `WidgetRenderer`'s lazy-mount gate
  (research.md Decision 16) and `@@index([dashboardId, ...])` on every
  child table keep both the initial dashboard-list query and an
  individual dashboard's widget load bounded regardless of count.
- **Real-time dashboards**: React Query polling (research.md Decision 6)
  bounded at the SC-002 30-second target; `AnalyticsSnapshot`'s TTL cache
  (research.md Decision 12) means many concurrent dashboard viewers share
  one recomputation instead of each triggering their own.
- **Large statistics datasets / efficient aggregation**: every spatial
  aggregate reuses 007's already-indexed PostGIS queries; the new
  platform-count queries added by this feature use simple indexed
  `COUNT`/`SUM` against existing indexed columns, no new heavy query
  shape.
- **Server-side pagination**: Table Widgets reuse the existing
  cursor-paginated Features API unchanged — never a client-side full-
  layer load.
- **Caching**: `AnalyticsSnapshot` (server) + React Query's existing
  per-key caching (client) — no new cache infrastructure.
- **Lazy loading**: `react-grid-layout`, `recharts`, `jspdf`,
  `html2canvas`, `xlsx` are all dynamically imported at their point of
  use (`next/dynamic`, `ssr: false` for anything Leaflet/DOM-dependent),
  never part of the initial route bundle (Constitution Principle V).
- **Memoization**: chart data transforms and grid-layout computations are
  memoized per widget; Zustand selectors stay narrow (no component
  subscribes to more of `dashboardBuilderStore`/`dashboardFilterStore`
  than it renders).

## Security

- **Ownership**: `Dashboard.ownerId` is the source of truth for who
  created a dashboard, independent of `Project.ownerId` (research.md
  Decision 7) — a Project Owner can still administer any dashboard in
  their project (US10) without being its `ownerId`.
- **Role permissions**: `assertProjectRole` (006) is the base layer for
  every endpoint; `DashboardShare` can only broaden a specific user's
  access to one dashboard, never narrow it below their project role
  (research.md Decision 7's explicit rule, enforced by
  `resolveEffectivePermission`).
- **Read-only dashboards**: enforced server-side on every write endpoint
  (FR-026) — a "view"-permission or `visibility: "public"` viewer's
  client-side UI hides write controls, but the Route Handler independently
  rejects any write regardless of client state (SC-006).
- **Dashboard sharing**: grants/revokes are owner-or-Project-Owner-only
  (FR-023/FR-027), immediate on next request (no caching of share state
  across requests).
- **Audit logging**: every create/edit/delete/share/export/report action
  writes one `Activity` row via 006's existing model, extended with
  `"dashboard"`/`"widget"`/`"report"` `targetType` values (research.md
  Decision 11) — satisfies FR-036/FR-042 without a new audit table.
- **Rate limiting**: `assertWriteRateLimit`'s existing mechanism, new
  `"dashboard:write"` bucket — no new rate-limiting mechanism.
- **Input validation**: every request Zod-validated before any repository
  call, including HTML/Text widget content sanitization performed
  server-side at both create and update time (FR-007, defense in depth
  alongside client-side re-sanitization at render).

## Accessibility

- **Keyboard navigation**: every widget, grid-arrangement action (via a
  keyboard-operable move/resize alternative — research.md Decision 14,
  since `react-grid-layout`'s default interaction is pointer-only), and
  dialog is reachable via keyboard alone (FR/SC-008).
- **ARIA roles**: `DashboardGrid` uses `role="application"`-appropriate
  labeling per widget region; every control carries an accessible name
  reflecting its action, not its icon (Constitution's existing
  Accessibility standard).
- **Focus management**: widget config panels and dialogs (share, export,
  report generation) trap and restore focus correctly, matching 007's
  established `ProgressDialog`/preset-dialog pattern.
- **Screen reader support**: live-updating widget values use
  `aria-live="polite"`, consistent with 007's measurement/progress
  readout convention.
- **Chart accessibility**: every chart widget renders an adjacent,
  toggleable data-table representation of its underlying data
  (research.md Decision 14) — never relies on Recharts' default SVG/ARIA
  output alone.
- **Responsive layouts**: the same `WidgetLayout` breakpoint mechanism
  that provides FR-010's responsive reflow also guarantees no widget
  becomes keyboard-unreachable or visually clipped at a narrow viewport.

## Testing Strategy

| Tier | Coverage |
|---|---|
| **Repository** | Every function in contracts/repository-api.md across all six new repository files — success, not-found, forbidden paths, against the real PostGIS test database |
| **Route Handler (API)** | Every endpoint in api-contracts.md: success, validation failure, `403`, `404`, `409`, `429`; the `run-due` endpoint's shared-secret auth and its per-schedule failure isolation |
| **Service** | `dashboardExportService`/`reportService`'s per-format assembly (unit-testable independent of network, feeding fixed widget/dashboard data and asserting output structural validity per format) |
| **Hook** | `useWidgetData`'s polling + viewport-pause behavior; every mutation hook's cache-invalidation targets |
| **Store** | `dashboardBuilderStore`/`dashboardFilterStore` actions/selectors |
| **Widget** | Every one of the 12 widget-type renderers: renders correctly given valid data, renders the "unavailable" state given a deleted data source (research.md Decision 13), is wrapped by and recovers via its error boundary given a forced render failure |
| **Dashboard** | `DashboardGrid`'s drag/resize/collision/responsive-reflow/group-collapse behavior; layout persistence round-trip |
| **Integration** | One full run-through per user story matching quickstart.md's ten sections |
| **Accessibility** | Every widget type and every dialog against WCAG 2.2 AA (axe + RTL a11y assertions), keyboard-only run-through matching quickstart.md's accessibility-relevant steps |
| **Performance** | A 100-widget dashboard's load/lazy-mount behavior; a 100-dashboard project's list-query performance; report generation timing for a large dashboard |

## Deployment Notes

| Target | Notes |
|---|---|
| **Vercel** | `POST /api/reports/scheduled/run-due` is triggered via a Vercel Cron Job (`vercel.json`/`vercel.ts` `crons` entry, per the session's Vercel knowledge-update — pointing at this endpoint with the shared-secret header configured as a Vercel environment variable). |
| **Railway** | Railway's own Cron Job / scheduled-task feature triggers the same endpoint. |
| **Docker** | A host-level `cron`/`systemd` timer (documented in `docker-compose.yml`'s accompanying deployment docs) issues the scheduled `curl` call. |
| **AWS** | An EventBridge Scheduler rule invokes the endpoint (via a Lambda trigger or direct HTTPS target, depending on hosting shape — ECS/Fargate vs. Lambda). |
| **Supabase** | Supabase's `pg_cron` extension (if enabled on the project's Postgres instance) can call the endpoint via `pg_net`, or an external scheduler is used identically to the other targets. |

One new environment variable is introduced: `CRON_SECRET` (server-only,
never `NEXT_PUBLIC_*`), the shared secret the `run-due` endpoint checks
(research.md Decision 10; Constitution Principle VI — secrets are
server-side only). No other new environment variable, and no new
external service dependency, is introduced. The one schema migration
must run before this feature's Route Handlers are exposed, standard
migrate-then-deploy ordering unchanged from every prior feature.

## Risks

| Risk | Mitigation |
|---|---|
| Large dashboards (100 widgets) causing slow initial load | Lazy-mount gate (research.md Decision 16) + per-widget error isolation mean the dashboard shell itself loads fast regardless of widget count; individual widgets load progressively as scrolled into view |
| Heavy SQL aggregation for platform-level statistics (storage usage, cross-layer counts) | `AnalyticsSnapshot`'s TTL cache (research.md Decision 12) bounds how often the expensive query actually runs, independent of viewer count |
| Chart rendering performance with many data points | Recharts' own data-point-count guidance followed (aggregation/sampling at the data-source query level for very large series, not deferred to the chart library); documented as a per-widget-type implementation concern in tasks.md, not a blocking unknown here |
| Real-time synchronization drift (a widget showing stale data slightly past the 30s bound under load) | SC-002's "95% of observed cases" target already accounts for this; the optional SSE enhancement (research.md Decision 6) tightens the common case without being load-bearing for correctness |
| Export failures (large `html2canvas` captures failing/timing out on a very complex dashboard) | A documented soft warning threshold (mirroring 007's export-size warning) before attempting a very large capture, with a clear failure message rather than a silent hang |
| Scheduling reliability (a platform's cron trigger misconfigured or failing to fire) | `run-due`'s idempotent, catch-up-safe design (any due schedule is processed whenever the endpoint next runs, not lost if one trigger is missed) means a temporarily-misconfigured scheduler self-heals once fixed, without manual data repair |
| Recovery strategy for a partially-failed batch of due scheduled reports | Per-schedule failure isolation (contracts/repository-api.md's `runDueScheduledReports`) — one schedule's failure never blocks or corrupts another's `Report` generation, mirroring 007's Batch Run isolation precedent |
| The `assertProjectRole`/`AnalysisRun` dependency on 006/007 landing first | Explicitly tracked in Complexity Tracking below, not silently assumed |

---

## Development Phases (for `/speckit-tasks`)

**Phase 1 — Setup**: Ten-model migration; `dashboard.schema.ts`/
`widget.schema.ts`/`dashboardFilter.schema.ts`/`report.schema.ts`; add
the four new npm dependencies + bundle-analyzer baseline check;
`dashboards/` module scaffold.

**Phase 2 — Foundational**: All six repository files' CRUD functions;
`dashboardBuilderStore`/`dashboardFilterStore`; `queryKeys.ts`; the eight
core services; foundational hooks (`useDashboards`, `useDashboard`,
`useWidgets`); `DashboardGrid`/`WidgetRenderer` shell wired into a new
`DashboardView` route.

**Phase 3 — Dashboard Builder (US1)**: create/rename/delete/duplicate/
favorite endpoints + hooks + `DashboardListPage` UI.

**Phase 4 — Widgets (US2)**: per-type widget components (all 12),
`config` Zod schemas, `WidgetConfigPanel`, HTML/Text sanitization.

**Phase 5 — Dashboard Layout (US3)**: `react-grid-layout` integration,
`WidgetLayout` persistence per breakpoint, grouping/collapse.

**Phase 6 — Live Analytics (US4)**: `dashboardAnalyticsRepository.ts`,
`AnalyticsSnapshot` caching, `useWidgetData` polling, all five analytics
data-source types wired.

**Phase 7 — Reporting (US5)**: `reportRepository.ts`, PDF/Excel/CSV/HTML
generation paths, Generated Reports list, `ScheduledReport` CRUD +
`run-due` endpoint.

**Phase 8 — Filtering (US6)**: `dashboardFilterRepository.ts`, global +
per-widget filter application across all five filter types.

**Phase 9 — Sharing (US7)**: `dashboardShareRepository.ts`,
`resolveEffectivePermission`, public/private toggle, read-only
enforcement UI + server-side.

**Phase 10 — Templates (US8)**: `DashboardTemplate` seed data, template
picker UI, blueprint-instantiation on create.

**Phase 11 — Export (US9)**: `dashboardExportService.ts`,
`captureUtils.ts`, whole-dashboard/widget-image/table-data export paths.

**Phase 12 — Administration (US10)**: `DashboardAdminPanel`, usage-
analytics aggregation, audit-log view (reusing `Activity`), basic
performance-metrics surfacing.

**Phase 13 — Testing & Polish**: full test-tier pass (Testing Strategy
above); accessibility audit; quickstart.md full run-through; Constitution
Check re-verification.

Phase 2 (foundational shell) blocks every user-story phase (3–12).
Phases 3, 4, 5 are tightly coupled (a dashboard needs widgets needs
layout to be meaningfully testable) and are best sequenced together even
though each has its own spec.md story; Phases 6–12 can otherwise proceed
largely in parallel once Phase 5 lands, mirroring 007's phase-parallelism
notes.

---

## Quality Gates

- **TypeScript**: `tsc --noEmit` — zero errors
- **ESLint**: `eslint src --max-warnings 0` — zero errors/warnings
- **Vitest**: all applicable tiers above passing
- **Production build**: `next build` succeeds
- **Bundle analyzer**: mandatory run given four new dependencies — each
  must be confirmed dynamically imported outside the initial route
  bundle, per-dependency gzipped size documented in the PR (Constitution
  Principle V)

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Dependency on 006-collaboration's `assertProjectRole`/`ProjectMember`/`Activity` and 007-spatial-analysis's `AnalysisRun` statistics builders (neither fully implemented in this codebase as of this plan) | Spec FR-034–FR-038 require project-membership/role-aware administration and dashboard-share permissions layered on real project roles; spec US4's spatial statistics widgets require 007's already-designed PostGIS aggregate functions — building either a second permission system or a second statistics engine would directly duplicate work already approved elsewhere in this codebase | Falling back to an `ownerId`-only check or a dashboard-owned copy of statistics SQL (rejected — same reasoning 007 already established: duplicates already-approved architecture and creates a reconciliation problem the moment 006/007 land) |
| Four new npm dependencies (`react-grid-layout`, `recharts`, `jspdf`+`html2canvas`, `xlsx`) | Grid/drag/resize (US3), charting (US2), and PDF/Excel export (US5/US9) are capabilities this codebase has never needed before this feature and cannot assemble from existing dependencies without materially re-deriving each library's core logic | Hand-rolling a grid/drag/resize engine, a charting library, or PDF/Excel serialization (rejected — each is a mature, narrow, single-purpose, widely-used library exactly matching one explicit spec requirement; hand-rolling any of them is a substantially larger, harder-to-get-right undertaking than adopting the standard tool, and each is individually small enough to justify against the capability it unlocks) |
| `Report.fileContent` persisted server-side (a `Bytes` column) — the only server-side file storage in this feature or in 007 | FR-018/FR-033/SC-007 require reports to remain downloadable across sessions, and Scheduled Reports (US5) generate with no browser present — an unavoidable requirement for *some* server-side persistence, unlike every other export in this feature | Regenerating a report on-demand instead of storing it (rejected — a report is defined as a point-in-time snapshot per spec.md; regenerating against changed underlying data would silently produce a different document, which is a correctness bug, not an acceptable trade-off); external object storage (rejected — new external dependency, new environment variables/secrets, per-target provisioning burden, disproportionate to reports' moderate scale — a Postgres `Bytes` column with a retention cap is portable across all five deployment targets with zero additional provisioning) |
