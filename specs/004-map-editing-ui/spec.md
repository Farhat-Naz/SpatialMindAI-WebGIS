# Feature Specification: Map Editing & GIS UI

**Feature Branch**: `004-map-editing-ui`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Build the complete GIS User Interface layer, transforming the current map application into a professional WebGIS similar to ArcGIS Online and QGIS, built on top of the approved 003-database-foundation Projects/Layers/Features/Attributes/Styles API: Project Explorer, Layer Tree (visibility, opacity, ordering), Search Panel, Attribute Table, Drawing Toolbar (Point/Line/Polygon), Feature Editing, Geometry Editing, Delete Feature, Selection and Multi-Selection, Popup Information, Context Menu, Measure Distance, Measure Area, Coordinate Display, Scale Bar, North Arrow, Basemap Switcher, Zoom to Feature, Zoom to Layer, Fit to Data, Import GeoJSON, Export GeoJSON, Shapefile Import, Full Screen, Dark Mode, Keyboard Shortcuts, React Query integration, Zustand integration, Accessibility, Performance optimization."

## User Scenarios & Testing *(mandatory)*

<!--
  This feature's scope (34 requested capabilities) is organized into eight
  independently testable, prioritized user stories rather than split across
  multiple spec documents, so that MVP delivery (P1) and every incremental
  slice after it remain reviewable and independently shippable — the same
  mechanism 003-database-foundation used for its three stories, scaled up.
-->

### User Story 1 - Browse Projects and Manage the Layer List (Priority: P1)

A GIS user opens the application, sees the list of their projects, opens one,
and sees that project's layers listed in their draw order. They can toggle a
layer's visibility, adjust its opacity, and reorder layers — all before any
map-editing capability exists.

**Why this priority**: Nothing else in this feature is meaningful until a
user can see which projects and layers exist. This is the smallest slice
that delivers standalone value (organizing/browsing existing data) and
unblocks every later story.

**Independent Test**: Open the app, browse the project list, open a project,
confirm its layers are listed in the correct order, toggle one layer's
visibility off/on, adjust its opacity, and reorder two layers — verifiable
with zero features drawn on the map yet.

**Acceptance Scenarios**:

1. **Given** a user with two or more projects, **When** they open the
   Project Explorer, **Then** all their projects are listed and selecting
   one opens its Layer Tree.
2. **Given** an open project with multiple layers, **When** the Layer Tree
   renders, **Then** layers appear in the same order as the project's
   persisted layer order (per the existing reorder capability).
3. **Given** a layer in the Layer Tree, **When** the user toggles its
   visibility off, **Then** its features immediately disappear from the map
   without affecting any other layer, and toggling it back on restores them.
4. **Given** two layers in a project, **When** the user drags one layer
   above the other in the Layer Tree, **Then** the new order is saved (via
   the existing layer-reorder capability) and persists across a page reload.
5. **Given** a layer, **When** the user locks it, **Then** every draw/edit/
   delete action against that layer's features is blocked (with a clear
   message) while it remains visible and viewable, and unlocking it
   immediately restores editing.

---

### User Story 2 - View, Navigate, and Inspect Features on the Map (Priority: P2)

A user opens a layer and sees its features rendered on the map using each
feature's stored style. They click a feature to select it and see its
attributes in a popup, read the cursor's coordinates, read the scale bar,
switch basemaps, and zoom to a single feature, a single layer, or the
combined extent of every visible layer at once.

**Why this priority**: This is the baseline "look at my data" experience —
independently valuable and testable without any editing capability, and a
prerequisite for every editing story that follows.

**Independent Test**: Open a layer with existing features, confirm they
render with their stored styles, click one to see its popup, zoom to the
layer's extent, zoom to a single feature, fit the view to all visible
layers combined, and switch basemaps — all without creating, editing, or
deleting anything.

**Acceptance Scenarios**:

1. **Given** a layer with features that have explicit styles, **When** the
   layer is made visible, **Then** each feature renders using its own style,
   falling back to the documented default for any feature with none.
2. **Given** a rendered feature, **When** the user clicks it, **Then** it is
   visually indicated as selected and a popup shows its attributes.
3. **Given** the map is open, **When** the user moves the cursor over it,
   **Then** the current coordinates are displayed and update continuously;
   the scale bar reflects the current zoom level at all times.
