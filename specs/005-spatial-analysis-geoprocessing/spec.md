# Feature Specification: Spatial Analysis & Geoprocessing

**Feature Branch**: `005-spatial-analysis-geoprocessing`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Feature: Spatial Analysis & Geoprocessing. Include: Buffer, Intersect, Union, Difference, Clip, Dissolve, Merge, Split, Spatial Join, Point in Polygon, Near Analysis, Distance Matrix, Area Calculation, Length Calculation, Centroid, Convex Hull, Bounding Box, Heatmap, Density Analysis, Coordinate Conversion, CRS Transformation, Batch Processing, Analysis History. Follow Constitution.md. Do not redesign architecture."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buffer and Proximity Analysis (Priority: P1)

A GIS analyst working in a project selects one or more features (or an entire
layer) and generates a buffer at a specified distance, finds the nearest
feature(s) in another layer to each feature in a source layer, or computes a
full distance matrix between two sets of features, to answer "what is within
X of this?" and "how far apart are these things?" questions.

**Why this priority**: Buffering and proximity queries are the single most
common geoprocessing operation in any GIS workflow (service-area analysis,
proximity screening, minimum-distance checks) and are prerequisites many
other analyses (e.g., "clip to buffer") build on.

**Independent Test**: Can be fully tested by selecting a layer, running Buffer
with a distance and unit, and confirming a new layer appears in the current
project containing the correctly-shaped buffered geometry — independent of
any other analysis type.

**Acceptance Scenarios**:

1. **Given** a layer with polygon features, **When** the analyst runs Buffer
   with a distance of 500 meters, **Then** a new layer is created in the
   current project containing one buffered polygon per input feature, each
   guaranteed to be topologically valid.
2. **Given** two layers (a "source" and a "reference" layer), **When** the
   analyst runs Near Analysis, **Then** each source feature is annotated with
   the id and distance to its nearest reference feature.
3. **Given** two feature sets, **When** the analyst runs Distance Matrix,
   **Then** a table of pairwise distances between every feature in set A and
   every feature in set B is produced and can be exported.

---

### User Story 2 - Overlay and Set Operations (Priority: P2)

An analyst combines or compares two layers using standard overlay
operations — Intersect, Union, Difference, Clip, Dissolve, Merge, Split — to
answer "where do these overlap," "what's the combined extent," or "what's
left after removing this area."

**Why this priority**: Overlay analysis is the second most fundamental
geoprocessing capability after buffering/proximity and is required before a
user can do most real-world "combine layer A and B" workflows.

**Independent Test**: Can be fully tested by selecting two layers and running
Intersect, then confirming a new layer is created containing only the
geometry common to both inputs, with no dependency on any other operation.

**Acceptance Scenarios**:

1. **Given** two overlapping polygon layers, **When** the analyst runs
   Intersect, **Then** a new layer containing only the overlapping area is
   created.
2. **Given** two polygon layers, **When** the analyst runs Union, **Then** a
   new layer containing the combined extent of both inputs is created, with
   overlapping areas represented once.
3. **Given** a polygon layer and a "clip boundary" layer, **When** the analyst
   runs Clip, **Then** a new layer is created containing only the portions of
   the input layer that fall inside the clip boundary.
4. **Given** a layer whose features share a common attribute value, **When**
   the analyst runs Dissolve on that attribute, **Then** a new layer is
   created with adjacent/overlapping features sharing that value merged into
   a single feature per unique value.
5. **Given** two layers of the same geometry type, **When** the analyst runs
   Merge, **Then** a new layer containing every feature from both inputs is
   created without altering any input geometry.
6. **Given** a layer and a splitting layer (e.g., a set of lines or a
   boundary), **When** the analyst runs Split, **Then** the input features
   are divided along the splitting geometry into multiple output features.

---

### User Story 3 - Measurement and Derived Geometry (Priority: P3)

An analyst computes area, length, centroid, convex hull, or bounding box for
one or more features to get quick geometric facts or a simplified derived
shape.

