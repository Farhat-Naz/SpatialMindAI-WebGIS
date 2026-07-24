# Data Model: Dashboard, Reporting & Analytics (008)

**Prerequisite**: `research.md` (Decisions 1–2, 7, 9–12, 17 drive this
file directly).

This feature adds **ten** new Prisma models. Per research.md Decision 1,
`WidgetConfiguration` is **not** a separate table — it is the `config`
JSON column on `DashboardWidget`. Every other model the plan prompt named
(`Dashboard`, `DashboardWidget`, `WidgetLayout`, `DashboardTemplate`,
`DashboardShare`, `DashboardFavorite`, `DashboardFilter`, `Report`,
`ScheduledReport`, `AnalyticsSnapshot` — ten tables) is a real, distinct
table below.

---

## Entity: `Dashboard`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `projectId` | `String` (FK → `Project`, `onDelete: Cascade`) | project-scoped, matching `Layer`/`AnalysisRun` |
| `ownerId` | `String` (FK → `User`, `onDelete: Cascade`) | creator; distinct from project ownership (research.md Decision 7) |
| `name` | `String` | |
| `templateId` | `String?` (FK → `DashboardTemplate`, `onDelete: SetNull`) | which template it was created from, if any (US8); `null` for a manually-created or duplicated dashboard |
| `visibility` | `String` | `"private" \| "public"` (research.md Decision 8); default `"private"` |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `Project 1──* Dashboard`, `User 1──* Dashboard`
(owner), `DashboardTemplate 0..1──* Dashboard`, `Dashboard 1──*
DashboardWidget`, `Dashboard 1──* DashboardShare`, `Dashboard 1──*
DashboardFavorite`, `Dashboard 1──* DashboardFilter`, `Dashboard 1──*
Report`.