4. **Given** a layer with features spread across a wide area, **When** the
   user chooses "zoom to layer," **Then** the map frames that layer's full
   extent; choosing "zoom to feature" for one feature frames just that
   feature.
5. **Given** two or more visible layers with features in different areas,
   **When** the user chooses "fit to data," **Then** the map frames the
   combined extent of every currently visible layer's features (not just
   one), distinct from "zoom to layer."
6. **Given** the existing place-search control, **When** a project/layer is
   open, **Then** searching for a place still flies the map to that
   location without disrupting the currently open layer's selection.

---

### User Story 3 - View and Edit Feature Attributes (Priority: P3)

A user opens a layer's Feature Panel and Attribute Table, sees every
feature's attributes in a spreadsheet-like grid, edits a value, and adds a
new attribute key to a feature.

**Why this priority**: Attribute data is often as important as geometry in a
GIS workflow, and this story is independently testable/valuable once
features can be viewed (P2), without needing drawing/geometry-editing
capability yet.

**Independent Test**: Open a layer with several features carrying different
attribute keys, confirm the Attribute Table shows one column per key seen
across the layer (blank where a feature lacks that key), edit a cell, add a
new key to one feature, and confirm selecting a row highlights the matching
feature on the map.

**Acceptance Scenarios**:

1. **Given** a layer whose features have differing attribute keys, **When**
   the Attribute Table opens, **Then** it shows one column per distinct key
   present on any feature in the layer, with blank cells where a feature
   lacks that key (per the confirmed union-of-keys design).
2. **Given** an open Attribute Table, **When** the user edits a cell's value,
   **Then** the change is saved to that feature without altering its
   geometry or style.
3. **Given** a feature with no `"status"` attribute, **When** the user adds a
   `"status"` key with a value to that feature, **Then** a new column
   appears (if not already present) and only that feature's cell is
   populated — every other feature's `"status"` cell (if the column already
   existed) is unaffected.
4. **Given** the Attribute Table or Feature Panel, **When** the user selects
   a row, **Then** the corresponding feature is highlighted/panned-to on the
   map, and selecting a feature on the map highlights its row.

---

### User Story 4 - Draw and Edit Geometry (Priority: P4)

A user selects a drawing tool, draws a new feature of any supported geometry
type onto a layer, then later selects an existing feature and drags its
vertices to reshape it, copies/pastes or duplicates it, or deletes it
entirely.

**Why this priority**: This is the core "editing" capability the whole
feature is building toward, correctly sequenced after viewing (P2) and
attribute editing (P3) since it is the highest-complexity, highest-risk
capability (geometry validation, vertex manipulation).

**Independent Test**: Open a layer, draw a new point, line, and polygon,
confirm each appears and is saved; select an existing feature, drag one of
its vertices, confirm the reshaped geometry is saved; copy a feature and
paste it, confirm a second, independent feature now exists; duplicate a
feature directly; delete a feature and confirm it disappears from the map
and the layer's feature list.

**Acceptance Scenarios**:

1. **Given** an open layer and an active drawing tool, **When** the user
   draws a new Point, Line, or Polygon feature (or any of the six supported
   geometry types), **Then** the feature is saved to that layer and
   immediately appears on the map.
2. **Given** a user drawing a self-intersecting polygon, **When** they
   attempt to finish the drawing, **Then** the system rejects it with a
   clear, actionable message and nothing is saved (consistent with the
   existing geometry validation rules).
3. **Given** an existing feature, **When** the user enters edit mode and
   drags one of its vertices to a new position, **Then** the updated shape
   is saved and immediately reflected on the map.
4. **Given** a selected feature, **When** the user chooses "delete," **Then**
   it is removed from the map and the layer's feature list, and no other
   feature is affected.
5. **Given** a selected feature, **When** the user chooses "copy" and then
   "paste," **Then** a new, independent feature is created with the same
   geometry, attributes, and style, and the original feature is unchanged.
6. **Given** a selected feature, **When** the user chooses "duplicate,"
   **Then** a new, independent copy is created in one action, equivalent to
   copy immediately followed by paste.
7. **Given** a feature on a locked layer, **When** the user attempts to
   draw, edit, or delete it, **Then** the action is blocked with a clear
   message and nothing changes.

---

### User Story 5 - Multi-Select and Bulk Actions (Priority: P5)