**Why this priority**: Measurement is used constantly alongside every other
analysis (to report results) but does not itself require overlay or
proximity infrastructure to deliver value, so it can ship as its own
independently-testable slice.

**Independent Test**: Can be fully tested by selecting a polygon layer and
requesting Area Calculation, then confirming each feature (or the whole
selection) reports a correct area value in a standard unit.

**Acceptance Scenarios**:

1. **Given** a polygon layer, **When** the analyst requests Area Calculation,
   **Then** each feature's area is computed and displayed/attached in a
   standard unit (square meters, with hectare/km² display thresholds).
2. **Given** a line layer, **When** the analyst requests Length Calculation,
   **Then** each feature's length is computed in a standard unit (meters,
   with kilometer display threshold).
3. **Given** any feature or set of features, **When** the analyst requests
   Centroid, **Then** a new point feature is created at the geometric center
   of each input feature.
4. **Given** a set of point or polygon features, **When** the analyst
   requests Convex Hull, **Then** a new polygon feature representing the
   smallest convex shape enclosing all input points/vertices is created.
5. **Given** any feature or set of features, **When** the analyst requests
   Bounding Box, **Then** a new rectangular polygon feature representing the
   minimum enclosing extent is created.

---

### User Story 4 - Spatial Relationship Queries (Priority: P4)

An analyst asks relational questions across two layers — "which polygon does
this point fall inside," or "join attributes from layer B onto layer A based
on spatial location" — without altering either input's geometry.

**Why this priority**: These are common follow-on questions once overlay/
buffer results exist, but are a distinct capability (attribute join, not
geometry combination) and can be delivered and tested on their own.

**Independent Test**: Can be fully tested by selecting a point layer and a
polygon layer and running Point in Polygon, then confirming each point is
correctly reported as inside/outside/which polygon, independent of any
overlay operation.

**Acceptance Scenarios**:

1. **Given** a point layer and a polygon layer, **When** the analyst runs
   Point in Polygon, **Then** each point feature is annotated with the id (or
   attributes) of the polygon it falls inside, or marked as falling inside no
   polygon.
2. **Given** two layers, **When** the analyst runs Spatial Join with a
   chosen spatial relationship (intersects, within, contains, nearest),
   **Then** a new layer is created combining the target layer's geometry
   with the matching source layer's attributes.

---

### User Story 5 - Coordinate System Conversion (Priority: P5)

An analyst converts a set of raw coordinates or an entire layer's displayed/
exported coordinates between coordinate reference systems, so data
originating in or destined for a different CRS can be worked with correctly.

**Why this priority**: Needed less frequently than core geoprocessing, and
only by analysts working with external data sources in a non-default CRS, so
it is prioritized below the operations every analyst uses daily.

**Independent Test**: Can be fully tested by supplying a coordinate pair and
a source/target CRS and confirming the converted coordinate lands at the
expected location, independent of any other analysis capability.

**Acceptance Scenarios**:

1. **Given** a coordinate pair and a named source CRS, **When** the analyst
   requests Coordinate Conversion to the platform's default CRS, **Then** the
   converted coordinate is returned accurate to the precision the source data
   supports.
2. **Given** an existing layer, **When** the analyst requests a CRS
   Transformation for export/display in a chosen target CRS, **Then** an
   export/preview reflecting the transformed coordinates is produced without
   altering the layer's stored geometry.

---

### User Story 6 - Density and Heatmap Visualization (Priority: P6)

An analyst visualizes where features are most concentrated across a layer,
either as a quick visual heatmap or as a computed density surface that can be
reported on or exported.

**Why this priority**: A valuable but more specialized analytical/
visualization capability, typically used after core geoprocessing/
measurement operations have already been applied.

**Independent Test**: Can be fully tested by selecting a point layer and
enabling Heatmap, then confirming a density-shaded visual overlay renders
over the correct area, independent of any other analysis.

**Acceptance Scenarios**:

1. **Given** a point layer, **When** the analyst enables Heatmap, **Then** a
   density-shaded visual overlay is rendered over the map reflecting point
   concentration, without creating a new persisted layer.
