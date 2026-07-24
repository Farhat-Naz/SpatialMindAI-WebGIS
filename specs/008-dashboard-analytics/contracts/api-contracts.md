# API Contracts: Dashboard, Reporting & Analytics (008)

**Feature**: 008-dashboard-analytics

This feature adds Route Handlers under three resource families:
`/api/projects/:projectId/dashboards*` (dashboard/widget/layout/filter/
share/favorite CRUD, scoped to a project), `/api/dashboards/:dashboardId*`
(single-dashboard actions), and `/api/reports*` (report generation,
scheduling, the run-due trigger). Authentication (`getCurrentUser`),
authorization (`assertProjectRole` + dashboard-share scoping, research.md
Decision 7), rate limiting (`assertWriteRateLimit`, new `"dashboard:write"`
bucket), and error mapping (`handleRouteError`/`toErrorResponse`,
including the `FORBIDDEN` code 006/007 already add) are reused unchanged.

---

## Dashboard CRUD

### `GET /api/projects/:projectId/dashboards`

Lists dashboards in a project (US1). Query params: `cursor?`, `limit?`,
`favoritesOnly?` (boolean).

**Response — 200**: `{ dashboards: Dashboard[], nextCursor: string | null }`
— each entry includes `isFavorite` (computed for the requesting user) and
`sharedWithMe` (true if access comes from a `DashboardShare`, not project
membership alone).

### `POST /api/projects/:projectId/dashboards`

Creates a dashboard (FR-001), optionally from a template (`templateId`,
US8) — when provided, the new dashboard's widgets/layout are seeded from
`DashboardTemplate.widgetsBlueprint`.

**Request**: `{ name: string, templateId?: string }`

**Response — 201**: `{ dashboard: Dashboard }`

**Errors**: `400 INVALID_INPUT` (empty name, unknown `templateId`); `403
FORBIDDEN` (caller below Editor role); `409 DUPLICATE_NAME`.

### `PATCH /api/dashboards/:dashboardId`

Renames a dashboard, or (owner/project-Owner only) changes `visibility`
(FR-024).

**Request**: `{ name?: string, visibility?: "private" | "public" }`

**Response — 200**: `{ dashboard: Dashboard }`

**Errors**: `403 FORBIDDEN` (visibility change by a non-owner, non-Owner
caller — distinct from a plain rename, which any Editor-role sharer may
do); `404 NOT_FOUND`.

### `DELETE /api/dashboards/:dashboardId`

Deletes a dashboard and everything it cascades to (FR-001/FR-004 — the
client is responsible for the "explicit confirmation" UX; this endpoint
itself performs the delete once called).

**Response — 204**

### `POST /api/dashboards/:dashboardId/duplicate`

Duplicates a dashboard into a new, independent copy (FR-002) — deep-
copies its `DashboardWidget`/`WidgetLayout`/`DashboardFilter` rows, never
sharing a row with the original.

**Response — 201**: `{ dashboard: Dashboard }`

---

## Favorites

### `POST /api/dashboards/:dashboardId/favorite` / `DELETE /api/dashboards/:dashboardId/favorite`

