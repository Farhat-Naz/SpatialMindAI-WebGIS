# Feature Specification: Dashboard, Reporting & Analytics

**Feature Branch**: `008-dashboard-analytics`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Add enterprise Dashboard, Reporting and Analytics capabilities to SpatialMindAI-WebGIS: a dashboard builder with map/statistics/table/chart/gauge/metric/text/image/HTML widgets, resizable/draggable grid layout, live analytics (project/layer/feature/user/system/storage statistics), reporting (PDF/Excel/CSV/HTML, scheduled), filtering (date/layer/project/attribute/spatial/global), sharing (public/private/role-based/read-only), dashboard templates (blank/executive/operations/asset/environmental), export (dashboard/charts/tables/reports), and administration (dashboard management/usage analytics/audit logs/performance metrics). Reuse existing architecture; do not redesign it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dashboard Builder (Priority: P1)

A user creates a new dashboard to organize a view of their project's data, gives it a name, and manages its lifecycle — renaming it, duplicating it as a starting point for a variant, marking it a favorite for quick access, or deleting it when no longer needed.

**Why this priority**: A dashboard must exist before any widget, layout, filter, or share action is possible — this is the foundational container every other user story in this spec builds on.

**Independent Test**: Can be fully tested by creating a dashboard, renaming it, duplicating it, favoriting it, and deleting it — independent of any widget or analytics content existing yet.

**Acceptance Scenarios**:

1. **Given** a project the user has edit access to, **When** the user creates a new dashboard with a name, **Then** an empty dashboard is created and appears in the project's dashboard list.
2. **Given** an existing dashboard, **When** the user renames it, **Then** the new name is reflected everywhere the dashboard is referenced (list, favorites, shares).
3. **Given** an existing dashboard, **When** the user duplicates it, **Then** a new, independent dashboard is created with the same widgets/layout/filters, and further edits to either dashboard do not affect the other.
4. **Given** an existing dashboard, **When** the user marks it as a favorite, **Then** it appears in the user's favorites list; unfavoriting removes it from that list without deleting the dashboard.
5. **Given** an existing dashboard, **When** the user deletes it, **Then** it is removed from the project along with its widgets, layout, and any dashboard-specific filters, after an explicit confirmation step.

---

### User Story 2 - Widgets (Priority: P1)

A user adds one or more widgets to a dashboard — a Map, Statistics, Table, Chart (Bar/Line/Area/Pie), Gauge, Metric Card, Text, Image, or HTML widget — each configured to show a specific slice of project data or supporting content.

**Why this priority**: Widgets are what make a dashboard useful; without them a dashboard is an empty shell with no informational value.

**Independent Test**: Can be fully tested by adding one widget of each supported type to a dashboard and confirming each renders its configured content correctly — independent of layout arrangement or filtering.

**Acceptance Scenarios**:

1. **Given** an open dashboard, **When** the user adds a Map Widget bound to a project layer, **Then** the widget renders an interactive map showing that layer's features.
2. **Given** an open dashboard, **When** the user adds a Statistics Widget or Metric Card bound to a spatial-statistics result, **Then** the widget displays the current value(s) and updates when the underlying data changes.
3. **Given** an open dashboard, **When** the user adds a Table Widget bound to a layer's attribute data, **Then** the widget displays a paginated, sortable table of that layer's features/attributes.
4. **Given** an open dashboard, **When** the user adds a Chart Widget (Bar, Line, Area, or Pie) or a Gauge Widget bound to an aggregated data source, **Then** the widget renders the chosen visualization reflecting the current data.
5. **Given** an open dashboard, **When** the user adds a Text, Image, or HTML widget, **Then** the widget renders the user-provided content, with HTML content sanitized before rendering.
6. **Given** a widget the user no longer wants, **When** the user removes it, **Then** it disappears from the dashboard and the remaining widgets' layout is unaffected.

---

### User Story 3 - Dashboard Layout (Priority: P1)

A user arranges widgets on a dashboard's grid — resizing, dragging to reposition, grouping related widgets, and collapsing/expanding groups or individual widgets — with the arrangement adapting sensibly to different screen sizes.

**Why this priority**: A dashboard is only usable once its widgets are legibly arranged; this is a direct prerequisite for Widgets (US2) delivering real value.

**Independent Test**: Can be fully tested by adding two or more widgets to a dashboard, resizing and repositioning them via drag, and confirming the arrangement persists after a page reload — independent of what data any widget displays.

**Acceptance Scenarios**:

1. **Given** a dashboard with widgets, **When** the user drags a widget to a new grid position, **Then** the widget moves there and other widgets reflow to avoid overlapping it.
2. **Given** a widget on the grid, **When** the user resizes it by dragging its edge/corner, **Then** it snaps to the grid at the new size and neighboring widgets adjust position as needed.
3. **Given** a saved dashboard layout, **When** the user reopens the dashboard (including in a new session), **Then** the exact widget positions and sizes are restored.
4. **Given** a dashboard viewed on a narrower screen, **When** the layout renders, **Then** widgets reflow into a usable single/reduced-column arrangement rather than overflowing or becoming unreadable.
5. **Given** two or more related widgets, **When** the user groups them, **Then** they can be collapsed together to a compact header and expanded again, and the group's collapsed/expanded state persists like any other layout setting.

---

### User Story 4 - Live Analytics (Priority: P1)

A user views up-to-date statistics on a dashboard — project-level, layer-level, and feature-level statistics drawn from the project's spatial data, plus user activity, system activity, and storage usage — with the displayed values refreshing to stay current without a manual page reload.

**Why this priority**: Live, trustworthy data is the core value proposition of an analytics dashboard — without it, the builder and layout capabilities have nothing meaningful to display.

**Independent Test**: Can be fully tested by adding a Statistics Widget bound to a project's feature count, changing the underlying data (e.g., adding a feature elsewhere in the app), and confirming the widget's displayed value updates without a manual page reload — independent of any other widget type.

**Acceptance Scenarios**:

1. **Given** a dashboard with a project-statistics widget, **When** the underlying project data changes (e.g., a layer or feature is added), **Then** the widget's displayed value updates within a short, bounded time without requiring a manual refresh.
2. **Given** a dashboard with a layer-statistics widget, **When** the user views it, **Then** it shows accurate counts/measures for that specific layer (e.g., feature count, total area/length as applicable).
3. **Given** a dashboard with a feature-statistics widget, **When** the user views it, **Then** it reflects the currently selected/filtered set of features, not the whole project.
4. **Given** a dashboard with a user-activity widget, **When** the user views it, **Then** it shows recent activity (who did what, when) for the project, reusing the project's existing activity/audit trail.
5. **Given** a dashboard with a system-activity or storage-usage widget, **When** a Project Owner views it, **Then** it shows platform-level usage relevant to their project (e.g., storage consumed by that project's data).

---

### User Story 5 - Reporting (Priority: P2)

A user generates a formatted report from a dashboard's (or a selection of widgets') current data, choosing PDF, Excel, CSV, or HTML as the output format, and may schedule a report to be generated automatically on a recurring basis.

**Why this priority**: Reporting extends a dashboard's live view into a shareable, point-in-time artifact for stakeholders who don't use the dashboard directly — valuable, but secondary to having a dashboard worth reporting on.

**Independent Test**: Can be fully tested by generating a report from an existing dashboard in each supported format and confirming each opens correctly in a standard external tool — independent of scheduling.

**Acceptance Scenarios**:

1. **Given** a dashboard with content, **When** the user generates a report as PDF, **Then** a downloadable PDF is produced reflecting the dashboard's current widgets and data.
2. **Given** a dashboard with tabular/statistical widgets, **When** the user generates a report as Excel or CSV, **Then** a downloadable file containing that data is produced.
3. **Given** a dashboard, **When** the user generates a report as HTML, **Then** a downloadable, self-contained HTML file reflecting the dashboard's current state is produced.
4. **Given** a report configuration, **When** the user schedules it to run on a recurring basis (e.g., daily/weekly), **Then** the report is regenerated automatically at each scheduled time and added to the user's list of generated reports.
5. **Given** a previously generated report, **When** the user views their Generated Reports list, **Then** they can download any past report from that list.

---

### User Story 6 - Filtering (Priority: P2)

A user narrows the data shown across a dashboard's widgets using date, layer, project, attribute, or spatial filters, either applied globally (affecting every filter-aware widget) or to an individual widget.

**Why this priority**: Filtering makes a dashboard adaptable to different questions without rebuilding it, but the dashboard must already show data (US4) before filtering it has value.

**Independent Test**: Can be fully tested by applying a date-range global filter to a dashboard with multiple statistics widgets and confirming every filter-aware widget's displayed values update to reflect only data in that range — independent of report generation or sharing.

**Acceptance Scenarios**:

1. **Given** a dashboard with a global date filter control, **When** the user sets a date range, **Then** every date-aware widget updates to reflect only data within that range.
2. **Given** a dashboard, **When** the user applies a layer or project filter, **Then** widgets scoped to that filter show data limited to the selected layer(s)/project(s).
3. **Given** a table or chart widget, **When** the user applies an attribute filter (e.g., a value range or category), **Then** the widget shows only matching data.
4. **Given** a map-bound widget, **When** the user applies a spatial filter (e.g., a drawn area), **Then** only features within that area are reflected in that widget and any other widget scoped to the same filter.
5. **Given** an applied set of filters, **When** the user saves the dashboard, **Then** the filter configuration is preserved for the next time the dashboard is opened.

---

### User Story 7 - Sharing (Priority: P2)

A dashboard owner shares a dashboard with specific project members at a chosen permission level (view or edit), or marks it visible to any signed-in platform user; a recipient without edit rights views the dashboard in read-only mode.

**Why this priority**: Sharing extends a dashboard's value to a wider audience, but only matters once a dashboard has meaningful content to share.

**Independent Test**: Can be fully tested by sharing a dashboard with a second user at "view" permission and confirming that user can open and view it but cannot modify its widgets or layout — independent of reporting or export.

**Acceptance Scenarios**:

1. **Given** a dashboard, **When** the owner shares it with a specific project member at "view" permission, **Then** that member can open the dashboard in read-only mode but cannot add/move/resize/delete widgets.
2. **Given** a dashboard, **When** the owner shares it with a specific project member at "edit" permission, **Then** that member can modify the dashboard's widgets and layout, subject to their existing project role.
3. **Given** a dashboard, **When** the owner marks it "public," **Then** any signed-in platform user can view it in read-only mode; marking it "private" again immediately restricts access back to explicitly shared members.
4. **Given** a dashboard shared at "view" permission, **When** the recipient attempts a write action (e.g., dragging a widget), **Then** the action is prevented and the read-only state is clearly indicated in the UI.
5. **Given** a dashboard owner, **When** they revoke a specific user's access, **Then** that user can no longer open the dashboard on their next attempt.

---

### User Story 8 - Dashboard Templates (Priority: P3)

A user creates a new dashboard starting from a template — Blank, Executive, Operations, Asset, or Environmental — each pre-populated with a sensible starting set of widgets and layout for that use case, which the user can then customize freely.

**Why this priority**: Templates accelerate dashboard creation for common use cases, but every template's value depends on the Dashboard Builder (US1) and Widgets (US2) already existing.

**Independent Test**: Can be fully tested by creating a dashboard from each template and confirming it is pre-populated with that template's expected widget set — independent of any manual customization.

**Acceptance Scenarios**:

1. **Given** the dashboard creation flow, **When** the user chooses "Blank," **Then** an empty dashboard is created (equivalent to US1's default creation).
2. **Given** the dashboard creation flow, **When** the user chooses "Executive," **Then** a dashboard pre-populated with high-level summary widgets (key metrics, project overview) is created.
3. **Given** the dashboard creation flow, **When** the user chooses "Operations," **Then** a dashboard pre-populated with operational widgets (recent activity, layer/feature statistics) is created.
4. **Given** the dashboard creation flow, **When** the user chooses "Asset," **Then** a dashboard pre-populated with asset-oriented widgets (a map widget and a table widget bound to a feature layer) is created.
5. **Given** the dashboard creation flow, **When** the user chooses "Environmental," **Then** a dashboard pre-populated with environmental-monitoring-oriented widgets (map, relevant statistics/charts) is created.
6. **Given** any template-created dashboard, **When** the user edits its widgets or layout, **Then** it behaves identically to a manually built dashboard — the template only affects the starting state.

---

### User Story 9 - Export (Priority: P3)

A user exports a dashboard's content outside the application — the whole dashboard as an image/document, an individual chart as an image, an individual table's data as a file, or a previously generated report.

**Why this priority**: Export is a convenience layer over content that must already exist (widgets, reports); it doesn't unlock new analytical capability on its own.

**Independent Test**: Can be fully tested by exporting a single chart widget as an image and confirming the downloaded file matches the widget's current rendering — independent of exporting the whole dashboard.

**Acceptance Scenarios**:

1. **Given** an open dashboard, **When** the user exports the whole dashboard, **Then** a downloadable file representing its current visual state is produced.
2. **Given** a chart or gauge widget, **When** the user exports just that widget, **Then** a downloadable image of that widget's current rendering is produced.
3. **Given** a table widget, **When** the user exports just that widget's data, **Then** a downloadable data file (matching this platform's existing supported export formats) is produced.
4. **Given** a previously generated report (US5), **When** the user exports/downloads it, **Then** the file in its originally generated format is downloaded unchanged.