2. **Given** a point layer, **When** the analyst runs Density Analysis,
   **Then** a computed density result (a grid or contour representation of
   concentration) is produced and can be saved as a new layer in the current
   project.

---

### User Story 7 - Batch Processing (Priority: P7)

An analyst applies the same analysis operation, with the same parameters, to
several input layers or feature selections at once instead of repeating the
same operation one input at a time.

**Why this priority**: A productivity multiplier on top of every other
operation above, valuable but meaningfully dependent on at least one core
operation (User Story 1 or 2) already existing to batch.

**Independent Test**: Can be fully tested by selecting three layers and
running a single Buffer batch operation across all three, then confirming
three correctly-buffered output layers are created in one submission.

**Acceptance Scenarios**:

1. **Given** three input layers and one chosen operation with one set of
   parameters, **When** the analyst submits a batch run, **Then** the
   operation is applied to each input independently and one output is
   produced per input.
2. **Given** a batch run where one input is invalid for the chosen operation
   (e.g., wrong geometry type), **When** the batch executes, **Then** the
   invalid input's item is reported as failed with a clear reason while the
   valid inputs still complete successfully.

---

### User Story 8 - Analysis History (Priority: P8)

An analyst reviews a list of analyses they have previously run in a project,
sees the parameters and outcome of each, re-runs one with the same
parameters, or removes an entry they no longer need.

**Why this priority**: A convenience and auditability layer on top of every
other operation; valuable once there is analysis activity to have a history
of, so it is prioritized last.

**Independent Test**: Can be fully tested by running any one analysis
operation, then confirming it appears in the project's Analysis History with
its parameters and result, independent of which specific operation was run.

**Acceptance Scenarios**:

1. **Given** an analyst has run at least one analysis in a project, **When**
   they open Analysis History, **Then** they see every past run in that
   project with its operation type, parameters, timestamp, and status.
2. **Given** a past analysis run, **When** the analyst chooses to re-run it,
   **Then** a new run is submitted using the exact same input(s) and
   parameters as the original.
3. **Given** a past analysis run, **When** the analyst deletes it from
   history, **Then** it no longer appears in the list (its already-created
   output layer, if any, is not affected by removing the history entry).

---

### Edge Cases

- What happens when an operation's chosen input layer is empty (zero
  features)? The operation MUST be rejected up front with a clear message
  rather than silently producing an empty output.
- What happens when Buffer/Convex Hull/Bounding Box/Centroid is requested on
  a geometry type the operation cannot meaningfully apply to (e.g., Centroid
  of an already-empty selection)? The request MUST be rejected with a clear,
  specific message.
- What happens when Intersect/Union/Difference/Clip/Merge is requested on two
  layers with incompatible geometry types where the operation is not
  well-defined (e.g., merging a point layer with a polygon layer)? The
  request MUST be rejected before any processing begins.
- What happens when a Dissolve is requested on an attribute that does not
  exist on the input layer? The request MUST be rejected with a clear
  message naming the missing attribute.
- What happens when an overlay/set operation would produce zero output
  features (e.g., two layers that do not actually overlap for Intersect)?
  The operation MUST still succeed and produce an empty result layer with a
  clear "no features produced" indication, not an error.
- What happens when a requested analysis operation's input or output would
  produce an invalid geometry (self-intersection, unclosed ring)? The
  platform MUST reject the result or repair it via the platform's existing
  topology-validation behavior — it MUST NOT persist invalid geometry.
- What happens when Coordinate Conversion / CRS Transformation is requested
  with an unrecognized or unsupported coordinate reference system? The
  request MUST be rejected with a message identifying the unsupported CRS.
- What happens when a batch run is canceled partway through? Already-
  completed items in the batch MUST remain completed (their output layers
  are not rolled back); items not yet started MUST not run.
- What happens when Analysis History grows very large? The history view
  MUST remain usable (paginated or otherwise scoped) rather than degrading
  or failing to load.
- What happens when a user re-runs a past analysis whose original input
  layer has since been deleted? The re-run MUST be rejected with a clear
  message identifying the missing input, not a generic failure.

## Requirements *(mandatory)*

### Functional Requirements