A user selects several features at once — via Shift-click or a box/drag
select — and performs a bulk action (at minimum, delete) on all of them
together, or opens a right-click context menu for quick single-feature/layer
actions.

**Why this priority**: Builds directly on single selection (P2) and
deletion (P4); valuable for real workflows involving many features, but not
required for the feature to be independently useful at lower priorities.

**Independent Test**: Select three features via Shift-click, confirm all
three show as selected, delete them in one action, and confirm all three are
removed; separately, right-click a single feature and confirm a context menu
with relevant actions appears.

**Acceptance Scenarios**:

1. **Given** several features on a visible layer, **When** the user
   Shift-clicks each in turn (or drags a selection box over them), **Then**
   all of them are visually indicated as selected simultaneously.
2. **Given** multiple selected features, **When** the user chooses "delete
   selected," **Then** every selected feature is removed and no unselected
   feature is affected.
3. **Given** a single feature or a layer, **When** the user right-clicks it,
   **Then** a context menu appears offering actions relevant to that target
   (e.g., delete, zoom to, edit), and choosing "Escape" or clicking elsewhere
   dismisses it without side effects.

---

### User Story 6 - Measure Distance and Area (Priority: P6)

A user activates a measurement tool, clicks points along a line or around a
polygon on the map, and sees a running distance or area total, without
creating any permanent feature.

**Why this priority**: A common, valuable GIS utility that is fully
independent of the editing stories — it never mutates persisted data.

**Independent Test**: Activate "measure distance," click three points on the
map, confirm a running distance total is shown; activate "measure area,"
click a polygon's points, confirm an area total is shown; close the tool and
confirm nothing was saved as a feature.

**Acceptance Scenarios**:

1. **Given** the "measure distance" tool is active, **When** the user clicks
   a sequence of points, **Then** the cumulative distance is displayed and
   updates after each click.
2. **Given** the "measure area" tool is active, **When** the user clicks
   points forming a polygon, **Then** the enclosed area is displayed.
3. **Given** an in-progress or completed measurement, **When** the user
   closes the measurement tool, **Then** no feature is created in any layer
   — the measurement is purely ephemeral.

---

### User Story 7 - Import and Export Spatial Data (GeoJSON & Shapefile) (Priority: P7)

A user imports a GeoJSON file or a Shapefile into a layer, adding its
features to whatever already exists there, and exports a layer's current
features as a downloadable GeoJSON file.

**Why this priority**: A valuable data-interchange capability, but
reasonably deferred behind the core viewing/editing stories since it is not
needed for day-to-day map editing.

**Independent Test**: Import a GeoJSON file with a few features into a layer
that already has features, confirm the layer now contains both the original
and imported features with none lost; separately, import a Shapefile and
confirm its features appear correctly positioned on the map; export a layer
and confirm the downloaded file contains every current feature.

**Acceptance Scenarios**:

1. **Given** a layer with existing features, **When** the user imports a
   valid GeoJSON file, **Then** its features are added to the layer and
   every pre-existing feature remains unchanged (append, never replace, per
   the confirmed import behavior).
2. **Given** a GeoJSON file containing an unsupported geometry type or
   malformed structure, **When** the user attempts to import it, **Then**
   the entire import is rejected with a clear message and zero features from
   that file are added (all-or-nothing).
3. **Given** a valid Shapefile (its required `.shp`/`.shx`/`.dbf` companion
   parts) describing a coordinate system other than WGS84, **When** the user
   imports it into a layer, **Then** its features are reprojected to WGS84
   and appended to the layer, positioned correctly on the map, with the
   same append-only, all-or-nothing behavior as GeoJSON import.
4. **Given** a Shapefile missing a required companion file (e.g., no
   `.dbf`) or specifying an unsupported geometry type, **When** the user
   attempts to import it, **Then** the import is rejected with a clear
   message and nothing is added.
5. **Given** an open layer, **When** the user chooses "export," **Then** a
   GeoJSON file downloads containing every feature currently in that layer,
   with its attributes and geometry.

---

### User Story 8 - Map Chrome and Keyboard Access (Priority: P8)

A user toggles full-screen map view, works comfortably in dark mode
alongside every panel this feature introduces, and completes common actions
using documented keyboard shortcuts instead of the mouse.