---

### User Story 10 - Administration (Priority: P3)

A Project Owner reviews dashboard-related administrative information for their project — which dashboards exist and who owns them, usage patterns (views, most-used widgets), an audit log of dashboard-related actions, and performance indicators (e.g., slow-loading widgets).

**Why this priority**: Administration is an oversight capability valuable once a project has accumulated enough dashboards and usage to need managing — it does not block any other story's independent value.

**Independent Test**: Can be fully tested by creating a few dashboards, performing some actions on them, and confirming a Project Owner can see them listed with correct ownership, activity, and basic performance information — independent of any other user story.

**Acceptance Scenarios**:

1. **Given** a project with multiple dashboards, **When** a Project Owner opens dashboard management, **Then** they see every dashboard in the project with its owner, last-modified time, and sharing state.
2. **Given** dashboard usage over time, **When** a Project Owner views usage analytics, **Then** they see view counts and the most-used widget types for their project's dashboards.
3. **Given** dashboard-related actions taken by project members, **When** a Project Owner views the audit log, **Then** every create/edit/delete/share action on a dashboard is listed with who performed it and when.
4. **Given** a dashboard with a widget that is slow to load, **When** a Project Owner views performance metrics, **Then** that widget is identifiable as a slow performer.

---

### Edge Cases