**Buffer & Proximity (US1)**

- **FR-001**: Users MUST be able to generate a buffer around one or more
  selected features, or an entire layer, at a specified distance and unit.
- **FR-002**: Users MUST be able to run a Near Analysis that, for each
  feature in a source layer, identifies the nearest feature in a reference
  layer and the distance between them.
- **FR-003**: Users MUST be able to compute a Distance Matrix of pairwise
  distances between every feature in a source set and every feature in a
  reference set, and export the resulting table.

**Overlay & Set Operations (US2)**

- **FR-004**: Users MUST be able to run Intersect on two layers, producing
  only the geometry common to both.
- **FR-005**: Users MUST be able to run Union on two layers, producing their
  combined extent with overlaps represented once.
- **FR-006**: Users MUST be able to run Difference on two layers, producing
  the portion of the first layer not covered by the second.
- **FR-007**: Users MUST be able to run Clip, producing only the portion of
  an input layer that falls inside a chosen clip-boundary layer.
- **FR-008**: Users MUST be able to run Dissolve on a chosen attribute,
  merging features that share the same value into one feature per value.
- **FR-009**: Users MUST be able to run Merge on two or more layers of the
  same geometry type, producing a single layer containing every input
  feature unchanged.
- **FR-010**: Users MUST be able to run Split, dividing an input layer's
  features along a chosen splitting geometry.

**Measurement & Derived Geometry (US3)**

- **FR-011**: Users MUST be able to compute the area of polygon features in
  a standard unit.
- **FR-012**: Users MUST be able to compute the length of line features in a
  standard unit.
- **FR-013**: Users MUST be able to generate the centroid of one or more
  features as new point features.
- **FR-014**: Users MUST be able to generate the convex hull of a set of
  features as a new polygon feature.
- **FR-015**: Users MUST be able to generate the bounding box of one or more
  features as a new rectangular polygon feature.

**Spatial Relationship Queries (US4)**

- **FR-016**: Users MUST be able to run Point in Polygon, determining which
  polygon (if any) each point in a point layer falls inside.
- **FR-017**: Users MUST be able to run a Spatial Join between two layers
  using a chosen spatial relationship (intersects, within, contains, or
  nearest), producing a new layer combining geometry and matched attributes.

**Coordinate System Conversion (US5)**

- **FR-018**: Users MUST be able to convert a coordinate or set of
  coordinates from a named source coordinate reference system into the
  platform's default coordinate reference system.
- **FR-019**: Users MUST be able to request a CRS Transformation of an
  existing layer for display or export in a chosen target coordinate
  reference system, without altering the layer's stored geometry.

**Density & Heatmap Visualization (US6)**

- **FR-020**: Users MUST be able to enable a Heatmap visualization over a
  point layer that reflects point concentration.
- **FR-021**: Users MUST be able to run a Density Analysis producing a
  computed density result that can be saved as a new layer.

**Batch Processing (US7)**

- **FR-022**: Users MUST be able to select multiple input layers or feature
  sets and apply one analysis operation, with one set of parameters, to all
  of them in a single submission.
- **FR-023**: When a batch submission includes an input invalid for the
  chosen operation, the system MUST report that specific item as failed with
  a clear reason while still completing the valid items.

**Analysis History (US8)**

- **FR-024**: Users MUST be able to view a history of analyses run within a
  project, including operation type, input(s), parameters, timestamp, and
  status.
- **FR-025**: Users MUST be able to re-run a past analysis with its original
  inputs and parameters.
- **FR-026**: Users MUST be able to delete an entry from Analysis History
  without affecting any output layer that analysis already produced.

**Cross-Cutting**

- **FR-027**: Every analysis operation MUST validate its inputs (existence,
  geometry type compatibility, non-empty feature set) before any processing
  begins, and MUST reject invalid input with a specific, actionable message.
- **FR-028**: Every analysis operation whose result is persisted MUST
  produce topologically valid geometry — an operation that would otherwise
  produce invalid geometry MUST be rejected or repaired, never stored
  invalid.