**Why this priority**: Polish and accessibility that apply across every
other story; sequenced last since it has no independent data value of its
own, but is still a mandatory, testable slice.

**Independent Test**: Toggle full-screen on/off, switch the app to dark mode
and confirm every new panel/toolbar from this feature remains legible and
correctly styled, and complete at least three documented actions using only
the keyboard.

**Acceptance Scenarios**:

1. **Given** the map view, **When** the user toggles full screen, **Then**
   the map expands to fill the screen and toggling again restores the
   previous layout, with no loss of current position/zoom/selection.
2. **Given** the application in dark mode, **When** any panel or toolbar
   introduced by this feature is open, **Then** it renders using the same
   dark-mode-aware styling as the rest of the application.
3. **Given** a feature is selected, **When** the user presses the documented
   "delete" shortcut, **Then** it is deleted exactly as if "delete" had been
   chosen from a menu; pressing "Escape" cancels whatever tool is active
   without side effects.
4. **Given** the browser does not support the Fullscreen API, **When** the
   user views the map, **Then** the Full Screen control is hidden or
   disabled rather than erroring.

---

### Edge Cases

- What happens when a user tries to draw or edit a feature on a layer that
  was deleted (e.g., in another browser tab) since the page loaded? → The
  action MUST fail with a clear "not found" error; the UI MUST NOT crash or
  silently pretend the action succeeded.
- What happens when two browser sessions edit the same feature at nearly the
  same time? → Last write wins, per the concurrency model already accepted
  in 003-database-foundation's Assumptions — no locking or merge UI is
  introduced by this feature.
- What happens when a GeoJSON import file contains a mix of valid and
  invalid features? → The entire file is rejected (all-or-nothing, per
  FR-035); nothing from it is partially imported.
- What happens when a Shapefile is missing a required companion file, uses
  an unsupported geometry type, or specifies a coordinate system that cannot
  be reprojected? → The entire import is rejected with a clear message;
  nothing from it is partially imported, matching GeoJSON import's
  all-or-nothing behavior.
- What happens when a user's selection includes features from more than one
  layer? → Out of scope for this phase — multi-selection operates within a
  single layer at a time (see Assumptions).
- What happens when the Attribute Table or Feature Panel is opened for a
  layer with zero features? → An explicit empty state is shown, not a blank
  or broken grid.
- What happens when a user attempts to reorder layers while offline or the
  reorder request fails? → The Layer Tree MUST revert to the last known
  saved order and surface an error, never leave the UI showing an order that
  was not actually saved.
- What happens when a measurement tool is left active and the user switches
  layers or projects? → The in-progress measurement is discarded; it never
  carries over to a different layer/project context.
- What happens when "fit to data" is chosen but no layer is currently
  visible, or every visible layer has zero features? → The map's view MUST
  NOT change, and a clear message MUST explain there is nothing to fit to.
- What happens when a user pastes/duplicates a feature onto a locked
  layer? → Rejected with the same "layer is locked" message as any other
  mutating action on that layer (FR-006a); nothing is created.
- What happens when a user copies a feature, then deletes the original
  before pasting? → Paste still succeeds — the clipboard holds an
  independent snapshot of the feature's geometry/attributes/style at copy
  time, not a live reference to the original.

## Requirements *(mandatory)*

### Functional Requirements

**Project Explorer & Layer Tree (US1)**

- **FR-001**: System MUST let a user browse and switch among their own
  projects.
- **FR-002**: System MUST list a selected project's layers in their
  persisted draw order (per the existing layer-ordering capability).
- **FR-003**: System MUST let a user toggle a layer's visibility on the map;
  this state is session-only and is NOT persisted to the database.
- **FR-004**: System MUST let a user adjust a layer's rendering opacity;
  this state is session-only and is NOT persisted to the database.
- **FR-005**: System MUST let a user reorder layers via the Layer Tree, and
  MUST persist the new order using the existing layer-reorder capability.
- **FR-006**: System MUST reflect a layer that is created, renamed, or
  deleted in the Layer Tree without requiring a full page reload.
- **FR-006a**: System MUST let a user lock a layer, preventing any draw,
  geometry-edit, attribute-edit, or delete action on that layer's features
  until it is unlocked; this lock state is session-only and is NOT
  persisted to the database, consistent with visibility/opacity (FR-003/
  FR-004). A locked layer's features remain visible and selectable for
  viewing (popup, zoom-to-feature) — locking prevents mutation, not viewing.

