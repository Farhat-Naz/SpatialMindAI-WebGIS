# Repository Contract: Dashboard, Reporting & Analytics (008)

**Feature**: 008-dashboard-analytics

Six new repository files, each owning one primary table/concern —
matching `featureRepository.ts`/`layerRepository.ts`/007's
`analysisPresetRepository.ts`-style one-file-per-concern convention. No
file outside these six (plus the two touched for reuse, see below)
imports `@prisma/client` for this feature's needs.

---

## `dashboardRepository.ts` (new)

Owns `Dashboard`, `DashboardFavorite`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `listDashboardsForProject` | `projectId`, `userId`, `params: { cursor?, limit?, favoritesOnly? }` | `{ dashboards: DashboardRecord[]; nextCursor }` | Scoped via `assertProjectRole` (Viewer+) **union** any `DashboardShare` the user holds outside their project role (research.md Decision 7) — a user may see a dashboard shared with them even if their base project role would not otherwise surface it in a plain project-scoped list; `isFavorite`/`sharedWithMe` computed per row via a join |
| `getDashboardById` | `dashboardId`, `userId` | `DashboardRecord \| null` | Same union-scoping as above |
| `createDashboard` | `projectId`, `userId`, `{ name, templateId? }` | `DashboardRecord` | When `templateId` is set, creates the dashboard **and** its seeded `DashboardWidget`/`WidgetLayout` rows from `DashboardTemplate.widgetsBlueprint` inside one transaction (US8/FR-029) |
| `renameDashboard` | `dashboardId`, `userId`, `name` | `DashboardRecord` | Throws `DuplicateNameError` on `(projectId, name)` collision |
| `setDashboardVisibility` | `dashboardId`, `userId`, `visibility` | `DashboardRecord` | Throws `ForbiddenError` unless `userId` is the dashboard owner or a project Owner (FR-024) |
| `deleteDashboard` | `dashboardId`, `userId` | `void` | Cascades per schema; writes one `Activity` row (`action: "delete"`, `targetType: "dashboard"`) inside the same transaction (research.md Decision 11) |
| `duplicateDashboard` | `dashboardId`, `userId` | `DashboardRecord` | Deep-copies widgets/layout/filters inside one transaction — new ids throughout, zero shared rows with the source (FR-002) |
| `setFavorite` / `unsetFavorite` | `dashboardId`, `userId` | `void` | Upsert/delete on `(dashboardId, userId)` unique constraint — idempotent |

## `widgetRepository.ts` (new)

