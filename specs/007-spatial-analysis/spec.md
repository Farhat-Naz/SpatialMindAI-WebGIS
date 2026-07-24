# Feature Specification: Spatial Analysis Toolset

**Feature Branch**: `007-spatial-analysis`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Add professional GIS spatial analysis capabilities similar to ArcGIS Pro, ArcGIS Online and QGIS while fitting the existing architecture: Buffer Analysis, Spatial Query, Measurement Tools, Overlay Analysis, Geometry Processing, Spatial Statistics, Raster-Ready Framework, Analysis History, Export Analysis, and a dockable Analysis UI. Reuse the existing map/search/projects/layers/features/editing/styling/import-export/collaboration architecture; do not redesign it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buffer Analysis (Priority: P1)

A GIS analyst selects one or more point, line, or polygon features (or an
entire layer) and generates a buffer zone at a specified distance and unit
around them, optionally dissolving the resulting buffers into a single
combined shape, to answer "what falls within X distance of this?"

**Why this priority**: Buffering is the single most common spatial analysis
operation in any GIS workflow (service areas, setback zones, proximity
screening) and is a foundation many other analyses build on.

**Independent Test**: Can be fully tested by selecting a layer or a set of
features, running Buffer with a distance and unit, and confirming a new
result layer appears containing correctly-shaped, topologically valid
buffered geometry — independent of any other analysis type.

**Acceptance Scenarios**:

1. **Given** a point layer, **When** the analyst runs Buffer with a distance
   of 500 meters, **Then** a new result layer is created containing one
   circular buffer polygon per input point.
2. **Given** a line layer, **When** the analyst runs Buffer with a distance
   and unit, **Then** a new result layer is created containing a corridor
   polygon around each line, each polygon topologically valid.
3. **Given** multiple selected features across one layer, **When** the
   analyst runs Buffer with "Dissolve" enabled, **Then** a single merged
   buffer polygon is produced instead of one buffer per feature.
4. **Given** a buffer distance and a unit of measure (meters, kilometers,
   feet, or miles), **When** the analyst runs Buffer, **Then** the output
   geometry reflects the distance converted correctly regardless of the
   layer's stored coordinate reference system.

---

### User Story 2 - Spatial Query & Selection (Priority: P1)

An analyst selects features in one layer based on their spatial relationship
to features in another layer (intersects, within, contains, touches,
crosses, overlaps, nearest, within a distance), or based on attribute
values, to answer "which features meet this condition?"

**Why this priority**: Spatial and attribute selection is the entry point
for nearly every downstream analysis or export — most other tools operate on
the current selection rather than an entire layer.

**Independent Test**: Can be fully tested by choosing a source layer, a
reference layer, and a spatial predicate (e.g., "Intersects"), running the
query, and confirming the correct subset of source features becomes
selected/highlighted, independent of any other tool.

**Acceptance Scenarios**:

1. **Given** a source layer and a reference layer, **When** the analyst runs
   "Select by Location" using the Intersects predicate, **Then** every
   source feature that spatially intersects at least one reference feature
   is selected.
2. **Given** a source layer and a reference layer, **When** the analyst
   chooses Within, Contains, Touches, Crosses, or Overlaps, **Then** only
   features satisfying that specific spatial predicate are selected.
3. **Given** a source layer, a reference feature, and a search distance,
   **When** the analyst runs a Distance/Nearest query, **Then** the source
   features within that distance are selected and ranked by distance to the
   nearest reference feature, with the distance value displayed for each.
4. **Given** a layer and an attribute filter expression, **When** the
   analyst runs "Select by Attribute," **Then** only features whose
   attributes satisfy the expression are selected.
5. **Given** an existing selection, **When** the analyst combines a spatial
   query with an attribute filter, **Then** the resulting selection reflects
   both conditions applied together.

---

### User Story 3 - Measurement Tools (Priority: P1)

A user interactively measures distance, area, perimeter, radius, bearing,
azimuth, and coordinates directly on the map, and can measure an existing
feature's length/area/perimeter without drawing a new shape.

**Why this priority**: Ad hoc measurement is the most frequently used
capability in any mapping tool and is expected to be available immediately,
independent of running a formal analysis job.

