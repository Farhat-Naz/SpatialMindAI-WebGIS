# Quickstart: Validating Dashboard, Reporting & Analytics (008)

**Prerequisites**: A running dev environment (PostGIS instance, `.env`
configured, this feature's migration applied), the app running
(`npm run dev`), a seeded project with at least two layers (one polygon,
one point) and some existing `AnalysisRun` history (007), and a second
seeded user who is a project Editor for the sharing/permission scenarios
(depends on 006-collaboration's membership seed data, same dependency
007's quickstart already notes).

This guide exercises each capability area through the UI; every scenario
has a matching automated test (see plan.md's Testing Strategy) — this
document is for manual/exploratory validation.

---

## 1. Dashboard Builder (US1)

1. Open a project, navigate to Dashboards, click **New Dashboard**,
   choose **Blank**, name it "Test Dashboard." **Expect**: an empty
   dashboard is created and appears in the list.
2. Rename it. **Expect**: the new name appears everywhere (list,
   favorites if applicable).
3. Duplicate it. **Expect**: a second, independent dashboard appears;
   editing one does not affect the other.
4. Favorite it. **Expect**: it appears in the Favorites view; unfavoriting
   removes it from Favorites without deleting it.
5. Delete the duplicate. **Expect**: a confirmation prompt appears before
   deletion; after confirming, it is gone from the list.

## 2. Widgets (US2)

1. Add a Map Widget bound to the polygon layer. **Expect**: an
   interactive map renders showing that layer.
2. Add a Statistics Widget bound to project feature count. **Expect**: a
   numeric value renders.
3. Add a Table Widget bound to the point layer. **Expect**: a paginated,
   sortable attribute table renders.
4. Add a Bar Chart and a Gauge widget bound to an aggregated data source.
   **Expect**: both render the chosen visualization.
5. Add a Text widget with plain content and an HTML widget with a
   `<script>` tag in its content. **Expect**: the Text widget shows its
   content; the HTML widget renders without executing the script (view
   page source / dev console confirms no script ran).
6. Remove one widget. **Expect**: it disappears; other widgets' layout is
   unaffected.

## 3. Dashboard Layout (US3)

1. With 3+ widgets present, drag one to a new position. **Expect**: it
   moves; others reflow without overlapping.
2. Resize a widget by dragging its corner. **Expect**: it snaps to the
   grid; neighbors adjust.
3. Reload the page. **Expect**: exact positions/sizes are restored.
4. Resize the browser window to a narrow (mobile) width. **Expect**:
   widgets reflow into a readable, non-overflowing arrangement.
5. Group two widgets and collapse the group. **Expect**: they compact to
   a header; expanding restores them; reload preserves the
   collapsed/expanded state.

## 4. Live Analytics (US4)

1. Add a project-statistics widget showing feature count. In another
   browser tab/session, add a new feature to a layer in the same
   project. **Expect**: within ~30 seconds, the widget's count updates
   without a manual reload.
2. Add a layer-statistics widget. **Expect**: it shows counts/measures
   specific to that one layer, not the whole project.
3. Select/filter a subset of features elsewhere, then check a
   feature-statistics widget scoped to that selection. **Expect**: it
   reflects only the selected/filtered set.
4. Add a user-activity widget. **Expect**: it shows recent project
   activity (reusing the existing Activity feed).
5. As a Project Owner, add a storage-usage widget. **Expect**: it shows
   usage relevant to the current project.

## 5. Reporting (US5)

1. Generate a report as PDF. **Expect**: a downloadable PDF reflecting
   the dashboard's current state.
2. Generate as Excel and CSV. **Expect**: both download and open
   correctly in a standard external tool.
3. Generate as HTML. **Expect**: a self-contained HTML file downloads and
   opens correctly in a browser.
4. Schedule a report (Excel, daily). **Expect**: the schedule appears in
   Scheduled Reports; confirm `format: "pdf"` is not offered as a
   scheduling option (research.md Decision 10).
5. Open the Generated Reports list. **Expect**: all reports from steps
   1–3 are listed and re-downloadable.

## 6. Filtering (US6)

1. Set a global date-range filter. **Expect**: every date-aware widget
   updates to reflect only that range.
2. Apply a layer filter. **Expect**: widgets scoped to it show limited
   data.
3. Apply an attribute filter to a table/chart widget. **Expect**: only
   matching data shows.
4. Draw a spatial filter area on a map-bound widget. **Expect**: only
   features within it are reflected in that widget (and any other widget
   scoped to the same filter).
5. Save the dashboard. Reload. **Expect**: the filter configuration
   persists.

## 7. Sharing (US7)

1. Share the dashboard with a second (Editor-role) user at "view"
   permission.
2. Sign in as that user. **Expect**: the dashboard opens read-only;
   attempting to drag/resize/add a widget is prevented and the read-only
   state is visible in the UI.
3. Re-share at "edit" permission. **Expect**: that user can now modify
   widgets/layout.
4. Mark the dashboard "public" (as owner). **Expect**: any signed-in
   platform user (not just project members) can open it read-only;
   confirm an unauthenticated request (e.g., a logged-out session) is
   still rejected (research.md Decision 8).
5. Revoke the second user's share. **Expect**: their next open attempt
   fails.

## 8. Dashboard Templates (US8)

1. Create a dashboard from each template (Executive, Operations, Asset,
   Environmental). **Expect**: each is pre-populated with its documented
   starting widget set.
2. Edit a template-created dashboard. **Expect**: it behaves identically
   to a manually built one — no special "template mode" restrictions.

## 9. Export (US9)

1. Export the whole dashboard. **Expect**: a downloadable file
   representing its current visual state.
2. Export a single chart widget as an image. **Expect**: a downloadable
   image matching that widget's current rendering.
3. Export a table widget's data. **Expect**: a downloadable data file.
4. Download a previously generated report from step 5's list. **Expect**:
   the original file, unchanged.

## 10. Administration (US10)

1. As a Project Owner, open Dashboard Administration. **Expect**: every
   dashboard in the project is listed with owner, last-modified time, and
   sharing state.
2. View usage analytics. **Expect**: view counts and most-used widget
   types are shown.
3. View the audit log. **Expect**: every create/edit/delete/share action
   from prior steps in this walkthrough is listed with who and when.
4. View performance metrics. **Expect**: any notably slow-loading widget
   is identifiable.
5. As a non-Owner (Editor) user, attempt to open Administration.
   **Expect**: access is denied (research.md/spec Clarification —
   project-scoped, Owner-only).

---

## Failure / recovery scenarios

1. **Deleted data source**: delete the layer a Map/Table widget is bound
   to. **Expect**: the widget shows a clear "data source no longer
   available" state, not an error or blank render.
2. **Permission denied**: as a Viewer-role user (or a user with no
   project access at all), attempt to add/move a widget via a direct API
   call (bypassing the UI). **Expect**: `403`/`404` rejection, no data
   change.
3. **Scheduled report failure**: configure a schedule against a
   dashboard, then delete its bound layer before the schedule fires (or
   trigger `POST /api/reports/scheduled/run-due` manually in a
   test environment). **Expect**: a `Report` with `status: "failed"` and
   a clear `errorMessage` appears in Generated Reports; no infinite retry
   occurs.
4. **Concurrent layout edit**: open the same dashboard in two browser
   tabs, drag a widget in each without reloading between, save both.
   **Expect**: the dashboard ends in a well-defined state (the later save
   wins for the whole layout tier) — never a corrupted/partial layout.
5. **Empty filter result**: apply a filter combination matching zero
   data. **Expect**: an explicit "no data matches" state, not an error.

If every scenario above behaves as described, the feature satisfies its
spec's Acceptance Scenarios end-to-end.