Favorites/unfavorites a dashboard for the requesting user (FR-003) —
idempotent (`POST` on an already-favorited dashboard is a no-op success,
matching `DashboardFavorite`'s unique-constraint upsert behavior).

**Response — 200**: `{ isFavorite: boolean }`

---

## Widget CRUD

### `POST /api/dashboards/:dashboardId/widgets`

Adds a widget (FR-005/FR-006).

**Request**: `{ type: WidgetType, title?: string, dataSourceType?: string, dataSourceId?: string, config: object }` —
`config`'s shape is validated per `type` against the matching Zod variant
in `widget.schema.ts`.

**Response — 201**: `{ widget: DashboardWidget, layout: WidgetLayout[] }`
— server assigns a default layout entry per breakpoint (bottom-of-grid
placement) unless the request includes an explicit initial layout.

**Errors**: `400 INVALID_INPUT` (unknown `type`, `config` failing its
type-specific schema, HTML content that fails sanitization structurally);
`404 NOT_FOUND` (`dataSourceId` does not resolve to a visible
layer/AnalysisRun).

### `PATCH /api/widgets/:widgetId`

Updates a widget's `title`/`dataSourceType`/`dataSourceId`/`config`/
`groupId`/`isCollapsed`.

**Response — 200**: `{ widget: DashboardWidget }`

### `DELETE /api/widgets/:widgetId`

Removes a widget (its `WidgetLayout`/`DashboardFilter` rows cascade).

**Response — 204**

---

## Layout Updates

### `PUT /api/dashboards/:dashboardId/layout`

Bulk-replaces the layout for one breakpoint tier — the shape
`react-grid-layout`'s `onLayoutChange` callback already produces, so no
client-side reshaping is needed before the call (FR-008/FR-009).

**Request**: `{ breakpoint: "desktop" | "tablet" | "mobile", items: { widgetId: string, x: number, y: number, w: number, h: number }[] }`

**Response — 200**: `{ layout: WidgetLayout[] }`

**Errors**: `409 CONFLICT`-shaped `INVALID_INPUT` if `items` references a
`widgetId` not belonging to this dashboard (spec Edge Cases — concurrent
edit safety, research.md's "last-write-wins per save" resolution: this
whole-tier replace is the atomic save unit, so two overlapping saves
never interleave partial widget positions).

---

## Analytics & Statistics

### `GET /api/projects/:projectId/analytics/:snapshotType`

Serves a (possibly cached) analytics aggregate (US4; research.md Decision
5/12). `snapshotType` ∈ `projectStats | layerStats | featureStats |
systemStats | storageStats`. Query param `scopeId?` (a `Layer.id`,
required for `layerStats`).

**Response — 200**: `{ data: object, computedAt: string, isCached: boolean }`

### `GET /api/dashboards/:dashboardId/widgets/:widgetId/data`

Resolves one widget's current data — dispatches internally based on the
widget's `dataSourceType` (reusing the endpoint above for statistics
types, `AnalysisRun` lookups for `analysisRun`-sourced widgets, the
existing paginated Features API for `layer`-sourced Table/Map widgets,
and `Activity` queries for `activity`-sourced widgets), applying any
active `DashboardFilter` scoped to this widget or the dashboard globally.

**Response — 200**: shape varies by `dataSourceType`, documented per-type
in contracts/client-api.md's hook table (kept out of this table to avoid
duplicating twelve response shapes here).

**Errors**: `200` with `{ dataSourceUnavailable: true }` (not a `4xx`) —
per research.md Decision 13, a deleted data source is data, not an error
(FR-040).

---

## Reports

### `POST /api/dashboards/:dashboardId/reports`

