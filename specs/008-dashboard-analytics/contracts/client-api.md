# Client Contracts: Services, Hooks, Store (Dashboard, Reporting & Analytics)

**Feature**: 008-dashboard-analytics

New client module: `src/features/dashboards/` (plural — research.md
Decision 0, distinct from the existing app-shell `src/features/dashboard/`
singular module, which this feature does not touch). Follows the same
`components/`, `hooks/`, `services/`, `store/`, `types/`, `__tests__/`,
`index.ts` structure every feature module already uses. Consumes the
public barrels of `database` (layers/features), `analysis` (007's
`AnalysisRun`), `map` (`MapContainer`, research.md Decision 4), and
006-collaboration's membership/activity barrel — never their internals.

---

## Services (`src/features/dashboards/services/`)

### `dashboardService.ts`

| Method | Calls |
|---|---|
| `listDashboards(projectId, params)` | `GET /api/projects/:projectId/dashboards` |
| `createDashboard(projectId, input)` | `POST /api/projects/:projectId/dashboards` |
| `renameDashboard(dashboardId, name)` | `PATCH /api/dashboards/:dashboardId` |
| `setVisibility(dashboardId, visibility)` | `PATCH /api/dashboards/:dashboardId` |
| `deleteDashboard(dashboardId)` | `DELETE /api/dashboards/:dashboardId` |
| `duplicateDashboard(dashboardId)` | `POST /api/dashboards/:dashboardId/duplicate` |
| `setFavorite(dashboardId, isFavorite)` | `POST`/`DELETE /api/dashboards/:dashboardId/favorite` |
| `listTemplates()` | `GET /api/dashboard-templates` |

### `widgetService.ts`

| Method | Calls |
|---|---|
| `addWidget(dashboardId, input)` | `POST /api/dashboards/:dashboardId/widgets` |
| `updateWidget(widgetId, input)` | `PATCH /api/widgets/:widgetId` |
| `deleteWidget(widgetId)` | `DELETE /api/widgets/:widgetId` |
| `getWidgetData(dashboardId, widgetId)` | `GET /api/dashboards/:dashboardId/widgets/:widgetId/data` |
| `saveLayout(dashboardId, breakpoint, items)` | `PUT /api/dashboards/:dashboardId/layout` |

### `analyticsService.ts`

| Method | Calls |
|---|---|
| `getAnalyticsSnapshot(projectId, snapshotType, scopeId?)` | `GET /api/projects/:projectId/analytics/:snapshotType` |

### `reportService.ts`

Thin wrappers plus the client-side PDF generation logic itself
(research.md Decision 9 — the one service in this feature permitted real
logic beyond request shaping, same carve-out `exportService.ts` gets in
007).