**Viewing & Navigation (US2)**

- **FR-007**: System MUST render a visible layer's features on the map using
  each feature's own stored style, falling back to the documented platform
  default for a feature with none.
- **FR-008**: System MUST let a user select a single feature by clicking it,
  visually indicating its selected state.
- **FR-009**: System MUST show a selected/clicked feature's attributes in a
  popup, triggered by click (and/or explicit keyboard selection) — not by
  mouse hover alone, so the capability remains keyboard-accessible.
- **FR-010**: System MUST display the map cursor's current coordinates,
  updating continuously as the cursor moves.
- **FR-011**: System MUST display a scale bar reflecting the map's current
  zoom level at all times the map is visible.
- **FR-012**: System MUST display a north-arrow map chrome element.
- **FR-013**: System MUST let a user switch among at least two basemap
  providers.
- **FR-014**: System MUST let a user zoom the map to frame a single layer's
  full feature extent ("zoom to layer").
- **FR-015**: System MUST let a user zoom the map to frame a single selected
  feature ("zoom to feature").
- **FR-016**: System MUST let a user fit the map view to the combined extent
  of every currently visible layer's features at once ("fit to data"),
  distinct from zooming to any single layer.
- **FR-017**: System MUST keep the existing place-search capability usable
  while a project/layer is open, without disrupting the current layer
  selection or map state.

**Attributes & Feature Panel (US3)**

- **FR-018**: System MUST list a layer's features in a Feature Panel; MUST
  synchronize selection bidirectionally between this panel and the map
  (selecting in one selects/highlights in the other).
- **FR-019**: System MUST display an Attribute Table for a layer with one
  row per feature and one column per attribute key present on any feature in
  that layer, leaving a cell blank when a feature lacks that key.
- **FR-020**: System MUST let a user edit a feature's attribute value via
  the Attribute Table, persisting the change without altering that feature's
  geometry or style.
- **FR-021**: System MUST let a user add a new attribute key/value to an
  individual feature via the Attribute Table.
- **FR-022**: System MUST let a user edit a feature's style via the Feature
  Panel, persisting the change without altering its geometry or attributes.

**Drawing & Geometry Editing (US4)**

- **FR-023**: System MUST provide a Drawing Toolbar letting a user draw a new
  feature of any of the six supported geometry types (at minimum Point,
  LineString, and Polygon) onto a chosen layer.
- **FR-024**: System MUST let a user edit an existing feature's geometry by
  dragging its vertices, persisting the updated shape.
- **FR-025**: System MUST let a user add or remove vertices of an existing
  line or polygon feature during geometry editing.
- **FR-026**: System MUST let a user delete a selected feature, removing it
  from the map and its layer's feature list without affecting any other
  feature.
- **FR-027**: System MUST reject an invalid drawn or edited geometry with a
  clear, actionable message and MUST NOT save it, consistent with the
  existing geometry validation rules.
- **FR-027a**: System MUST let a user undo the single, immediately-preceding
  edit action (a geometry change, an attribute/style change, or a deletion)
  within the current session, reverting it exactly; this is a one-step
  undo only — no redo, no multi-step history, nothing persisted across a
  page reload (per the amended Assumption above).
- **FR-027b**: System MUST let a user cancel an in-progress drawing or
  geometry edit before it is saved, discarding it with no change to any
  existing feature.
- **FR-027c**: System MUST let a user copy a selected feature (its geometry,
  attributes, and style) to a session-only clipboard holding at most one
  feature at a time; copying a new feature replaces whatever was
  previously copied.
- **FR-027d**: System MUST let a user paste the clipboard's feature as a
  new feature in the currently active layer, duplicating its geometry,
  attributes, and style; pasting does NOT remove or alter the original
  feature, and MAY be repeated to paste multiple copies.
- **FR-027e**: System MUST let a user duplicate a selected feature directly
  (equivalent to copy immediately followed by paste in one action) without
  needing to use the clipboard explicitly.

**Multi-Selection & Context Menu (US5)**

- **FR-028**: System MUST let a user select multiple features at once within
  a single layer (at minimum via Shift-click; a box/drag-select tool is also
  in scope).
- **FR-029**: System MUST let a user perform a bulk delete on all currently
  selected features in one action.
