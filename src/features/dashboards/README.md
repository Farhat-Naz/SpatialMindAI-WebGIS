# `src/features/dashboards/` — Dashboard, Reporting & Analytics

Implements `specs/008-dashboard-analytics`: user-built dashboards
composed of widgets (map, statistics, table, four chart variants, gauge,
metric card, text, image, HTML), drag/resize/responsive layout, live
analytics data, sharing, templates, filters, export, scheduled reports,
and Administration.

## ⚠️ Naming: this is not `src/features/dashboard/` (singular)

`src/features/dashboard/` (singular) is the **application shell** —
`DashboardLayout`, `Navbar`, `Sidebar`, `StatusBar`, `useSidebar`,
`useBreakpoint`. It is page chrome, unrelated to this feature, and is
never touched or reused by this module.

`src/features/dashboards/` (plural, this directory) is the **business
feature** described above — the "Dashboard" entity a user creates, edits,
and shares.

The two happen to share a name because the app-shell module predates this
spec and this spec's own vocabulary ("Dashboard") is entity-first. See
`specs/008-dashboard-analytics/research.md` Decision 0 for the full
rationale. If you're looking for page layout/navigation chrome, you want
the singular module, not this one.

## Public API

Everything another feature may import is re-exported from `./index.ts`.
Store (`store/`) and service (`services/`) files are deliberately **not**
re-exported — they are this module's own internal editing/session state
and HTTP-wrapper implementation, consumed only by this module's own hooks
and components via relative imports.

- **Types**: `dashboard.types.ts`, `widget.types.ts` (full `export type *`)
- **Hooks** (React Query, server state): `useDashboards`, `useDashboard`,
  `useCreateDashboard`, `useRenameDashboard`, `useDeleteDashboard`,
  `useDuplicateDashboard`, `useSetFavorite`, `useSetDashboardVisibility`,
  `useDashboardTemplates`, `useAddWidget`, `useUpdateWidget`,
  `useDeleteWidget`, `useSaveLayout`, `useWidgetData`,
  `useAnalyticsSnapshot`, `useDashboardFilters`, `useCreateFilter`,
  `useDeleteFilter`, `useDashboardShares`, `useGrantShare`,
  `useRevokeShare`, `useReports`, `useGenerateReport`,
  `useDownloadReport`, `useScheduledReports`, `useCreateScheduledReport`,
  `useUpdateScheduledReport`, `useDeleteScheduledReport`
- **Components**: `DashboardListPage`, `CreateDashboardDialog`,
  `DashboardSettingsPanel`, `DashboardShareDialog`, `DashboardView`,
  `ReportGenerationDialog`, `ReportHistoryPanel`, `ScheduledReportsPanel`,
  `TemplatePicker`, `DashboardAdminPanel`

## Usage example

```tsx
import { DashboardListPage, useDashboards } from "@/features/dashboards"

// A project's dashboard list — the US1 entry point.
export function ProjectDashboardsRoute({ projectId }: { projectId: string }) {
  return <DashboardListPage projectId={projectId} />
}

// Or consume the data directly (e.g. a count badge elsewhere in the app):
function DashboardCountBadge({ projectId }: { projectId: string }) {
  const { data: dashboards } = useDashboards(projectId)
  return <span>{dashboards?.length ?? 0}</span>
}
```

## Known limitations

- Scheduled reports support CSV/Excel/HTML only — PDF export depends on
  client-side `html2canvas` DOM rendering, which has no browser to run
  against when a schedule fires server-side (research.md Decision 10).
  PDF remains on-demand/client-side only (US9).
- Public dashboards (`visibility: "public"`) are visible to any
  **authenticated** platform user, never to anonymous requests — there is
  no token-based public-link mechanism (research.md Decision 8).
- Widgets outside the viewport lazy-mount on scroll and Table Widgets page
  through the existing cursor-paginated Features API; a 100-widget
  dashboard does not fetch all 100 widgets' data on load (research.md
  Decision 16).

## Extending: adding a new widget type

The widget framework (research.md Decision 1) is a single `DashboardWidget`
row per widget, discriminated by a `type` column, with a `config` JSON
column for type-specific fields — not one table per widget type. Adding a
13th widget type touches exactly these four places:

1. **`types/widget.types.ts`** — add the new tag to the `WidgetType`
   union and a corresponding `config` shape to the `WidgetProps<T>`
   generic (T003).