| Method | Behavior |
|---|---|
| `generatePdfReport(dashboardId, dashboardElementRef)` | Client-side: `html2canvas` captures the rendered dashboard DOM, `jsPDF` embeds it, then calls `logReport` (below) with the resulting Blob |
| `generateExcelReport(dashboardId)` / `generateCsvReport(dashboardId)` / `generateHtmlReport(dashboardId)` | May run client-side (`xlsx`/hand-rolled) or simply call `logReport` with no `fileContent`, letting the server generate it (api-contracts.md's `POST .../reports`) |
| `logReport(dashboardId, format, fileContent?)` | `POST /api/dashboards/:dashboardId/reports` |
| `listReports(projectId, params)` | `GET /api/projects/:projectId/reports` |
| `downloadReport(reportId)` | `GET /api/reports/:reportId/download` (triggers a browser download of the streamed response) |
| `listScheduledReports(dashboardId)` / `createScheduledReport(dashboardId, input)` | `GET`/`POST /api/dashboards/:dashboardId/scheduled-reports` |
| `updateScheduledReport(id, input)` / `deleteScheduledReport(id)` | `PATCH`/`DELETE /api/scheduled-reports/:id` |

### `dashboardExportService.ts`

Ad-hoc, non-persisted exports (research.md Decision 9, distinct from
`reportService`'s persisted Reports) — whole-dashboard image/document,
single chart/widget image (`html2canvas` on just that widget's DOM node),
single table widget's data file (reuses `database`'s existing
`exportLayerAsGeoJson`-family pattern, extended for CSV/Excel via the
same `xlsx` dependency `reportService` already introduces).

### `dashboardShareService.ts` / `dashboardFilterService.ts`

Thin wrappers over the remaining api-contracts.md endpoints (shares,
favorites already in `dashboardService`, filters) — one file each,
mirroring the one-file-per-concern convention.

---

## Hooks (`src/features/dashboards/hooks/`)

### `useDashboards.ts`

| Hook | Notes |
|---|---|
| `useDashboards(projectId, params)` | Query; cursor-paginated list |
| `useDashboard(dashboardId)` | Query; single dashboard detail |
| `useCreateDashboard(projectId)` | Mutation; invalidates `queryKeys.dashboards(projectId)` |
| `useRenameDashboard(projectId)` / `useSetDashboardVisibility(projectId)` | Mutations; invalidate `dashboards(projectId)` + `dashboard(id)` |
| `useDeleteDashboard(projectId)` | Mutation; invalidates `dashboards(projectId)` |
| `useDuplicateDashboard(projectId)` | Mutation; invalidates `dashboards(projectId)` |
| `useSetFavorite(projectId)` | Mutation; invalidates `dashboards(projectId)` (favorite flag is embedded per-row) |
| `useDashboardTemplates()` | Query; long `staleTime` (platform-wide, rarely-changing data) |

### `useWidgets.ts`

| Hook | Notes |
|---|---|
| `useAddWidget(dashboardId)` / `useUpdateWidget(dashboardId)` / `useDeleteWidget(dashboardId)` | Mutations; invalidate `queryKeys.dashboard(dashboardId)` (widgets are returned embedded in dashboard detail, matching `AnalysisRun`'s "one query, embedded relations" precedent) |
| `useWidgetData(dashboardId, widgetId, options?)` | Query; `refetchInterval` per research.md Decision 6 (default 30s, widget-configurable), paused when the widget is not in viewport (research.md Decision 16's lazy-mount gate lives here) |
| `useSaveLayout(dashboardId)` | Mutation; debounced at the call site (drag-end/resize-end, not per-frame), invalidates `dashboard(dashboardId)` |

### `useAnalytics.ts`

| Hook | Notes |
|---|---|
| `useAnalyticsSnapshot(projectId, snapshotType, scopeId?, options?)` | Query; `refetchInterval` per Decision 6 |

### `useReports.ts` / `useScheduledReports.ts`

| Hook | Notes |
|---|---|
| `useGenerateReport(dashboardId)` | Mutation wrapping `reportService`'s per-format generate+log flow; `retry: false` (matches 007's job-creation precedent — a retried report generation would create a duplicate) |
| `useReports(projectId, params)` | Query; cursor-paginated Generated Reports list |
| `useDownloadReport()` | Mutation-shaped wrapper (network fetch + browser download trigger), consistent with 007's `useExportResult` pattern |
| `useScheduledReports(dashboardId)` / `useCreateScheduledReport(dashboardId)` / `useUpdateScheduledReport(dashboardId)` / `useDeleteScheduledReport(dashboardId)` | Standard query/mutation set |

### `useDashboardShares.ts` / `useDashboardFilters.ts`

Standard query/mutation sets over their respective endpoints.

**Query keys**: `src/features/dashboards/services/queryKeys.ts` — one
centralized factory file, extending the exact convention 005/007 already
established (`dashboards(projectId, params?)`, `dashboard(id)`,
`widgetData(dashboardId, widgetId)`, `analyticsSnapshot(projectId, type, scopeId?)`,
`reports(projectId, params?)`, `scheduledReports(dashboardId)`,
`dashboardShares(dashboardId)`, `dashboardFilters(dashboardId)`,
`dashboardTemplates()`).

---

## Stores (`src/features/dashboards/store/`)

### `dashboardBuilderStore.ts`

In-progress dashboard-editing state (mirrors `analysisStore`'s role in
007) — deliberately **not** persisted (session-only), matching 007's
Decision on `analysisStore`.

| Field | Type | Notes |
|---|---|---|
| `selectedWidgetId` | `string \| null` | which widget's config panel is open |
| `draftWidgetConfig` | object \| null | in-progress widget configuration before save |
| `isEditMode` | `boolean` | toggles between "viewing" and "arranging/configuring" — a read-only-shared viewer (FR-026) never sees this as `true` regardless of client state, since the server independently rejects any write |
| `activeBreakpoint` | `"desktop" \| "tablet" \| "mobile"` | which layout tier is currently being edited/previewed |
| `lastError` | `string \| null` | same safe-to-display convention as `analysisStore.lastError` |

Actions: `selectWidget(id)` / `clearSelectedWidget()`,
`setDraftWidgetConfig(config)`, `toggleEditMode()`,
`setActiveBreakpoint(bp)`, `setLastError`/`clearLastError`.

### `dashboardFilterStore.ts`

In-progress global filter bar state (US6) — separate from
`dashboardBuilderStore` because filters are a viewer-facing concern (a
read-only viewer can still change filters without "edit mode"), not an
editing concern.

| Field | Type | Notes |
|---|---|---|
| `activeGlobalFilters` | `DashboardFilter[]` | client-side working copy before "Save filters" persists them via `useDashboardFilters` |
| `hasUnsavedFilterChanges` | `boolean` | |

Actions: `setGlobalFilter(filterType, config)` / `clearGlobalFilter(filterType)`,
`resetToSaved(savedFilters)`.

---

## Component hierarchy (`src/features/dashboards/components/`)

```text
DashboardListPage              # project's dashboard list, favorites, template picker (US1, US8)
DashboardView                  # single dashboard shell — mounts the grid + filter bar + share/export controls
├── DashboardFilterBar         # global filters (US6)
├── DashboardGrid               # react-grid-layout wrapper (US3)
│   └── WidgetRenderer × N      # per-widget error boundary + type dispatch (research.md Decision 13)
│       ├── MapWidget           # thin wrapper around map feature's MapContainer (Decision 4)
│       ├── StatisticsWidget / MetricCardWidget
│       ├── TableWidget         # paginated (Decision 16)
│       ├── ChartWidget         # Bar/Line/Area/Pie via Recharts (Decision 3)
│       ├── GaugeWidget
│       ├── TextWidget / ImageWidget / HtmlWidget   # sanitized (FR-007)
│       └── WidgetErrorFallback / WidgetUnavailableState
├── WidgetConfigPanel           # add/edit widget form, per-type Zod-driven
├── DashboardShareDialog        # US7
├── DashboardExportMenu         # US9, dispatches to dashboardExportService
├── ReportGenerationDialog      # US5 on-demand
├── ScheduledReportsPanel       # US5 scheduling
└── DashboardAdminPanel         # US10, Project-Owner-only (research.md/spec Clarification)
```

Every component is presentational (Constitution Principle I); data
fetching lives in the hooks above, business logic (PDF/Excel assembly,
sanitization) in the services above.