**Independent Test**: Can be fully tested by activating the Measure tool,
clicking points on the map, and confirming the displayed distance/area/
bearing values update live and match the drawn geometry — independent of any
saved layer or analysis job.

**Acceptance Scenarios**:

1. **Given** the Measure Distance tool is active, **When** the user clicks a
   sequence of points on the map, **Then** the cumulative distance and each
   segment's bearing/azimuth are displayed live and update as more points
   are added.
2. **Given** the Measure Area tool is active, **When** the user draws a
   closed shape, **Then** the enclosed area and the shape's perimeter are
   displayed.
3. **Given** the Measure Radius tool is active, **When** the user clicks a
   center point and drags to a second point, **Then** the radius distance
   and the resulting circle are displayed.
4. **Given** any point on the map, **When** the user hovers or clicks with
   the Coordinates tool active, **Then** the coordinates of that point are
   displayed in the project's configured coordinate format.
5. **Given** an existing feature, **When** the user selects it and opens
   Measurement, **Then** its length/area/perimeter (as applicable to its
   geometry type) is displayed without requiring the user to redraw it.
6. **Given** a point without elevation data available, **When** the user
   requests an elevation reading, **Then** the system displays a clearly
   labeled "not available" placeholder rather than a fabricated value.

---

### User Story 4 - Overlay Analysis (Priority: P1)

An analyst combines or compares two layers using standard overlay
operations — Union, Intersection, Difference, Clip, Erase, Identity, and
Symmetrical Difference — to answer "where do these overlap," "what's the
combined shape," or "what's left after removing this area."

**Why this priority**: Overlay analysis is the standard way to combine two
authoritative datasets and is required for most real-world "compare layer A
to layer B" workflows.

**Independent Test**: Can be fully tested by selecting two layers and
running Intersection, then confirming a new result layer is created
containing only the geometry common to both inputs, independent of any
other overlay operation.

**Acceptance Scenarios**:

1. **Given** two overlapping polygon layers, **When** the analyst runs
   Intersection, **Then** a new result layer containing only the shared area
   is created, carrying attributes from both inputs.
2. **Given** two polygon layers, **When** the analyst runs Union, **Then** a
   new result layer representing the combined extent of both inputs is
   created, with all sub-areas correctly attributed to their source(s).
3. **Given** two polygon layers, **When** the analyst runs Difference,
   **Then** a new result layer containing the portion of the first layer
   that does not overlap the second is created.
4. **Given** an input layer and a clip-boundary layer, **When** the analyst
   runs Clip, **Then** a new result layer contains only the portions of the
   input that fall inside the boundary, with input attributes preserved
   unchanged.
5. **Given** an input layer and an erase layer, **When** the analyst runs
   Erase, **Then** a new result layer contains only the portions of the
   input that fall outside the erase layer.
6. **Given** an input layer and an identity layer, **When** the analyst runs
   Identity, **Then** a new result layer contains all of the input geometry,
   with attributes from the identity layer appended where they overlap.
7. **Given** two polygon layers, **When** the analyst runs Symmetrical
   Difference, **Then** a new result layer contains the areas present in
   either input but not in both.

---

### User Story 5 - Geometry Processing (Priority: P2)

An analyst cleans up or restructures geometry — simplifying vertex-heavy
shapes, smoothing jagged edges, splitting a feature into parts, merging
features, dissolving by attribute, converting between multipart and
singlepart representation, and repairing invalid geometry.

**Why this priority**: Geometry cleanup is essential for making imported or
hand-drawn data usable in downstream analysis, but is secondary to having
the core analysis operations (buffer, query, measure, overlay) available
first.

**Independent Test**: Can be fully tested by selecting a feature with excess
vertices, running Simplify with a tolerance, and confirming the output
feature has fewer vertices while remaining a valid, recognizably similar
shape — independent of any other geometry operation.

**Acceptance Scenarios**:

1. **Given** a polygon or line with many vertices, **When** the analyst runs
   Simplify with a tolerance value, **Then** a result feature with fewer
   vertices is produced that remains topologically valid.
2. **Given** a jagged line or polygon boundary, **When** the analyst runs
   Smooth, **Then** a result feature with a visually smoothed boundary is
   produced while preserving the feature's approximate extent.