**Indexes**: `@@unique([projectId, name])` (matches `Layer`/
`AnalysisPreset`'s per-project-unique-name convention);
`@@index([projectId, updatedAt])` (dashboard list, most-recently-edited
first); `@@index([ownerId])`.

**Validation rules**: Only the `Dashboard.ownerId` or a project Owner may
change `visibility` to `"public"` (FR-024) — enforced in the repository,
not the schema.

---

## Entity: `DashboardWidget`

One row per widget on a dashboard (research.md Decision 1 — covers the
requested "WidgetConfiguration" concept via its `config` column).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `dashboardId` | `String` (FK → `Dashboard`, `onDelete: Cascade`) | |
| `type` | `String` | `"map" \| "statistics" \| "table" \| "chartBar" \| "chartLine" \| "chartArea" \| "chartPie" \| "gauge" \| "metricCard" \| "text" \| "image" \| "html"` (US2) |
| `title` | `String?` | user-editable widget header |
| `dataSourceType` | `String?` | `"layer" \| "analysisRun" \| "projectStats" \| "layerStats" \| "featureStats" \| "activity" \| "systemStats" \| "storageStats" \| null` — `null` for non-data-driven widgets (Text/Image/HTML) |
| `dataSourceId` | `String?` | the referenced `Layer.id`/`AnalysisRun.id`, interpreted per `dataSourceType`; `null` where not applicable |
| `config` | `Json` | type-specific configuration: chart sub-options, gauge thresholds, table column selection, static Text/HTML content, Image URL/upload reference, per-widget filter overrides (research.md Decision 1) |
| `groupId` | `String?` (FK → `DashboardWidget.id` self-relation, `onDelete: SetNull`) | non-null when this widget is the "group header" another widget's `groupId` points to, per US3 grouping — see Validation rules |
| `isCollapsed` | `Boolean` | default `false`; persists US3's collapse/expand state |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `Dashboard 1──* DashboardWidget`, `DashboardWidget
1──* WidgetLayout`, self-relation for grouping.

**Indexes**: `@@index([dashboardId])`; `@@index([dashboardId, groupId])`
(group-membership lookups).

**Validation rules**: `config`'s shape is validated by a per-`type` Zod
schema (Constitution Principle II) before persistence — never trusted as
opaque JSON past the API boundary. `groupId` must reference a widget on
the *same* `dashboardId` (repository-enforced). HTML/Text `config`
content is sanitized server-side before storage AND re-sanitized at
render time (defense in depth, FR-007).

---

## Entity: `WidgetLayout`

Breakpoint-scoped position/size (research.md Decision 2) — kept separate
from `DashboardWidget` because a widget has **one layout row per
responsive breakpoint tier**, not one fixed position.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `widgetId` | `String` (FK → `DashboardWidget`, `onDelete: Cascade`) | |
| `breakpoint` | `String` | `"desktop" \| "tablet" \| "mobile"` |
| `x` | `Int` | grid column start |
| `y` | `Int` | grid row start |
| `w` | `Int` | grid column span |
| `h` | `Int` | grid row span |

**Relationships**: `DashboardWidget 1──* WidgetLayout`.

**Indexes**: `@@unique([widgetId, breakpoint])` (exactly one layout per
widget per tier); `@@index([widgetId])`.

**Validation rules**: `w`/`h` MUST be `≥ 1`; `x`/`y` MUST be `≥ 0`
(repository-enforced, matching `react-grid-layout`'s own constraints).

---

## Entity: `DashboardTemplate`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `key` | `String @unique` | `"blank" \| "executive" \| "operations" \| "asset" \| "environmental"` (US8) — stable identifier the UI's template picker keys off |
| `name` | `String` | display name |
| `description` | `String?` | |
| `widgetsBlueprint` | `Json` | array of widget definitions (`type`, `config`, default layout per breakpoint) applied when a dashboard is created from this template |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `DashboardTemplate 0..1──* Dashboard` (back-relation,
`templateId`).

**Indexes**: unique `key` is the sole lookup index needed at this scale
(5 seeded rows).

**Validation rules**: Not project-scoped — templates are platform-wide,
seeded via `prisma/seed.ts` (the 5 built-in templates), matching
research.md Decision — no per-project custom templates in this phase
(not requested by spec.md).

---

## Entity: `DashboardShare`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `dashboardId` | `String` (FK → `Dashboard`, `onDelete: Cascade`) | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | the recipient |
| `permission` | `String` | `"view" \| "edit"` (US7/FR-023) |
| `grantedByUserId` | `String` (FK → `User`, `onDelete: Cascade`) | who granted it, for audit clarity |
| `createdAt` | `DateTime` | |

**Relationships**: `Dashboard 1──* DashboardShare`, `User 1──*
DashboardShare` (recipient), `User 1──* DashboardShare` (granter, second
relation).

**Indexes**: `@@unique([dashboardId, userId])` (one grant per user per
dashboard — a new share for the same user updates the existing row);
`@@index([userId])` ("dashboards shared with me").

**Validation rules**: Revoking (FR-027) deletes the row — access is
re-checked on every request via `assertProjectRole` + this table
(research.md Decision 7), never cached past a single request.

---

## Entity: `DashboardFavorite`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `dashboardId` | `String` (FK → `Dashboard`, `onDelete: Cascade`) | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | |
| `createdAt` | `DateTime` | |

**Relationships**: `Dashboard 1──* DashboardFavorite`, `User 1──*
DashboardFavorite`.

**Indexes**: `@@unique([dashboardId, userId])` (favoriting twice is a
no-op, not a duplicate row); `@@index([userId])` ("my favorites" list,
US1/FR-003).

---

## Entity: `DashboardFilter`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `dashboardId` | `String` (FK → `Dashboard`, `onDelete: Cascade`) | |
| `widgetId` | `String?` (FK → `DashboardWidget`, `onDelete: Cascade`) | `null` = a **global** filter (applies dashboard-wide); non-null = scoped to one widget (US6) |
| `filterType` | `String` | `"date" \| "layer" \| "project" \| "attribute" \| "spatial"` |
| `config` | `Json` | filter-type-specific value (date range; layer/project id list; attribute key+operator+value; spatial geometry) |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `Dashboard 1──* DashboardFilter`, `DashboardWidget
0..1──* DashboardFilter` (back-relation).

**Indexes**: `@@index([dashboardId])`; `@@index([widgetId])`.

**Validation rules**: `config`'s shape validated by a per-`filterType`
Zod schema, mirroring `DashboardWidget.config`'s pattern. A spatial
filter's geometry MUST pass `ST_IsValid` before persistence (Constitution
Principle IV), identical rule to `MeasurementHistory.geometry` in
007-spatial-analysis.

---

## Entity: `Report`

A generated, persisted report file (research.md Decision 17 — the one
entity in this feature that stores file bytes server-side).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `dashboardId` | `String` (FK → `Dashboard`, `onDelete: Cascade`) | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | who generated it (or who the schedule was configured for) |
| `scheduledReportId` | `String?` (FK → `ScheduledReport`, `onDelete: SetNull`) | non-null when produced by a schedule (US5/Decision 10); `null` for an on-demand report |
| `format` | `String` | `"pdf" \| "excel" \| "csv" \| "html"` |
| `status` | `String` | `"succeeded" \| "failed"` — always written already-terminal (generation is synchronous per-request or per-scheduler-run, unlike 007's `AnalysisRun`; no `queued`/`running` phase exists for a report) |
| `fileContent` | `Bytes?` | the generated file; `null` when `status: "failed"` |
| `sizeBytes` | `Int?` | |
| `errorMessage` | `String?` | populated when `status: "failed"` (spec Edge Cases — scheduled generation failure) |
| `createdAt` | `DateTime` | |

**Relationships**: `Dashboard 1──* Report`, `User 1──* Report`,
`ScheduledReport 0..1──* Report` (back-relation).

**Indexes**: `@@index([userId, createdAt])` (per-user Generated Reports
list, newest first, FR-018/FR-033); `@@index([dashboardId])`;
`@@index([scheduledReportId])`.

**Retention**: a repository-enforced cap (e.g., the most recent 50
reports per user, or a 90-day window — a config constant, not a hard
schema limit) prevents unbounded `Bytes` growth per research.md Decision
17; oldest rows beyond the cap are pruned when a new `Report` is created.

---

## Entity: `ScheduledReport`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `dashboardId` | `String` (FK → `Dashboard`, `onDelete: Cascade`) | |
| `userId` | `String` (FK → `User`, `onDelete: Cascade`) | owner of the schedule; each generated `Report.userId` is this same user |
| `format` | `String` | `"excel" \| "csv" \| "html"` — **not** `"pdf"`, per research.md Decision 10's no-browser-at-schedule-time constraint |
| `recurrence` | `String` | `"daily" \| "weekly" \| "monthly"` |
| `nextRunAt` | `DateTime` | when the run-due endpoint should next generate a `Report` for this schedule |
| `isActive` | `Boolean` | default `true`; a paused schedule is not deleted, just skipped |
| `createdAt` / `updatedAt` | `DateTime` | |

**Relationships**: `Dashboard 1──* ScheduledReport`, `User 1──*
ScheduledReport`, `ScheduledReport 1──* Report` (back-relation).

**Indexes**: `@@index([nextRunAt, isActive])` (the run-due endpoint's
core query: `WHERE isActive AND nextRunAt <= now()`).

**Validation rules**: `format` MUST NOT be `"pdf"` — enforced by the Zod
schema, not just documentation (research.md Decision 10).

---

## Entity: `AnalyticsSnapshot`

A short-TTL aggregate cache (research.md Decision 12) — not a
user-facing entity, purely a performance mechanism.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `projectId` | `String` (FK → `Project`, `onDelete: Cascade`) | |
| `snapshotType` | `String` | `"projectStats" \| "layerStats" \| "featureStats" \| "systemStats" \| "storageStats"` |
| `scopeId` | `String?` | e.g. a specific `Layer.id` for `"layerStats"`; `null` for project-wide snapshot types |
| `data` | `Json` | the computed aggregate result |
| `computedAt` | `DateTime` | staleness is checked against this, not `updatedAt` (Prisma's `@updatedAt` would fire on every field touch, including ones unrelated to freshness) |

**Relationships**: `Project 1──* AnalyticsSnapshot`.

**Indexes**: `@@unique([projectId, snapshotType, scopeId])` (one live
snapshot per scope — an upsert target, not an append-only log, unlike
`Activity`); `@@index([projectId, snapshotType])`.

**Validation rules**: This table is never read/written directly by a
Route Handler — only through `dashboardAnalyticsRepository.ts`'s
compute-if-stale-else-serve function (research.md Decision 12), so no
client-facing contract exposes its schema directly.

---

## Back-relations added to existing models

```prisma
model Project {
  // ...existing fields unchanged...
  dashboards         Dashboard[]
  analyticsSnapshots AnalyticsSnapshot[]
}

model User {
  // ...existing fields unchanged...
  dashboards          Dashboard[]           @relation("DashboardOwner")
  dashboardShares     DashboardShare[]      @relation("DashboardShareRecipient")
  dashboardSharesGranted DashboardShare[]   @relation("DashboardShareGranter")
  dashboardFavorites  DashboardFavorite[]
  reports             Report[]
  scheduledReports    ScheduledReport[]
}
```

No existing field on `Project`, `Layer`, `Feature`, `AnalysisRun`, or
`User` is renamed, retyped, or removed — every addition above is a new
back-relation array only. `Layer`/`AnalysisRun` are **referenced by id**
from `DashboardWidget.dataSourceId` (a loosely-typed string interpreted
by `dataSourceType`, not a Prisma foreign key) rather than a formal
relation, because a widget's data source is polymorphic across five
different source kinds (Decision 1) — a single FK column cannot point at
five different tables, and Prisma has no native polymorphic-relation
support; the repository layer resolves and validates the reference
against the correct table based on `dataSourceType` before every use.

---

## Migration notes

- One migration: create all ten new tables (`Dashboard`,
  `DashboardWidget`, `WidgetLayout`, `DashboardTemplate`,
  `DashboardShare`, `DashboardFavorite`, `DashboardFilter`, `Report`,
  `ScheduledReport`, `AnalyticsSnapshot`) plus the back-relation arrays on
  `Project`/`User`.
- `DashboardFilter.config`'s spatial-filter geometry does **not** get its
  own PostGIS geometry column — a spatial filter's shape is stored as
  GeoJSON inside the `Json` `config` column and converted to a PostGIS
  geometry only transiently, inside the query that applies it, because
  (unlike `MeasurementHistory.geometry`) a filter's geometry is never
  itself the subject of a spatial index lookup — it is always the *input*
  to one `ST_Intersects`/`ST_Within` call against already-indexed
  `Feature.geometry` rows.
- Seed data (`prisma/seed.ts`): the five `DashboardTemplate` rows (Blank/
  Executive/Operations/Asset/Environmental) are seeded once, keyed by
  their unique `key`, idempotently (seed script upserts, never
  duplicates on repeat runs).