- What happens when a widget's underlying data source (a layer, or a spatial-analysis result) is deleted while a dashboard referencing it still exists? The widget shows a clear "data source no longer available" state rather than an error or blank/broken render.
- What happens when a user without edit access to a dashboard's project attempts to add/move/resize a widget? The action is rejected server-side (not just hidden client-side) with a clear permission-denied response.
- What happens when two users edit the same dashboard's layout at the same time? The dashboard reflects a defined, non-corrupting resolution (e.g., last-write-wins per widget/layout save) — concurrent edits never produce a corrupted or partially-saved layout.
- What happens when a scheduled report's generation fails (e.g., a data source became unavailable)? The failure is recorded and visible in the user's Generated Reports list with a clear reason, and does not silently retry forever.
- What happens when a dashboard is deleted while another user currently has it open (e.g., via a share)? That user's next interaction with the dashboard clearly indicates it no longer exists, rather than silently failing.
- What happens when a widget is bound to a very large underlying dataset (at the platform's supported scale)? The widget paginates/aggregates/summarizes rather than attempting to render every raw record at once, and shows progress/loading feedback rather than appearing frozen.
- What happens when a user attempts to make a dashboard "public" but lacks permission to do so (e.g., is an Editor, not the Owner)? The action is rejected with a clear permission-denied message.
- What happens when an HTML widget's content includes a script tag or other active content? The content is sanitized before rendering so it cannot execute arbitrary script in another user's session.
- What happens when a filter selection would result in zero matching data for a widget? The widget shows an explicit "no data matches the current filters" state, not an error.
- What happens when exporting a dashboard/report that exceeds a reasonable single-file size? The system either completes the export or clearly informs the user of the limitation, rather than silently truncating content.

## Requirements *(mandatory)*

### Functional Requirements

**Dashboard Builder**

- **FR-001**: System MUST allow a user with project edit access to create, rename, and delete dashboards within a project.
- **FR-002**: System MUST allow duplicating a dashboard into a new, fully independent copy (widgets, layout, and filters included).
- **FR-003**: System MUST allow a user to mark/unmark a dashboard as a favorite, personal to that user.
- **FR-004**: System MUST require explicit confirmation before deleting a dashboard.

**Widgets**

- **FR-005**: System MUST support adding, configuring, and removing the following widget types on a dashboard: Map, Statistics, Table, Chart (Bar, Line, Area, Pie), Gauge, Metric Card, Text, Image, and HTML.
- **FR-006**: System MUST bind each data-driven widget (Map, Statistics, Table, Chart, Gauge, Metric Card) to a project data source — a layer, a feature set, or a spatial-analysis result.
- **FR-007**: System MUST sanitize Text/HTML widget content before rendering it, preventing script execution.

**Dashboard Layout**

- **FR-008**: System MUST support a grid-based layout in which widgets can be resized and repositioned by dragging, with automatic reflow to avoid overlap.
- **FR-009**: System MUST persist a dashboard's widget positions and sizes so they are restored exactly on reopening.
- **FR-010**: System MUST render a usable, non-overflowing layout on narrower screens (responsive layout).
- **FR-011**: System MUST support grouping widgets and collapsing/expanding a group or an individual widget, with that state persisted.

**Live Analytics**

- **FR-012**: System MUST refresh data-driven widgets' displayed values to reflect underlying data changes within a short, bounded time, without requiring a manual page reload.
- **FR-013**: System MUST provide project-level, layer-level, and feature-level statistics as bindable widget data sources.
- **FR-014**: System MUST provide user-activity data (reusing the project's existing activity/audit trail) as a bindable widget data source.
- **FR-015**: System MUST provide system-activity and storage-usage data, scoped to the viewing user's accessible project(s), as bindable widget data sources.

**Reporting**

- **FR-016**: System MUST allow generating a report from a dashboard's current state in PDF, Excel, CSV, or HTML format.
- **FR-017**: System MUST allow scheduling a report to regenerate automatically on a recurring basis.
- **FR-018**: System MUST maintain a per-user list of generated reports (scheduled or on-demand) available for download; a scheduled report's output is delivered only through this in-app list — no outbound email or external notification is sent.
- **FR-019**: System MUST record and surface a clear failure reason when a scheduled report generation fails, without silent infinite retry.

**Filtering**

- **FR-020**: System MUST support date, layer, project, attribute, and spatial filters, applicable either globally across a dashboard or to an individual widget.
- **FR-021**: System MUST persist a dashboard's applied filter configuration as part of its saved state.
- **FR-022**: System MUST show an explicit "no data matches" state on a widget when its active filters produce zero results.

**Sharing**

- **FR-023**: System MUST allow a dashboard owner to share it with specific project members at "view" or "edit" permission.
- **FR-024**: System MUST allow only a dashboard's owner (or a project Owner) to mark it "public" (visible read-only to any signed-in platform user) or "private" (visible only to explicitly shared members); this action MUST be rejected for any other role.
- **FR-025**: A "public" dashboard MUST remain restricted to authenticated, signed-in platform users — the system MUST NOT expose any dashboard to an unauthenticated visitor.
- **FR-026**: System MUST enforce "view" permission as fully read-only server-side — no write action on a dashboard's widgets/layout/filters succeeds for a viewer, regardless of client-side UI state.
- **FR-027**: System MUST allow a dashboard owner to revoke a previously granted share at any time, taking effect on the recipient's next access attempt.

**Dashboard Templates**

- **FR-028**: System MUST offer Blank, Executive, Operations, Asset, and Environmental templates when creating a new dashboard, each pre-populating a defined starting set of widgets and layout.
- **FR-029**: System MUST treat a template-created dashboard identically to a manually built one for all subsequent editing — the template affects only initial state.

**Export**

- **FR-030**: System MUST allow exporting a whole dashboard's current visual state as a downloadable file.
- **FR-031**: System MUST allow exporting an individual chart/gauge widget as a downloadable image.
- **FR-032**: System MUST allow exporting an individual table widget's underlying data as a downloadable data file.
- **FR-033**: System MUST allow downloading any previously generated report from the Generated Reports list.

**Administration**

- **FR-034**: System MUST provide a Project Owner with a management view listing every dashboard in their project, its owner, last-modified time, and sharing state.
- **FR-035**: System MUST provide a Project Owner with usage analytics (view counts, most-used widget types) scoped to their project's dashboards.
- **FR-036**: System MUST provide a Project Owner with an audit log of dashboard create/edit/delete/share actions within their project.
- **FR-037**: System MUST surface basic per-widget performance information (e.g., identifying slow-loading widgets) to a Project Owner.
- **FR-038**: Administration capabilities (FR-034–FR-037) MUST be scoped to the requesting user's own project(s) — no platform-wide, cross-project administrative view exists in this phase.

**Cross-Cutting**

- **FR-039**: System MUST reject any dashboard write action (widget change, layout change, filter save, share change, delete) from a user without sufficient project/dashboard permission, server-side.
- **FR-040**: System MUST show a clear "data source unavailable" state on a widget whose bound layer/result has been deleted, rather than an error or blank render.
- **FR-041**: System MUST resolve concurrent edits to the same dashboard without producing a corrupted or partially-saved layout.
- **FR-042**: System MUST log every dashboard create/edit/delete/share/export/report action for audit purposes (FR-036).
- **FR-043**: System MUST support at least 100 dashboards per project and 100 widgets per dashboard without a degraded user experience.

### Key Entities

- **Dashboard**: A named, project-scoped container of widgets, layout, and filter configuration; has an owner, a sharing state (private/shared-with-specific-members/public), a favorite flag (per user), and creation/modification metadata.
- **Widget**: A single configured visualization or content block on a dashboard — its type (Map/Statistics/Table/Chart-variant/Gauge/Metric Card/Text/Image/HTML), its bound data source (if data-driven), its position/size, and its own filter overrides (if any).
- **Dashboard Layout**: The grid arrangement of a dashboard's widgets — position, size, grouping, and collapsed/expanded state — persisted per dashboard (and, for responsive behavior, potentially per breakpoint).
- **Dashboard Filter**: A saved filter configuration (date/layer/project/attribute/spatial) applied either globally to a dashboard or to one widget.
- **Dashboard Share**: A grant of "view" or "edit" access to a dashboard for a specific user, or the dashboard's public/private flag.
- **Dashboard Template**: A named starting configuration (Blank/Executive/Operations/Asset/Environmental) defining the initial widget set and layout for a newly created dashboard.
- **Report**: A generated, point-in-time export of a dashboard's data in a specific format (PDF/Excel/CSV/HTML), either on-demand or produced by a Scheduled Report; recorded in the requesting user's Generated Reports list with its outcome (succeeded/failed).
- **Scheduled Report**: A saved report configuration (dashboard, format, recipient user) plus a recurrence schedule, which produces a new Report on each occurrence.
- **Dashboard Usage Metric**: An aggregated record of dashboard/widget usage (views, interactions) used for Administration's usage analytics.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a dashboard and add their first working widget in under 3 minutes without consulting external documentation.
- **SC-002**: Dashboard widgets reflect an underlying data change within 30 seconds without any manual page reload, in 95% of observed cases.
- **SC-003**: A project can host at least 100 dashboards, and a single dashboard at least 100 widgets, with no widget taking more than a few seconds longer to load than it would in a smaller dashboard.
- **SC-004**: A user can generate a report in any of the four supported formats and successfully open it in a standard external tool with no manual correction, 100% of the time for valid input.
- **SC-005**: A dashboard's layout, filters, and widget configuration are restored exactly on 100% of reopens, including in a new session.
- **SC-006**: 100% of write attempts on a dashboard by a user without sufficient permission are blocked, with zero resulting data changes.
- **SC-007**: A user can locate and reopen any of their last 20 dashboards, or download any of their last 20 generated reports, in under 15 seconds.
- **SC-008**: Every interactive control in the dashboard builder and its widgets is reachable and operable using only a keyboard, verified across every widget type.

## Assumptions

- This feature is built as a new capability layered on the existing project/layer/feature/collaboration/spatial-analysis data model — it introduces new dashboard-specific entities (Key Entities above) but does not alter any existing entity's meaning or storage.
- "Reuse existing repositories, services, hooks, stores and contracts" means widget data sources (statistics, layers, features, activity, analysis results) are read through the existing feature modules' established public APIs, not re-implemented; this feature adds only the dashboard/widget/report/share layer on top.
- Project roles (Owner/Editor/Viewer) and their enforcement come from the existing collaboration feature; this spec does not define new project-level roles, only dashboard-specific permission grants (view/edit share, public/private) layered on top of them.
- "Real-time"/"live" updates (US4, FR-012) means data refreshes automatically within a short, bounded interval (SC-002's 30 seconds), not necessarily an instantaneous push on every single change — the exact refresh mechanism is a technical decision for planning, not specified here.
- Scheduled reports are delivered only through the in-app Generated Reports list (per Clarifications) — no email or external notification integration is introduced by this feature.
- "Public" dashboards are visible only to authenticated, signed-in platform users (per Clarifications) — no unauthenticated/anonymous public link capability exists in this phase.
- Administration (US10) is scoped per-project to that project's Owner (per Clarifications) — no new platform-wide administrator role is introduced in this phase.
- Widget data volume is expected to follow the same scale the rest of the platform already supports (e.g., the feature/layer scale established by Spatial Analysis's 100,000-feature target); a widget summarizes/paginates rather than rendering unbounded raw data.
- Machine learning-driven insights, third-party BI tool integration (e.g., Power BI, Tableau), and any capability requiring them are out of scope for this feature, as explicitly stated in the request.