3. **Given** a single feature that visually consists of separable parts,
   **When** the analyst draws a split line and runs Split, **Then** two or
   more new features are created from the one input feature.
4. **Given** multiple selected features of the same geometry type, **When**
   the analyst runs Merge, **Then** a single new feature combining their
   geometry is created.
5. **Given** a layer with a chosen grouping attribute, **When** the analyst
   runs Dissolve, **Then** adjacent/overlapping features sharing the same
   attribute value are combined into one feature per unique value.
6. **Given** a multipart feature, **When** the analyst runs Multipart to
   Singlepart, **Then** one feature per constituent part is created, each
   carrying a copy of the original attributes.
7. **Given** multiple singlepart features, **When** the analyst runs
   Singlepart to Multipart, **Then** a single multipart feature combining
   the selected parts is created.
8. **Given** a feature with invalid geometry (e.g., self-intersection),
   **When** the analyst runs Repair Geometry, **Then** the system produces a
   corrected, valid feature or clearly reports that the geometry could not
   be automatically repaired.

---

### User Story 6 - Spatial Statistics (Priority: P2)

An analyst requests summary statistics for a layer or selection — feature
count, total/average area, total/average length, density, bounding box,
centroid, convex hull, and extent — to characterize a dataset without
generating a new persisted layer.

**Why this priority**: Statistics provide quick, low-cost insight into a
dataset and support decisions about which other analyses are worth running,
but are not required to unlock the core analysis workflows.

**Independent Test**: Can be fully tested by selecting a layer and running
"Summarize," then confirming the displayed feature count, total area (for
polygons), and bounding box match the underlying data — independent of any
other analysis operation.

**Acceptance Scenarios**:

1. **Given** any layer or selection, **When** the analyst runs Summarize,
   **Then** the feature count is displayed.
2. **Given** a polygon layer or selection, **When** the analyst runs
   Summarize, **Then** total area and average area per feature are
   displayed.
3. **Given** a line layer or selection, **When** the analyst runs Summarize,
   **Then** total length and average length per feature are displayed.
4. **Given** a point layer or selection and a reference area, **When** the
   analyst requests Density, **Then** features-per-unit-area is displayed.
5. **Given** any layer or selection, **When** the analyst requests
   Bounding Box, Centroid, Convex Hull, or Extent, **Then** the corresponding
   geometry and/or coordinates are displayed and can be added as a result
   layer.

---

### User Story 7 - Raster-Ready Framework (Priority: P3)

A system administrator or analyst can register raster-oriented layer types
(raster layers, heatmaps, elevation/DEM, slope, aspect, hillshade) in the
project's layer model and see them represented consistently in the layer
list, styling panel, and analysis toolbox — even though the underlying
heavy raster computation is not yet implemented.

**Why this priority**: Establishing the data model and UI slots now avoids a
breaking architecture change later, but no user depends on this to get value
today since the actual raster processing is explicitly out of scope for this
feature.

**Independent Test**: Can be fully tested by registering a placeholder
raster-type layer and confirming it appears correctly in the layer list and
analysis toolbox with an accurate "not yet available" state — independent of
any vector analysis operation.

**Acceptance Scenarios**:

1. **Given** the analysis toolbox, **When** the user browses available
   operation categories, **Then** a "Raster & Surface Analysis" category is
   visible listing Heatmap, Elevation/DEM, Slope, Aspect, and Hillshade as
   entries.
2. **Given** a raster-type entry the user selects, **When** it has not yet
   been implemented, **Then** the tool clearly indicates it is not yet
   available rather than failing silently or appearing identical to a
   working tool.
3. **Given** the layer data model, **When** a raster or heatmap layer
   reference is created, **Then** it is stored and listed alongside vector
   layers in the project's layer list with a distinct type indicator.
4. **Given** a point layer, **When** the user requests a Heatmap
   visualization, **Then** a density-based heatmap rendering is shown on the
   map (client-side visualization; not a persisted analysis result).

---

### User Story 8 - Analysis History (Priority: P2)

A user reviews a persistent log of every analysis run in the current
project — including its parameters, input layers/features, output, execution
time, timestamp, and the user who ran it — and can re-run a prior analysis
with its original parameters, optionally adjusting them first.

