# Quickstart: Validating the Spatial Analysis Toolset (007)

**Prerequisites**: A running dev environment per the project's existing
setup (`docker-compose.test.yml` PostGIS instance or an equivalent local
PostgreSQL+PostGIS, `.env`/`.env.example` configured, `prisma migrate dev`
applied through this feature's migration), the app running (`npm run dev`),
and a seeded project with at least two overlapping polygon layers, one line
layer, and one point layer (extend `prisma/seed.ts`'s existing seed data
rather than hand-creating fixtures). A second seeded user who is a
project **Editor** (not Owner) is required for the permission scenarios —
depends on 006-collaboration's membership seed data existing.

This guide exercises each capability area through the UI; every scenario
has a matching automated test (see plan.md's Testing Strategy) — this
document is for manual/exploratory validation, not a substitute for those.

---

## 1. Buffer (US1)

1. Open the project, open the **Analysis Panel** (new icon in the right
   dock, alongside Layers).
2. In the **Toolbox**, choose **Buffer** under the Buffer category.
3. Select the seeded point layer as input, set distance `500`, unit
   `meters`, leave Dissolve off. Run.
4. **Expect**: Progress Dialog appears briefly (or the result may already
   be `succeeded` by the time it renders, for a small layer), then the
   Result Panel shows a new buffered layer. Add it to the project and
   confirm it renders on the map as circular buffers around each point.
5. Repeat with multiple selected features and **Dissolve** enabled.
   **Expect**: one merged polygon, not one per feature.

## 2. Spatial Query (US2)

1. In the Toolbox, choose **Select by Location**, source = the point
   layer, reference = a polygon layer, predicate = `Intersects`. Run.
2. **Expect**: only points inside/touching the polygon layer become
   selected/highlighted on the map; the Result Panel shows the matching
   feature count.
3. Repeat with `Within`, `Contains`, `Touches`, `Crosses`, `Overlaps` and
   confirm the selected set changes appropriately for each predicate.
4. Choose **Select by Attribute**, enter a filter expression against a
   seeded attribute. **Expect**: only matching features selected.

## 3. Measurement (US3)

1. Open the **Measure** toolbar (from the map toolbar, not the Analysis
   Panel — it is always available).
2. Activate **Measure Distance**, click 3 points on the map. **Expect**:
   a live cumulative distance and per-segment bearing readout, updating on
   each click, with no network request per click (client-side only, per
   research.md Decision 8).
3. Click **Save to History**. **Expect**: a `POST
   /api/projects/:projectId/measurements` call, and the value shown in the
   Measurement History list matches the live readout to a reasonable
   precision (may differ in the last decimal place — server-recomputed).
4. Activate **Measure Area**, draw a closed shape. **Expect**: area and
   perimeter both shown.
5. Request an elevation reading. **Expect**: a clearly labeled "not
   available" placeholder, never a fabricated number.

## 4. Overlay (US4)

1. Choose **Intersection**, pick two overlapping polygon layers. Run.
   **Expect**: result layer covers only the overlapping area.
2. Repeat for **Union**, **Difference**, **Clip**, **Erase**, **Identity**,
   **Symmetrical Difference** — confirm each produces the geometrically
   correct result visually (spot-check against the two input layers on the
   map).

## 5. Geometry Processing (US5)

1. Choose **Simplify** on a vertex-heavy polygon with a tolerance value.
   **Expect**: result has visibly fewer vertices, same approximate shape.
2. Choose **Repair Geometry** on a feature with a self-intersection
   (seed one deliberately, or import one via the existing Import feature).
   **Expect**: result is valid; if unrepairable, a clear message is shown,
   not a silent failure.
3. Choose **Multipart to Singlepart** on a multipart feature. **Expect**:
   one feature per part, attributes copied to each.

## 6. Spatial Statistics (US6)

1. Select a polygon layer, choose **Summarize**. **Expect**: feature
   count, total area, average area, bounding box, centroid, convex hull,
   and extent all displayed without creating a new layer by default.

## 7. Raster-Ready Framework (US7)

1. In the Toolbox, open the **Raster & Surface Analysis** category.
   **Expect**: Heatmap, Elevation/DEM, Slope, Aspect, Hillshade all listed;
   only Heatmap is enabled/runnable, the others show a clear "not yet
   available" state.
2. Run **Heatmap** on the point layer. **Expect**: a density visualization
   renders on the map immediately (client-side, no `AnalysisRun` created).

## 8. Analysis History (US8)

1. Open the **History Panel**. **Expect**: every run from steps 1–6 is
   listed with operation type, parameters, timestamp, and the user who ran
   it.
2. Select a Buffer run, click **Re-run**. **Expect**: a new run appears
   with identical parameters and a new result.
3. Save a parameter set as a **Preset** from step 1's Buffer form; start a
   new Buffer run and confirm the preset appears as a quick-start option.

## 9. Export (US9)

1. From the Result Panel of any completed analysis, choose **Export →
   GeoJSON**. **Expect**: a browser download starts; opening the file
   shows valid GeoJSON matching the result.
2. Repeat for **CSV**, **KML**, and **Shapefile** (Shapefile downloads a
   `.zip`). **Expect**: each opens correctly in a standard external tool
   (e.g., QGIS) without manual correction (SC-008).
3. Open the Export history list. **Expect**: all four exports logged with
   format, timestamp, and feature count.

## 10. Analysis Workspace UI (US10)

1. Resize, dock (left/right), and collapse the Analysis Panel. **Expect**:
   the map and other panels remain usable throughout; layout persists
   across a page reload.
2. Using only the keyboard (Tab/Enter/Escape, no mouse), open the panel,
   select a tool, run it, and cancel a long-running run. **Expect**: every
   action reachable and its focus state visible; a screen reader
   (or the browser's accessibility tree inspector) announces progress
   updates via the `aria-live` region.

---

## Failure / recovery scenarios

1. **Cancellation**: run Buffer against a deliberately large seeded layer
   (or lower the chunk size via a test-only env override), click **Cancel**
   mid-run. **Expect**: `status` becomes `"cancelled"` within roughly one
   chunk's duration, no partial result layer is added to the project, and
   the cancelled run is visible in History.
2. **Failure recovery**: submit an operation designed to fail server-side
   (e.g., an operation requiring two layers of matching type given
   mismatched types). **Expect**: `status: "failed"` with a readable
   `errorMessage`, visible in History, no corrupted layer created.
3. **Permission denied**: sign in as the seeded Viewer-role user, attempt
   to run any analysis. **Expect**: request rejected (`403 FORBIDDEN`),
   no `AnalysisRun` row created, but an `Activity` audit entry recorded
   for the denied attempt (research.md Decision 4) — verify via the
   project's existing Activity feed (006-collaboration).
4. **Empty selection**: attempt to run any operation with zero features
   selected. **Expect**: rejected before a job is created, with a clear
   "nothing to analyze" message.

If every scenario above behaves as described, the feature satisfies its
spec's Acceptance Scenarios end-to-end.