2. **`src/shared/contracts/widget.schema.ts`** — add the new variant to
   the per-`type` discriminated Zod union so the new `config` shape is
   validated server-side before persistence (T071).
3. **`components/WidgetRenderer.tsx`** — add one entry to the
   `type`-keyed dispatch map (T146).
4. **One new component file** under `components/widgets/` implementing
   `WidgetProps<"yourNewType">`.

No other file needs to change — no new table, no new repository, no new
Route Handler. `WidgetRenderer`'s existing per-widget error boundary
(research.md Decision 13) covers the new type automatically.

## Consolidation: why some roadmap-named concepts aren't separate files

The original feature roadmap outline named several concepts that do
**not** exist as separate tables/repositories/stores in this
implementation. This is intentional, not a gap — each was folded into an
existing, already-justified home:

| Roadmap name | Actual home | Why |
|---|---|---|
| `WidgetConfiguration` | `DashboardWidget.config` (JSON column) | One widget = one row; type-specific fields live in `config` rather than a second table per widget (research.md Decision 1, data-model.md). |
| `TemplateRepository` | `dashboardRepository.ts` (writes) + a small `dashboardTemplateRepository.ts` (reads only) | Templates have no write surface of their own in this phase — only a list read — so no large dedicated repository is justified. |
| `FavoriteRepository` | `dashboardRepository.ts` | `DashboardFavorite` is owned alongside `Dashboard` itself; favoriting is a `Dashboard`-scoped action, not an independent concern. |
| `AnalyticsStore` | React Query cache (`useAnalyticsSnapshot`, `useWidgetData`) | Live analytics values are server state. Constitution's Additional Standards forbid mirroring server state into a Zustand store as a shadow cache. No `analyticsStore.ts` file exists. |
| `ReportStore` / `ExportStore` | React Query mutation state (`useGenerateReport`, `useDownloadReport` — `isPending`/`isError`) | Report generation/export-in-progress is transient mutation state, already the established pattern (007's `useExportResult`). No `reportStore.ts`/`exportStore.ts` file exists. |
| `DashboardStore` / `WidgetStore` / `LayoutStore` | `store/dashboardBuilderStore.ts` | All three are editor-only UI state (selected widget, draft config, edit mode, active breakpoint) — one store, not three, since they're read/written together during one editing session. |
| `FilterStore` | `store/dashboardFilterStore.ts` | Kept **separate** from `dashboardBuilderStore` on purpose: filters are viewer-facing (a read-only viewer can change them), while the builder store is editor-facing. Merging them would let filter state imply edit permissions it doesn't have. |

If you find yourself about to add a `TemplateRepository.ts`,
`analyticsStore.ts`, `reportStore.ts`, or similar file, re-read this table
first — the concern almost certainly already has a home above.

## Reports vs. ad-hoc exports: two different persistence models

This feature has **two** distinct "get data out" code paths that are easy
to conflate. They are intentionally different:

- **Ad-hoc export** (US9 — "export this dashboard/widget/table right
  now"): runs entirely client-side, produces a `Blob`, triggers a browser
  download, and is **never persisted** anywhere. This covers PDF (whole
  dashboard/report, via `jsPDF` + `html2canvas`), chart/widget image
  export (also `html2canvas`), and table data export (CSV/Excel via
  `xlsx`). See research.md Decision 9.
- **`Report`** (US5, plus Decision 10's Scheduled Reports): a persisted
  entity. Its generated file is stored server-side in Postgres as a
  `Bytes` column (`fileContent`) so it can be listed and re-downloaded
  later, across sessions — required because (a) FR-018/FR-033/SC-007
  require a durable per-user report history, and (b) a scheduled report
  has no browser open when it fires, so there is nothing to hold an
  in-memory `Blob` even momentarily. See research.md Decision 17.

**The rule of thumb**: if the user clicks "export" and expects a download
right now with nothing left behind, it's an ad-hoc export — don't persist
it. If the result needs to show up later in a history list, or is
produced by a schedule with no user present, it's a `Report` — don't try
to make it a client-side-only `Blob`. Do not add server-side storage to
the ad-hoc export path, and do not remove `Report.fileContent` persistence
in favor of regenerating on demand — regenerating later against
possibly-changed underlying data would silently produce a different
document than the one originally generated, which research.md Decision 17
explicitly rejects as incorrect (not just a performance trade-off), since
a report is a point-in-time snapshot.