**Why this priority**: History and reproducibility are what separate a
professional analysis tool from a one-off calculator, and are expected by
users familiar with ArcGIS/QGIS geoprocessing history — but the history
feature has value only once there are analyses to record, so it follows the
core operations.

**Independent Test**: Can be fully tested by running any single analysis
(e.g., Buffer), opening the History panel, and confirming an entry appears
with the correct parameters and a working "Re-run" action — independent of
which analysis type was run.

**Acceptance Scenarios**:

1. **Given** any completed analysis, **When** the user opens the History
   panel, **Then** an entry appears showing the operation type, parameters,
   input(s), output, execution time, timestamp, and the user who ran it.
2. **Given** a history entry, **When** the user selects "Re-run," **Then**
   the analysis is executed again using the same parameters, producing a new
   result and a new history entry.
3. **Given** a history entry, **When** the user selects "Re-run with
   changes," **Then** the analysis form is pre-filled with the prior
   parameters and can be edited before re-execution.
4. **Given** a project with prior analysis history, **When** any project
   member reopens the project (including in a new session), **Then** the
   full history is still available.
5. **Given** a saved set of parameters the user marks as a preset, **When**
   the user starts a new analysis of that type, **Then** the preset is
   offered as a quick-start option.

---

### User Story 9 - Export Analysis Results (Priority: P3)

An analyst exports the output of any analysis (a result layer or a
statistics table) as GeoJSON, Shapefile, CSV, or KML for use outside the
application.

**Why this priority**: Export extends the value of an analysis result beyond
the current session, but the analysis must exist and be usable in-app before
export matters.

**Independent Test**: Can be fully tested by running any analysis that
produces a result layer, choosing "Export" and a target format, and
confirming a correctly formatted downloadable file is produced —
independent of which analysis produced the result.

**Acceptance Scenarios**:

1. **Given** a completed analysis result, **When** the user exports as
   GeoJSON, **Then** a valid GeoJSON file containing the result geometry and
   attributes is downloaded.
2. **Given** a completed analysis result, **When** the user exports as
   Shapefile, **Then** a downloadable Shapefile package containing the
   result geometry and attributes is produced.
3. **Given** a completed analysis result with an attribute table, **When**
   the user exports as CSV, **Then** a CSV file containing the attribute
   values (and coordinate summary for point results) is downloaded.
4. **Given** a completed analysis result, **When** the user exports as KML,
   **Then** a valid KML file containing the result geometry is downloaded.
5. **Given** a result exceeding a reasonable single-file size, **When** the
   user exports it, **Then** the system either completes the export or
   clearly informs the user of the size limitation rather than silently
   truncating the data.

---

### User Story 10 - Analysis Workspace UI (Priority: P1)

A user opens a dockable Analysis Panel containing a categorized Toolbox of
every available operation, runs an operation and sees a Progress Dialog
while it executes, reviews output in a Result Panel, inspects run details in
a Property Panel and a summary view, and browses past runs in the History
Panel — all without leaving the map view.

**Why this priority**: The workspace UI is the shell every other user story
is delivered through; without it, no analysis operation is reachable, so it
must ship alongside the first analysis capability.

**Independent Test**: Can be fully tested by opening the Analysis Panel,
confirming the Toolbox lists all operation categories, and confirming the
panel can be docked, undocked, resized, and closed without affecting the
underlying map or other panels — independent of running any specific
analysis.

**Acceptance Scenarios**:

1. **Given** the map workspace, **When** the user opens the Analysis Panel,
   **Then** it docks alongside existing panels (e.g., Layers) without
   obscuring the map, and can be resized, collapsed, or moved.
2. **Given** the Analysis Panel is open, **When** the user browses the
   Toolbox, **Then** operations are grouped by category (Buffer, Query,
   Measurement, Overlay, Geometry Processing, Statistics, Raster & Surface)
   matching this feature's user stories.
3. **Given** a running analysis, **When** the user views the Progress
   Dialog, **Then** it shows live progress, an elapsed-time indicator, and a
   Cancel action.
4. **Given** a completed analysis, **When** the user views the Result
   Panel, **Then** it shows the output summary and provides actions to add
   the result to the project, export it, or discard it.