- **FR-030**: System MUST provide a right-click context menu on a feature or
  layer offering actions relevant to that context, dismissible via Escape or
  clicking elsewhere with no side effects.

**Measurement (US6)**

- **FR-031**: System MUST let a user measure cumulative distance along a
  user-drawn line, displaying the running total in a standard unit.
- **FR-032**: System MUST let a user measure the area of a user-drawn
  polygon, displaying the result in a standard unit.
- **FR-033**: System MUST treat every measurement as ephemeral — closing the
  measurement tool MUST NOT create or alter any persisted feature.

**Import & Export (US7)**

- **FR-034**: System MUST let a user import a GeoJSON file into a chosen
  layer, appending its features to that layer's existing features without
  altering or removing any of them.
- **FR-035**: System MUST reject a GeoJSON import file that is not valid or
  contains an unsupported geometry type in full (all-or-nothing) — zero
  features from a rejected file may be partially imported.
- **FR-036**: System MUST let a user import a Shapefile into a chosen layer,
  appending its features the same way as GeoJSON import (FR-034);
  coordinates MUST be reprojected to WGS84 (EPSG:4326) using the Shapefile's
  accompanying projection definition before being appended.
- **FR-037**: System MUST reject a Shapefile that is missing a required
  companion file, specifies an unsupported geometry type, or cannot be
  reprojected, in full (all-or-nothing) — matching FR-035's behavior for
  GeoJSON.
- **FR-038**: System MUST let a user export a layer's current features
  (geometry, attributes, and style) as a downloadable GeoJSON file.

**Map Chrome & Accessibility (US8)**

- **FR-039**: System MUST let a user toggle a full-screen map view and
  return to the previous layout without losing current position, zoom, or
  selection; MUST hide or disable this control gracefully if the browser
  does not support it.
- **FR-040**: System MUST render every panel/toolbar introduced by this
  feature consistently with the application's existing dark/light theme.
- **FR-041**: System MUST provide documented keyboard shortcuts for, at
  minimum: deleting the current selection, canceling/escaping the active
  tool, and toggling the Layer Tree/panels.
- **FR-042**: Every interactive control introduced by this feature MUST be
  operable via keyboard alone and MUST expose an accessible name, meeting
  WCAG 2.2 AA per the project constitution.

**Cross-Cutting**

- **FR-043**: System MUST reuse the existing, already-established
  projects/layers/features data-fetching and caching capability from
  003-database-foundation as the single source of truth for that data —
  this feature MUST NOT introduce a second, duplicate way of fetching or
  caching the same server data.
- **FR-044**: System MUST keep every client-only interaction concept
  introduced by this feature (active tool, current selection, in-progress
  measurement, panel open/closed state, basemap choice, per-session
  visibility/opacity) in a single, centralized place per concept — never
  duplicated ad hoc per component, and never mixed together with cached
  server data.

### Key Entities

- **Selection** *(client-only, not persisted)*: the set of currently
  selected feature ids within one layer at a time. Cleared when the active
  layer or project changes.
- **Active Tool** *(client-only, not persisted)*: which single tool (draw,
  edit-geometry, measure-distance, measure-area, box-select, none) is
  currently engaged; tools are mutually exclusive — activating one
  deactivates any other.
- **Measurement Result** *(client-only, ephemeral)*: the in-progress or
  completed distance/area value and its unit; discarded when the
  measurement tool closes, never persisted as a Feature.
- **Basemap Choice** *(client-only, not persisted)*: which basemap provider
  is currently active; independent of any project/layer.
- **Layer Display State** *(client-only, session-only)*: a layer's current
  visibility, opacity, and lock state as shown on the map; distinct from
  the layer's persisted `order`, which this feature reads/writes via the
  existing reorder capability.
- **Import Result** *(client-only, transient)*: the outcome of a GeoJSON or
  Shapefile import attempt (success with a feature count, or a rejection
  reason); shown to the user and then discarded — not itself persisted.
- **Clipboard** *(client-only, session-only)*: at most one copied feature's
  geometry/attributes/style, snapshotted at copy time (not a live reference
  to the original feature); replaced whenever a new feature is copied,
  cleared when the session ends.

This feature introduces no new persisted entities — it is a UI/interaction
layer over the existing `Project`/`Layer`/`Feature`/`FeatureAttribute`/
`FeatureStyle` entities defined in 003-database-foundation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can locate and open any of their projects and see its
  layers listed in under 3 seconds under normal conditions.