Generates an on-demand report (US5). PDF is client-generated (research.md
Decision 9) and this endpoint is called *after* client-side generation
purely to persist+log it (analogous to 007's `ExportJob` log pattern);
Excel/CSV/HTML may be generated either client- or server-side, but always
end up persisted via this endpoint so they appear in the Generated
Reports list.

**Request** (`multipart/form-data` when `fileContent` is attached, e.g.
for a client-generated PDF; JSON body otherwise): `{ format: "pdf" |
"excel" | "csv" | "html", fileContent?: Blob }` — when `fileContent` is
omitted, the server generates Excel/CSV/HTML itself from the dashboard's
current data.

**Response — 201**: `{ report: Report }` (`fileContent` omitted from the
JSON response body — see `GET .../download` below)

### `GET /api/projects/:projectId/reports`

Lists the requesting user's Generated Reports (FR-018/FR-033), cursor-
paginated, newest first.

**Response — 200**: `{ reports: Omit<Report, "fileContent">[], nextCursor: string | null }`

### `GET /api/reports/:reportId/download`

Streams the stored `fileContent` with the correct `Content-Type`/
`Content-Disposition` for its `format`.

**Errors**: `404 NOT_FOUND` (report doesn't exist, isn't visible to
caller, or `status: "failed"` with no `fileContent`).

---

## Scheduling

### `GET/POST /api/dashboards/:dashboardId/scheduled-reports`

Lists / creates a `ScheduledReport` (US5/FR-017). `POST` request:
`{ format: "excel" | "csv" | "html", recurrence: "daily" | "weekly" | "monthly" }`
— `format: "pdf"` is rejected with `400 INVALID_INPUT` (research.md
Decision 10).

### `PATCH /api/scheduled-reports/:scheduledReportId`

Updates `recurrence`/`isActive` (pause/resume).

### `DELETE /api/scheduled-reports/:scheduledReportId`

Deletes a schedule (does not delete previously generated `Report` rows —
`Report.scheduledReportId` becomes `null` via `SetNull`).

### `POST /api/reports/scheduled/run-due`

The one idempotent, externally-triggered endpoint (research.md Decision
10) — **not** authenticated via `getCurrentUser` (no interactive user is
present); instead authenticated via a shared secret header
(`X-Cron-Secret`, compared against a server-only environment variable)
matching the pattern every one of the five deployment targets' native
schedulers can supply as a configured header. Finds every
`ScheduledReport` with `isActive: true` and `nextRunAt <= now()`,
generates+persists a `Report` for each, advances `nextRunAt`, and returns
a summary. Safe to call more than once for the same due window (a
schedule whose `nextRunAt` has already been advanced past `now()` is
simply not selected on a repeat call — natural idempotency, no separate
lock needed).

**Response — 200**: `{ processed: number, failed: number }`

**Errors**: `401 UNAUTHORIZED` (missing/incorrect `X-Cron-Secret`).

---

## Templates

### `GET /api/dashboard-templates`

Lists the five built-in templates (US8) — platform-wide, not
project-scoped, no auth beyond a resolved user required.

**Response — 200**: `{ templates: DashboardTemplate[] }`

---

## Sharing

### `GET/POST /api/dashboards/:dashboardId/shares`

Lists / grants a `DashboardShare` (FR-023). `POST` request:
`{ userId: string, permission: "view" | "edit" }` — upserts on
`(dashboardId, userId)`.

**Errors**: `403 FORBIDDEN` (caller is not the dashboard owner and not a
project Owner).

### `DELETE /api/dashboards/:dashboardId/shares/:userId`

Revokes a share (FR-027).

---

## Filters

### `GET/POST /api/dashboards/:dashboardId/filters`

Lists / creates a `DashboardFilter` (global or, with `widgetId` in the
body, widget-scoped) (US6/FR-020/FR-021).

**Request**: `{ widgetId?: string, filterType: "date" | "layer" | "project" | "attribute" | "spatial", config: object }`

### `DELETE /api/filters/:filterId`

Removes a filter.

---

## Validation & Error Responses (cross-cutting)

- Every request body is Zod-parsed before any repository call
  (Constitution Principle II) — `widget.schema.ts`, `dashboard.schema.ts`,
  `dashboardFilter.schema.ts`, `report.schema.ts`,
  `scheduledReport.schema.ts` (all new, following `analysis.schema.ts`'s
  existing discriminated-union-per-type convention).
- Standard error envelope unchanged: `{ error: { code, message } }`.

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed body, unknown widget/filter/report type, `config` failing its type-specific schema, oversized layout batch |
| 401 | `UNAUTHORIZED` | No resolvable user (or, for the cron endpoint, missing/incorrect shared secret) |
| 403 | `FORBIDDEN` | Caller's project role or dashboard-share permission is insufficient for the action |
| 404 | `NOT_FOUND` | Dashboard/widget/report/share/filter/template not found or not visible to caller |
| 409 | `DUPLICATE_NAME` | Dashboard name collision within a project |
| 429 | `RATE_LIMITED` | `dashboard:write` bucket exceeded |
| 500 | `DATABASE_ERROR` | Unexpected failure |