5. **Given** any analysis run (in progress, completed, or failed), **When**
   the user opens its Property Panel, **Then** the full parameter set and
   status for that specific run are shown.
6. **Given** every panel and control in the Analysis workspace, **When** a
   user navigates using only the keyboard or a screen reader, **Then** every
   action (run, cancel, re-run, export, dismiss) is reachable and
   announced with an appropriate accessible name.

---

### Edge Cases

- What happens when an analysis is run against a layer/selection with zero
  features? System MUST reject with a clear "nothing to analyze" message
  before starting a job, rather than running and returning an empty result.
- What happens when two input layers for an overlay/query operation use
  different coordinate reference systems? System MUST reconcile them
  automatically (reprojecting as needed) and MUST NOT silently produce
  geometrically incorrect output.
- How does the system handle an analysis whose output would be empty (e.g.,
  Intersection of two non-overlapping layers)? The result is created as a
  valid, explicitly empty result and clearly labeled as such, not treated as
  an error.
- How does the system handle an analysis job that fails mid-execution
  (e.g., invalid input geometry, server error)? The job is marked "Failed"
  with a user-readable reason, the failure is recorded in history, and no
  partial/corrupt result is added to the project.
- How does the system handle a user cancelling a running job? The job stops
  as soon as practical, is marked "Cancelled" in history, and no partial
  result is added to the project.
- What happens when a user without project membership (or without the
  required permission) attempts to run an analysis? The request is refused
  with a clear "permission denied" message and no job is created or
  logged as executed (an access-denial attempt may still be logged for
  audit purposes).
- What happens when an analysis targets an unusually large dataset (at or
  beyond the supported 100,000-feature scale)? The system MUST show
  progress feedback rather than appearing frozen, and MUST allow
  cancellation throughout.
- What happens when a user tries to "Undo" an analysis result after other
  edits have been made in the project since that result was added? The
  undo removes only the analysis result layer/output itself and MUST NOT
  revert unrelated later edits.
- What happens when Simplify, Smooth, or Repair Geometry is run on a
  feature where the operation is a no-op (already simple/valid)? The system
  completes successfully and clearly indicates no change was needed, rather
  than erroring.
- What happens when a user requests Split without drawing a valid split
  line, or Merge on features of incompatible geometry types? The system
  rejects the request with a specific, actionable validation message before
  running the operation.

## Requirements *(mandatory)*

### Functional Requirements

**Buffer Analysis**

- **FR-001**: System MUST allow users to generate a buffer around one or
  more selected point, line, or polygon features, or around an entire
  layer.
- **FR-002**: System MUST allow the user to specify a buffer distance and a
  unit of measure (meters, kilometers, feet, miles).
- **FR-003**: System MUST allow the user to optionally dissolve multiple
  buffer outputs into a single combined result.

**Spatial Query & Selection**

- **FR-004**: System MUST allow selecting features in a layer based on a
  spatial relationship (Intersects, Within, Contains, Touches, Crosses,
  Overlaps) to features in another layer or to a manually drawn shape.
- **FR-005**: System MUST allow finding the nearest feature(s) in a
  reference layer to a source feature, and selecting/filtering by distance.
- **FR-006**: System MUST allow selecting features by an attribute-based
  filter expression, independently or combined with a spatial query.

**Measurement Tools**

- **FR-007**: System MUST provide interactive tools to measure distance,
  area, perimeter, radius, bearing, azimuth, and point coordinates directly
  on the map.
- **FR-008**: System MUST allow measuring an existing feature's
  length/area/perimeter without requiring the user to redraw it.
- **FR-009**: System MUST display a clearly labeled placeholder (not a
  fabricated value) when elevation data is requested but unavailable.

**Overlay Analysis**

- **FR-010**: System MUST support Union, Intersection, Difference, Clip,
  Erase, Identity, and Symmetrical Difference operations between two input
  layers, each producing a new result layer.

**Geometry Processing**

- **FR-011**: System MUST support Simplify (with a user-specified
  tolerance) and Smooth operations on selected features.
- **FR-012**: System MUST support Split (dividing one feature into multiple)
  and Merge (combining multiple features into one).