- **FR-029**: Every analysis operation that creates a new layer MUST make
  that layer immediately visible in the current project's layer list,
  consistent with how layers are created elsewhere in the platform.
- **FR-030**: Users MUST only be able to run analyses against, or view the
  history of, projects and layers they own — the same ownership model
  already enforced elsewhere in the platform.

### Key Entities

- **Analysis Operation Type**: One of the twenty-two named operations in
  this feature (Buffer, Intersect, Union, …, Analysis History browsing is a
  view over runs, not an operation type itself); has a defined set of
  required input(s) and parameters.
- **Analysis Run**: A single execution of an Analysis Operation Type against
  specific input layer(s)/feature selection(s) and parameters; has a status
  (pending, succeeded, failed), a timestamp, an owner, and — when
  successful — a reference to its output (a new layer, an annotated
  existing layer, or a downloadable table/result for non-geometry outputs
  like a Distance Matrix).
- **Batch Run**: A group of Analysis Runs submitted together, sharing one
  Analysis Operation Type and parameter set but each with a different
  input; has its own overall status derived from its member runs.
- **Analysis History Entry**: A record of one past Analysis Run (or Batch
  Run), retained so it can be reviewed, re-run, or deleted independent of
  its output layer's lifecycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from selecting an input layer to seeing a
  completed Buffer, Intersect, or other single-input/two-input analysis
  result in under 15 seconds for a layer of 1,000 features.
- **SC-002**: 100% of analysis operations that would produce invalid
  geometry are rejected or repaired — zero invalid geometry is ever
  persisted as an analysis result.
- **SC-003**: A batch run across 10 input layers completes with a per-item
  success/failure outcome reported for every item, with zero silent
  failures.
- **SC-004**: A user can locate and re-run any analysis performed in the
  last 30 days directly from Analysis History without needing to
  re-specify its inputs or parameters.
- **SC-005**: 95% of users asked to perform a basic overlay (e.g.,
  Intersect two layers) or measurement (e.g., compute area) succeed on
  their first attempt without external help.
- **SC-006**: Coordinate Conversion / CRS Transformation results are
  accurate to within the source data's own coordinate precision, verified
  against known reference points.

## Assumptions

- Every analysis operation that produces new geometry (Buffer, Intersect,
  Union, Difference, Clip, Dissolve, Merge, Split, Centroid, Convex Hull,
  Bounding Box, Density Analysis, Spatial Join) creates a new layer within
  the current project, consistent with the platform's existing
  Project → Layer → Feature model — it does not introduce a separate
  "analysis result" storage concept.
- Distance Matrix produces a tabular (non-geometry) result rather than a new
  layer, since its output is a table of feature-pair distances, not
  geometry; it is exportable the same way other tabular data in the
  platform is exported.
- All persisted geometry, including every analysis output, remains in the
  platform's single default coordinate reference system (per the existing
  GIS Principles); Coordinate Conversion / CRS Transformation is a
  conversion-at-the-boundary capability (on input from, or output/export
  to, another coordinate reference system), never a way to store geometry
  in a non-default coordinate reference system.
- Heatmap is a client-side visual rendering technique over existing point
  data (transient UI feedback, not a persisted result); Density Analysis is
  the corresponding operation whose numeric/grid result is computed
  authoritatively and can be persisted as a new layer, matching the
  platform's existing split between transient client-side visualization and
  authoritative server-side computation.
- Batch Processing applies one operation and one parameter set across
  multiple independently-processed inputs in a single submission; chaining
  multiple different operations into a multi-step pipeline in one
  submission is out of scope for this feature.
- Analysis History is scoped per project and per owner, consistent with the
  platform's existing ownership model, and is retained until explicitly
  deleted by the user (no automatic expiry is assumed).
- Analysis operations run and complete within a single request/response
  cycle; a persistent background job queue for very large or long-running
  analyses is out of scope unless a future amendment introduces one.
- This feature builds entirely on the existing Project/Layer/Feature data
  model, ownership/authentication model, and map-editing UI shell already
  established by prior features — no new top-level architectural concept
  (e.g., a separate analysis-jobs subsystem) is introduced.