- **SC-002**: A layer with 5,000 rendered features remains smoothly
  pannable and zoomable, with no interaction taking noticeably longer than
  a fraction of a second to respond.
- **SC-003**: A newly drawn feature is visible on the map and durably saved
  within 2 seconds of the user finishing the drawing.
- **SC-004**: 100% of invalid drawn or edited geometries are rejected with a
  clear, actionable message — none are ever silently accepted or saved.
- **SC-005**: The Attribute Table remains responsive for scrolling and
  editing with at least 10,000 features loaded in a single layer.
- **SC-006**: Importing a GeoJSON file of 1,000 features completes, with
  every feature visible on the map, within 10 seconds.
- **SC-007**: Importing a Shapefile of 1,000 features, including
  reprojection to WGS84, completes within 15 seconds.
- **SC-008**: Every documented keyboard shortcut completes its action
  without the user ever needing to touch the mouse.
- **SC-009**: Zero critical or serious accessibility violations are found
  across every panel/toolbar introduced by this feature (WCAG 2.2 AA).
- **SC-010**: A user sees a measurement result within 1 second of finishing
  a measurement line or polygon.
- **SC-011**: Switching basemaps or toggling full-screen completes in under
  1 second with no loss of the map's current position or zoom.
- **SC-012**: "Fit to data" correctly frames every currently visible layer's
  features 100% of the time it is used with at least one non-empty visible
  layer.

## Assumptions

- **Layer visibility, opacity, and lock state are all session-only**: none
  is persisted to the database in this phase (the approved
  003-database-foundation `Layer` model has no such fields); reintroducing
  them per-session on every visit is an accepted trade-off, with
  persistence noted as a reasonable future enhancement for all three, not
  a gap in this spec.
- **A locked layer blocks mutation, not viewing**: features on a locked
  layer remain visible, selectable, and viewable (popup, zoom-to-feature);
  only draw/edit/attribute-edit/delete/paste/duplicate-into-it are blocked.
- **The clipboard holds at most one feature and is session-only**: it is
  not shared across browser tabs/sessions and does not survive a page
  reload; copying a new feature silently replaces whatever was previously
  copied (no clipboard history).
- **Multi-selection is scoped to one layer at a time**: selecting across
  multiple layers simultaneously is out of scope for this phase.
- **Concurrency model is inherited unchanged** from 003-database-foundation:
  last-write-wins, no locking or real-time multi-user collaboration UI.
- **Dark mode itself already exists** (established in 001-app-foundation);
  this feature's obligation is to render consistently within it, not to
  build a theming system.
- **Search UI is reused, not rebuilt**: this feature integrates the existing
  002-search capability into the map-editing shell rather than replacing it.
- **Undo is limited to a single, immediately-preceding edit action** — reverting
  the last geometry/attribute/style change or the last deletion, one step,
  in the current browser session only. This is a narrower capability than a
  full undo/redo history stack, which remains out of scope for this phase:
  there is no redo, no multi-step undo, and nothing here is persisted across
  a page reload. (Amended during planning to resolve "undo last edit" being
  requested in scope for the drawing/editing plan increment; the original,
  broader "undo/redo out of scope" framing is narrowed to this single-step
  capability rather than contradicted outright.)
- **GeoJSON and Shapefile import always append** (per the confirmed
  clarification); replacing or merging a layer's existing features on
  import is out of scope for this phase. Both formats share the same
  all-or-nothing rejection behavior.
- **Shapefile reprojection assumes a standard `.prj` companion file**: when
  present, its coordinate system definition is used to reproject to WGS84;
  a Shapefile with no `.prj` file is assumed to already be in WGS84, per
  common GIS tooling convention — this is not itself validated further.
- **The Attribute Table's columns are the union of attribute keys** present
  on any feature in the layer (per the confirmed clarification), computed
  from current data rather than a fixed per-layer schema — consistent with
  003-database-foundation's free-form attribute model.
- **No new backend geometry/attribute/style capability is required**: every
  capability in this spec is achievable against the existing
  Projects/Layers/Features API from 003-database-foundation; GeoJSON/
  Shapefile import and export may require an additional bulk-oriented
  endpoint, which is a planning-phase decision, not specified here.