- **FR-013**: System MUST support Dissolve by a chosen attribute, combining
  features that share the same value.
- **FR-014**: System MUST support converting multipart features to
  singlepart, and singlepart features to multipart.
- **FR-015**: System MUST support detecting and repairing invalid geometry,
  and MUST clearly report when a feature cannot be automatically repaired.

**Spatial Statistics**

- **FR-016**: System MUST compute and display, for any selected layer or
  feature selection: feature count; total and average area (polygons);
  total and average length (lines); density; bounding box; centroid;
  convex hull; and extent.

**Raster-Ready Framework**

- **FR-017**: System MUST represent raster-oriented layer types (raster
  layer, heatmap, elevation/DEM, slope, aspect, hillshade) as first-class
  entries in the project's layer model and analysis toolbox, distinctly
  marked from vector layers, even where the underlying computation is not
  yet implemented.
- **FR-018**: System MUST provide a working, client-side point-density
  Heatmap visualization as the one raster-adjacent capability implemented in
  this feature; all other raster operations (DEM, slope, aspect, hillshade)
  MUST be visibly present but explicitly marked "not yet available."

**Analysis History**

- **FR-019**: System MUST persist a record of every analysis run,
  capturing: operation type, full parameter set, input layer(s)/
  feature(s), output reference, execution time, timestamp, the user who ran
  it, and the project it belongs to.
- **FR-020**: System MUST allow a user to re-run a prior analysis using its
  recorded parameters, either unchanged or after editing them.
- **FR-021**: System MUST allow saving a named parameter set as a reusable
  preset for a given operation type.

**Export**

- **FR-022**: System MUST allow exporting any completed analysis result as
  GeoJSON, Shapefile, CSV, or KML.

**Analysis Workspace UI**

- **FR-023**: System MUST provide a dockable Analysis Panel containing a
  categorized Toolbox of all available operations.
- **FR-024**: System MUST show a Progress Dialog for any running analysis,
  including a Cancel action.
- **FR-025**: System MUST provide a Result Panel for reviewing a completed
  analysis output, a Property Panel for inspecting a specific run's full
  parameters/status, a History Panel listing past runs, and an Analysis
  Summary view.

**Cross-Cutting Behavior**

- **FR-026**: System MUST support running an analysis against a manual
  feature selection, an entire layer, or multiple layers where the
  operation accepts more than one input.
- **FR-027**: System MUST show live progress feedback for any analysis
  expected to take longer than a brief, near-instant response.
- **FR-028**: System MUST allow the user to cancel a running analysis job
  at any point before completion.
- **FR-029**: System MUST execute analysis jobs without blocking the user
  from continuing other work in the application while a job runs.
- **FR-030**: System MUST recover gracefully from a failed analysis job:
  the failure is recorded with a user-readable reason, and no partial or
  corrupted result is added to the project.
- **FR-031**: System MUST allow a user to undo (remove) a specific analysis
  result from their project without affecting unrelated data or other
  analysis results.
- **FR-032**: System MUST reject an analysis request with a clear message
  when the selected input(s) contain zero features, before starting a job.
- **FR-033**: System MUST reconcile mismatched coordinate reference systems
  between analysis inputs automatically rather than producing silently
  incorrect output.

**Security & Permissions**

- **FR-034**: System MUST only allow users who are members of the project
  to run any analysis operation within that project.
- **FR-035**: System MUST enforce the requesting user's existing project
  permission level (e.g., viewer vs. editor) when deciding whether an
  analysis (which creates new project data) is allowed.
- **FR-036**: System MUST log every analysis attempt — successful,
  failed, cancelled, and permission-denied — for audit purposes.

**Accessibility**

- **FR-037**: Every control in the Analysis workspace (Toolbox entries,
  Run, Cancel, Re-run, Export, panel open/close/resize) MUST be operable
  via keyboard alone.
- **FR-038**: Every control and panel in the Analysis workspace MUST expose
  an accessible name/role (ARIA) reflecting its action or content.
- **FR-039**: Live-updating content (progress, measurement readouts,
  live status changes) MUST be announced to screen reader users as it
  changes.

### Key Entities