Owns `DashboardWidget`, `WidgetLayout`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `addWidget` | `dashboardId`, `userId`, `input` | `{ widget: DashboardWidgetRecord; layout: WidgetLayoutRecord[] }` | Validates `config` against the per-`type` Zod schema before insert; sanitizes any HTML/Text content server-side (FR-007) before it ever reaches storage |
| `updateWidget` | `widgetId`, `userId`, `input` | `DashboardWidgetRecord` | Re-sanitizes on every content update, not just creation |
| `deleteWidget` | `widgetId`, `userId` | `void` | Cascades `WidgetLayout`/`DashboardFilter` per schema |
| `saveLayout` | `dashboardId`, `userId`, `breakpoint`, `items` | `WidgetLayoutRecord[]` | Whole-tier replace inside one transaction — the atomic unit that makes concurrent-edit resolution well-defined (research.md's "last-write-wins per save," spec Edge Cases); validates every `widgetId` belongs to `dashboardId` first |
| `resolveWidgetData` | `dashboardId`, `widgetId`, `userId` | Widget-type-specific shape, or `{ dataSourceUnavailable: true }` | Dispatches by `dataSourceType`: reuses `analysisRepository`'s statistics builders (007) for spatial stats, `featureRepository`'s paginated read for `layer`-sourced Table/Map widgets, `activityRepository` (006) for `activity`-sourced widgets, and `dashboardAnalyticsRepository` (below) for platform-level types; applies any active `DashboardFilter` scoped to this widget or the dashboard globally before returning |

## `dashboardAnalyticsRepository.ts` (new)

Owns `AnalyticsSnapshot`; the one genuinely new aggregation logic this
feature adds (research.md Decision 5/12).

| Function | Input | Output | Notes |
|---|---|---|---|
| `getSnapshot` | `projectId`, `snapshotType`, `scopeId?` | `{ data: unknown; computedAt: Date; isCached: boolean }` | Compute-if-stale-else-serve (Decision 12): reads the existing `AnalyticsSnapshot` row; if `computedAt` is within the TTL, returns it (`isCached: true`); otherwise recomputes via the matching PostGIS/count query, upserts the row, returns fresh (`isCached: false`) |
| `computeProjectStats` / `computeLayerStats` / `computeFeatureStats` | `projectId` (+ `layerId` for layer-scoped) | raw aggregate | Delegates to 007's existing `analysisOperations.ts` statistics builders where the aggregate is spatial (feature count/area/length); only genuinely new SQL here is for non-spatial platform counts |
| `computeSystemStats` / `computeStorageStats` | `projectId` | raw aggregate | New, narrow `COUNT`/`SUM` queries (e.g., total features across all of a project's layers as a proxy for storage; dashboard/widget counts) — the one new aggregation surface this feature introduces (research.md Decision 5) |

## `dashboardShareRepository.ts` (new)

Owns `DashboardShare`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `listShares` | `dashboardId`, `userId` | `DashboardShareRecord[]` | Owner/project-Owner only |
| `grantShare` | `dashboardId`, `granterId`, `{ userId, permission }` | `DashboardShareRecord` | Upsert on `(dashboardId, userId)`; throws `ForbiddenError` unless `granterId` is the dashboard owner or a project Owner |
| `revokeShare` | `dashboardId`, `granterId`, `targetUserId` | `void` | Same authorization rule as grant |
| `resolveEffectivePermission` | `dashboardId`, `userId` | `"owner" \| "edit" \| "view" \| null` | The single function every write path calls to decide if a request may proceed — combines project role + `DashboardShare` per research.md Decision 7's "broaden, never narrow" rule |

## `dashboardFilterRepository.ts` (new)

Owns `DashboardFilter`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `listFilters` | `dashboardId`, `userId` | `DashboardFilterRecord[]` | |
| `createFilter` | `dashboardId`, `userId`, `input` | `DashboardFilterRecord` | Validates `config` per `filterType`; a spatial filter's geometry passes `ST_IsValid` before persistence |
| `deleteFilter` | `filterId`, `userId` | `void` | |

## `reportRepository.ts` (new)

Owns `Report`, `ScheduledReport`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `createReport` | `dashboardId`, `userId`, `{ format, fileContent?, scheduledReportId? }` | `ReportRecord` | When `fileContent` is omitted and `format` is Excel/CSV/HTML, generates it server-side from the dashboard's current data before insert; enforces the retention cap (data-model.md), pruning the oldest report(s) beyond it for this `userId` inside the same transaction |
| `listReportsForUser` | `projectId`, `userId`, `params` | `{ reports: Omit<ReportRecord, "fileContent">[]; nextCursor }` | Never selects `fileContent` in a list query (avoids loading large blobs for a list view) |
| `getReportFileForDownload` | `reportId`, `userId` | `{ fileContent: Buffer; format: string } \| null` | The one function that does select `fileContent` |
| `createScheduledReport` / `updateScheduledReport` / `deleteScheduledReport` | … | `ScheduledReportRecord` | Rejects `format: "pdf"` (research.md Decision 10) |
| `runDueScheduledReports` | *(no user — invoked by the cron endpoint)* | `{ processed: number; failed: number }` | `WHERE isActive AND nextRunAt <= now()`; for each, generates+persists a `Report` (`scheduledReportId` set) and advances `nextRunAt`; a single schedule's failure is caught individually (writes a `status: "failed"` `Report` with `errorMessage`) and never aborts the batch — mirrors 007's Batch Run per-item isolation |

---

## Reused, not duplicated (from existing repositories)

| Existing function | Reused for |
|---|---|
| `analysisOperations.ts`'s `buildStatisticsSql` family (007) | Every spatial-statistics widget/analytics snapshot computation |
| `featureRepository.ts`'s paginated feature list (003/004) | Table Widget data, Map Widget's underlying layer data |
| `activityRepository.ts` (006) | User-activity widget, and this feature's own audit-log writes (extended `targetType` values) |
| `assertProjectRole` (006) | Every dashboard/widget/report/share endpoint's base authorization layer |
| `assertWriteRateLimit` (existing) | Every write endpoint, new `"dashboard:write"` bucket |

## Cross-cutting rules

- No repository function in this feature accepts a raw, unvalidated
  request body — every Route Handler Zod-parses first.
- Every function that resolves a dashboard/widget/report/share/filter
  scopes its query through `resolveEffectivePermission` (or the simpler
  `assertProjectRole` alone where no share-override applies), never a
  bare `ownerId`/`projectId` equality check.
- `dashboardAnalyticsRepository.ts` is the only file that reads or writes
  `AnalyticsSnapshot` — no Route Handler queries it directly.