- **Analysis Operation**: A catalog entry describing one available tool
  (e.g., "Buffer," "Intersection," "Simplify") — its category, required
  input(s), parameter schema, and whether it is fully implemented or a
  raster-framework placeholder.
- **Analysis Run**: A single execution of an Analysis Operation — its
  parameters, input reference(s) (layer/feature selection), status (queued,
  running, completed, failed, cancelled), progress, execution time,
  timestamp, the user who ran it, the project it belongs to, and a
  reference to its output (if any).
- **Analysis Result**: The output produced by a completed Analysis Run —
  either a new result layer/feature set or a statistics summary — that a
  user can add to the project, export, or discard.
- **Analysis History Entry**: The persisted, project-scoped audit record of
  an Analysis Run, retained after the run completes so it can be reviewed
  or used to re-run the operation.
- **Analysis Preset**: A named, reusable parameter set saved for a specific
  Analysis Operation, scoped to a user or project.
- **Raster Layer Reference**: A placeholder entity representing a
  raster-oriented layer (raster, heatmap, DEM, slope, aspect, or hillshade)
  registered in the project's layer model, distinct from vector layers,
  which may or may not yet have working analysis behind it.
- **Spatial Selection**: The current set of features and/or layers a user
  has selected (via map interaction, spatial query, or attribute filter)
  that serves as the input to an Analysis Run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can configure and launch any core analysis operation
  (Buffer, Spatial Query, Overlay) in under 60 seconds from opening the
  Analysis Panel, without consulting external documentation.
- **SC-002**: 95% of analysis operations on datasets up to 100,000 features
  return a result or a clear failure/cancellation state within a duration
  the user perceives as responsive, with progress feedback visible
  throughout.
- **SC-003**: The system supports at least 100 analysis jobs executing
  concurrently across all active users without one job's failure or delay
  affecting another's correctness.
- **SC-004**: 100% of analysis runs (successful, failed, and cancelled) are
  recoverable in the History panel with complete parameter and outcome
  information, even after the user closes and reopens the project.
- **SC-005**: A user can locate and re-run any of their past 20 analyses in
  under 15 seconds using the History panel.
- **SC-006**: 100% of analysis attempts by non-members or under-permissioned
  users are blocked and none result in project data being created.
- **SC-007**: Every interactive control in the Analysis workspace is
  reachable and operable using only a keyboard, verified across all ten
  analysis capability areas.
- **SC-008**: A user can export any completed analysis result to their
  chosen format (GeoJSON, Shapefile, CSV, KML) and successfully open it in a
  standard external tool without manual correction.

## Assumptions

- This feature extends the existing map, layers, features, projects, and
  collaboration capabilities already present in the application; it does
  not introduce a new authentication, project, or layer data model of its
  own beyond what is described under Key Entities.
- "Project member" and permission levels (e.g., viewer/editor/owner) refer
  to the roles already established by the existing collaboration feature;
  this spec does not define new roles, it only requires that analysis
  actions respect them.
- Analysis results are, by default, added to the current project as new
  layers/features (for geometry-producing operations) or as summary output
  (for statistics), consistent with how imported/edited data is already
  handled; a user may discard a result instead of keeping it.
- "Undo analysis result" means removing the specific output the analysis
  produced (a single-level, per-run undo), not a general multi-step undo
  stack across unrelated project edits.
- Coordinate reference system handling follows the existing project-wide
  default and reprojection behavior already used elsewhere in the
  application; this feature does not introduce a new default CRS.
- "Large datasets" for this feature's performance targets means up to
  100,000 features per analysis input, consistent with the scale stated in
  the request; datasets beyond that are not required to meet the same
  responsiveness targets but must still fail gracefully rather than crash.
- Elevation, DEM, slope, aspect, and hillshade are represented in the data
  model and toolbox as placeholders per the Raster-Ready Framework; no
  actual elevation/terrain computation is delivered by this feature except
  the point-density Heatmap visualization, which is explicitly included.
- Shapefile export is understood to mean a downloadable package containing
  the standard Shapefile component files, since a Shapefile is not a single
  file by definition.
- Machine learning, AI-driven analysis, 3D analysis, network analysis,
  hydrology, terrain processing, and satellite image classification are
  out of scope for this feature, as explicitly stated in the request.
