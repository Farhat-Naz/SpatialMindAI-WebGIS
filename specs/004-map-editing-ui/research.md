# Research: Interactive WebGIS Editing (Drawing, Editing, Measurement, Import/Export)

**Feature**: 004-map-editing-ui — **expanded scope** (superseding the
narrower "planning pass" note originally in this section). This plan now
covers all eight approved user stories: US1 (Project Explorer/Layer Tree,
including Layer Lock), US2 (viewing/navigation/full map chrome), US3
(attributes), US4 (drawing/geometry editing/delete/undo/cancel/copy/paste/
duplicate), US5 (multi-selection/context menu), US6 (measurement), US7
(GeoJSON and Shapefile import/export), and US8 (full screen/dark mode/
keyboard shortcuts). Decisions 1–11 below are unchanged from the original,
narrower planning pass; Decisions 12–20 were added to cover the expanded
scope.
**Date**: 2026-07-22 (Decisions 1–11); expanded same day following a
subsequent request to generate a full task list across all eight stories.

All decisions below are derived from the approved spec (`spec.md`), the
project constitution (`.specify/memory/constitution.md` v3.0.0), and the
completed 003-database-foundation plan/data-model/contracts, which this
feature consumes rather than re-implements.

All decisions below are derived from the approved spec (`spec.md`), the
project constitution (`.specify/memory/constitution.md` v3.0.0), and the
completed 003-database-foundation plan/data-model/contracts, which this
feature consumes rather than re-implements.

---

## Decision 1: Drawing/Editing Library — Leaflet-Geoman (free tier)

**Decision**: Use `@geoman-io/leaflet-geoman-free` on top of the existing
`react-leaflet`/`leaflet` stack, loaded via `next/dynamic` with
`{ ssr: false }` (Constitution Principle V), for Create Point/LineString/
Polygon/Rectangle/Circle, vertex editing (drag/add/remove), whole-feature
move, and delete-via-tool.

**Rationale**: Geoman is the one actively-maintained Leaflet drawing/editing
plugin that natively covers nearly this entire section 1+2 scope
(draw point/line/polygon/rectangle/circle, drag-to-move, drag-vertices-to-
edit, remove) with a single dependency, rather than combining several
narrower, less-maintained plugins (e.g., the classic `leaflet-draw`, which
has no first-class "move an existing feature" mode). It emits/consumes plain
Leaflet layers with a `.toGeoJSON()` method, so no adapter layer is needed
between it and the rest of the stack.

**Alternatives considered**: `leaflet-draw`/`react-leaflet-draw` (rejected —
unmaintained for several years, no native move/drag-existing-feature mode,
would need a second plugin bolted on for that); building drawing/editing
from raw Leaflet mouse events (rejected — reimplements well-solved vertex-
drag/snapping/rectangle/circle interaction logic for no benefit).

---

## Decision 2: Rectangle and Circle Are Drawing Tools, Not New Geometry Types

**Decision**: "Create Rectangle" and "Create Circle" are drawing-interaction
modes only. A drawn rectangle is saved as a `Polygon` (Leaflet's rectangle
layer already produces a 4-vertex closed ring via `.toGeoJSON()`). A drawn
circle is converted to a many-sided regular `Polygon` approximation via
Turf.js's `turf.circle(center, radiusInMeters, { steps: 64 })` before being
sent to the API. Neither introduces a geometry kind beyond the six already
approved in 003-database-foundation (Constitution Principle IV).

**Rationale**: The backend's `geometry.schema.ts` and PostGIS storage
already define geometry as exactly six types with no "Circle" or
"Rectangle" primitive — and correctly so, since neither is a standard
GeoJSON/PostGIS geometry kind. Approximating a circle as a 64-sided polygon
is standard GIS practice (matches what ArcGIS/QGIS do internally) and keeps
this feature from requiring any backend/schema change.

**Alternatives considered**: Adding `Circle`/`Rectangle` as new stored
geometry types (rejected — would require amending the approved
003-database-foundation data model and Constitution Principle IV's fixed
six-type list, for a purely cosmetic distinction PostGIS doesn't need); a
coarser polygon approximation, e.g. 16 sides (rejected — visibly
non-circular at typical map zoom levels; 64 sides is a negligible payload-size
difference and renders convincingly circular).

---

## Decision 3: Measurement Is Computed Client-Side via Turf.js

**Decision**: "Measure Distance" and "Measure Area" (and the "live
measurement while drawing" requirement) compute their results entirely
client-side using Turf.js (`turf.length` for distance, `turf.area` for
area) against the in-progress drawn geometry — no Route Handler or
database round trip is involved.

**Rationale**: This does not conflict with Constitution Principle IV's
"client-side calculations only for temporary UI feedback" rule — it is
squarely the case that rule anticipates. Per spec FR-033, a measurement is
explicitly ephemeral and never persisted as a Feature; it is exactly
"temporary UI feedback," not an authoritative stored value. Requiring a
server round-trip for a value that updates on every mouse movement while
drawing would also make "live measurement" (sub-second updates) impossible
to hit within a reasonable network budget.

**Alternatives considered**: Server-side measurement via a new Route
Handler calling `ST_Length`/`ST_Area` (rejected — unnecessary latency for a
value that must update continuously during drawing, and explicitly not
required since the result is never persisted).

---

## Decision 4: Single-Level Undo via an In-Memory Snapshot

**Decision**: A small Zustand slice holds exactly one `UndoSnapshot`: the
prior state (geometry, attributes, and style) of the single most recent
edit/delete action, plus enough identity (feature id, or "this was a
delete") to reverse it. "Undo" replays the inverse operation through the
existing Features API (an `update` to restore prior geometry/attributes/
style, or a `create` to restore a deleted feature) and then clears the
snapshot — a second Undo press has nothing to do. The snapshot is cleared
whenever a new edit succeeds, the user navigates to a different feature/
layer/project, or the page reloads.

**Rationale**: This satisfies "Undo last edit" as requested for this plan
increment while honoring the (now-narrowed, see spec.md Assumptions) intent
that this is not a full undo/redo history system — a single, session-only,
one-step snapshot is the minimal mechanism that does exactly what was asked
without introducing an undo *stack*, redo, or persistence concerns.

**Alternatives considered**: A multi-step undo/redo stack (rejected — the
approved spec explicitly scoped undo/redo as out-of-scope; a full stack is
materially more state/edge-case surface than "undo last edit" calls for); a
server-side revision history table (rejected — no such entity exists in the
approved 003-database-foundation data model, and introducing one is a
data-model change well beyond this plan's scope).

---

## Decision 5: Bulk GeoJSON Import via a New Route Handler

**Decision**: Add `POST /api/layers/:layerId/features/import`, accepting a
GeoJSON `FeatureCollection` in the request body, validated with a new Zod
schema (`importFeatureCollectionSchema` in `src/shared/contracts/`).  The
Route Handler resolves the acting user and layer ownership once, then the
repository inserts every feature inside a single database transaction —
if any feature fails Zod structural or PostGIS `ST_IsValid` validation, the
entire transaction rolls back and zero features are added (spec FR-035,
all-or-nothing).

**Rationale**: 003-database-foundation's existing `POST /api/layers/:layerId/features`
endpoint accepts exactly one feature per call. Importing hundreds or
thousands of features (spec SC-006: 1,000 features within 10 seconds) via
that many individual HTTP round trips would be far slower than a single
bulk call, and would make "all-or-nothing" (FR-035) impossible to guarantee
without client-side compensating deletes if a later feature in the batch
fails. This endpoint was explicitly anticipated and pre-approved in
003-database-foundation's spec.md Assumptions ("GeoJSON import/export may
require an additional bulk-oriented endpoint, which is a planning-phase
decision") — this decision exercises exactly that anticipated extension
point, not a surprise addition.

**Alternatives considered**: N sequential calls to the existing single-
feature `POST` endpoint (rejected — fails the all-or-nothing requirement
without added client-side rollback complexity, and is materially slower);
N parallel calls (rejected — same all-or-nothing problem, plus uncontrolled
concurrent write load against one layer).

---

## Decision 6: GeoJSON Export Reuses the Existing Paginated Listing Endpoint

**Decision**: "Export current layer to GeoJSON" is implemented client-side:
the export action pages through the existing, already-implemented
`GET /api/layers/:layerId/features` (cursor pagination, Research Decision 5
of 003-database-foundation) collecting every feature, assembles a GeoJSON
`FeatureCollection` in the browser, and triggers a file download. No new
Route Handler is introduced for export.

**Rationale**: The existing listing endpoint already returns every feature
with its geometry/attributes/style; export has no new server-side concern
(no validation, no mutation) that would justify a dedicated endpoint.
Reusing it keeps this feature's backend footprint to exactly one new
endpoint (Decision 5's import) rather than two.

**Alternatives considered**: A dedicated `GET /api/layers/:layerId/export`
endpoint that returns an unpaginated `FeatureCollection` directly (rejected
— for very large layers this reintroduces the unbounded-response-size
problem cursor pagination was specifically introduced to avoid in
003-database-foundation Research Decision 5; client-side pagination
aggregation avoids that without adding a new endpoint).

---

## Decision 7: Attribute Editing Form Reuses the Existing Feature Contract

**Decision**: The attribute-editing form (Feature Attribute Form / Edit
Attributes) is a dynamic key/value list editor (shadcn/ui form primitives)
that validates client-side against the *existing*
`src/shared/contracts/feature.schema.ts` (`updateFeatureSchema`'s
`attributes` shape — non-empty keys, unique within the feature) before
calling the existing `useUpdateFeature` hook. No new Zod schema or API
contract is introduced for attribute editing itself.

**Rationale**: 003-database-foundation already defined the authoritative
attribute contract (free-form key/value pairs, unique keys per feature,
Research Decision 12). This feature only needs a UI layer over that
existing, already-validated contract — duplicating validation rules in a
second schema would risk drift between the two.

**Alternatives considered**: A separate, form-specific Zod schema (rejected
— would duplicate `feature.schema.ts`'s attribute rules for no benefit and
risk the two silently diverging over time).

---

## Decision 8: Security — Reuse Existing Ownership Enforcement, No New Pattern

**Decision**: Every new capability in this plan (bulk import, undo's
replayed update/create/delete, attribute edits) is authorized exactly the
way every existing Route Handler already is: `getCurrentUser(request)`
resolves the acting user first, and every repository call is scoped by
`ownerId` through the existing Project→Layer→Feature ownership chain
(003-database-foundation Research Decision 2 and each repository's
Cross-Cutting Rules). The new bulk-import Route Handler follows the exact
same shape as every other Route Handler in the codebase — no new
authorization mechanism, middleware, or pattern is introduced.

**Rationale**: Constitution Principle VI (Security) and this plan's own
"every operation must verify project/layer ownership" requirement are
already fully satisfied by the existing architecture; the only new
Route Handler (Decision 5) must simply follow the established pattern, not
invent a new one.

**Alternatives considered**: A shared "ownership middleware" abstraction
(rejected — over-engineered for what is already a one-line repository call
per Route Handler; introducing a middleware layer now would be a new
architectural pattern the constitution doesn't call for and the existing
code doesn't need).

---

## Decision 9: Performance — Memoization, Virtualization, and Lazy Loading

**Decision**: (a) Per-feature map layers are wrapped in `React.memo`, keyed
by feature id + a version/updatedAt marker, so panning/zooming does not
re-render unchanged features. (b) The Attribute Table (spec SC-005: 10,000+
features) uses row virtualization (rendering only visible rows). (c)
Leaflet-Geoman and Turf.js (Decision 1, 3) are loaded via `next/dynamic`
with `{ ssr: false }`, never in the initial bundle, per Constitution
Principle V.

**Rationale**: Directly satisfies this plan's Performance section
("handle thousands of features efficiently," "avoid unnecessary re-renders,"
"lazy load editing libraries") and spec SC-002/SC-005, using patterns the
codebase already applies elsewhere (Leaflet itself is already
dynamically imported in the existing `map` feature).

**Alternatives considered**: Canvas-based rendering instead of per-feature
SVG/DOM layers (rejected for this phase — a larger architectural change
than this plan's scope calls for; Leaflet's `preferCanvas` renderer option
is noted as a future optimization if memoization alone proves insufficient
at extreme feature counts, not implemented now).

---

## Decision 10: Feature–Layer Relationship Integrity Requires No New Work

**Decision**: "Every new feature belongs to the selected layer" and
"maintain feature-layer relationship" are already fully enforced by
003-database-foundation's data model (`Feature.layerId`, a required foreign
key) and `featureRepository.createFeature(layerId, ownerId, input)`, which
always requires an explicit `layerId`. This plan introduces no new
enforcement — every draw/import operation simply calls the existing
repository function with the currently-selected layer's id.

**Rationale**: Restating an already-guaranteed database constraint as a new
requirement would be redundant; this decision exists to make explicit that
no new code is needed here, rather than leave a plan reader wondering.

---

## Decision 11: React Query Cache Invalidation for the New Import Mutation

**Decision**: The new `useImportFeatures(layerId)` mutation invalidates the
same feature-list query key (`['layers', layerId, 'features', ...]`) that
`useCreateFeature`/`useUpdateFeature`/`useDeleteFeature` already invalidate,
via the existing centralized `queryKeys` factory
(`src/features/database/services/queryKeys.ts`) — no new query-key scheme
is introduced.

---

## Decision 12: Project Explorer & Layer Tree Are New UI Over Fully Existing Endpoints

**Decision**: `ProjectExplorer.tsx` and `LayerTree.tsx` (new components,
`src/features/database/components/`) are pure UI over the already-complete
`useProjects`/`useLayers`/`useCreateLayer`/`useRenameLayer`/
`useReorderLayers`/`useDeleteLayer` hooks from 003-database-foundation.
Layer reordering uses drag-and-drop (a lightweight, dependency-free
pointer-events implementation — see Decision 20 on avoiding new libraries
where an existing pattern suffices) calling the existing
`useReorderLayers` mutation on drop.

**Rationale**: Every data operation US1 needs (list/create/rename/delete/
reorder projects and layers) was already built and tested in
003-database-foundation. This increment's entire US1 obligation is
presentation and interaction, not new data access.

**Alternatives considered**: A drag-and-drop library (e.g., `dnd-kit`)
(rejected for this phase — reordering a project's layers, typically well
under 100 items, per 003-database-foundation SC-002, does not need virtual-
list-aware DnD; a minimal native pointer-events implementation avoids a new
dependency for a well-bounded interaction).

---

## Decision 13: Multi-Selection Extends `databaseStore` Additively

**Decision**: `databaseStore` (003-database-foundation) gains a new field,
`selectedFeatureIds: string[]` (default `[]`), and new actions
(`toggleFeatureSelection(id)`, `selectFeatureRange(ids)`,
`clearFeatureSelection()`). The existing `selectedFeatureId` field is
**not removed** — single-feature flows already built on it (popup,
zoom-to-feature, the Attribute Form) continue to read it, kept in sync as
"the most recently selected id" whenever `selectedFeatureIds` changes.
Box/drag-select computes which rendered features intersect the drawn box
(via each feature's already-available Leaflet layer bounds) and calls
`selectFeatureRange` once with every intersecting id.

**Rationale**: Changing `selectedFeatureId`'s existing type/shape would be
a breaking change to already-shipped, already-tested code
(`databaseStore.test.ts` from 003-database-foundation asserts it as a
single nullable id). Adding a new, additive field satisfies US5 without
touching that contract, and keeps every single-selection consumer working
unmodified.

**Alternatives considered**: Replacing `selectedFeatureId` with a
derived-from-array getter (rejected — a breaking change to an already-
shipped store shape and its existing tests, for no behavioral gain over
an additive field).

---

## Decision 14: Context Menu via shadcn/ui `ContextMenu`

**Decision**: Right-click actions (US5) use shadcn/ui's `ContextMenu`
primitive (Radix-based, already the project's mandated UI-component
source per the constitution), positioned at the click point over the map,
offering actions scoped to whatever was right-clicked (a feature: delete/
zoom-to/edit/copy/duplicate; a layer: rename/lock/delete/zoom-to-layer).

**Rationale**: Radix's `ContextMenu` already implements correct focus
management, Escape-to-dismiss, and ARIA roles — exactly what Constitution
Principle VI (Accessibility) requires preferring over a hand-rolled
positioned `<div>`, consistent with how every other interactive control in
this codebase already prefers shadcn/Radix primitives.

---

## Decision 15: Coordinate Display, Scale Bar, and Basemap Switcher Are Reused Unchanged

**Decision**: `src/features/dashboard/components/StatusBar.tsx`
(coordinate display, FR-010), the `ScaleControl` already rendered in
`src/features/map/components/MapCore.tsx` (FR-011), and
`src/features/map/components/LayerSwitcher.tsx` +
`src/features/map/constants/basemaps.ts` (basemap switching, FR-013) are
**already fully implemented** by 001-app-foundation. This feature adds
**zero new code** for these three requirements — it only needs to confirm
they continue to render correctly alongside the new editing panels/
toolbars (covered by the existing dark-mode/responsive-layout tests from
001-app-foundation, not new tests specific to this feature).

**Rationale**: Verified directly by reading both files during this
planning pass rather than assumed — `StatusBar` already shows live lat/lng
and zoom via `mapStore`, and `MapCore` already renders a `ScaleControl`.
Re-planning or re-implementing already-shipped, already-tested capability
would violate the "don't invent new APIs / preserve existing architecture"
instruction this plan is operating under.

**Alternatives considered**: N/A — this is a discovery, not a design
choice with alternatives.

---

## Decision 16: North Arrow Is a Static Decorative Element, No New Library

**Decision**: The one genuinely new US2 chrome element, the north arrow, is
a small static SVG/icon component (`NorthArrow.tsx`) positioned as a map
overlay — no rotation logic and no plugin dependency, since Leaflet's
default `CRS.EPSG3857` map is always north-up; the arrow is purely
informational chrome, not an interactive control.

**Rationale**: No Leaflet plugin provides meaningful additional value for a
non-rotating map; introducing one for a static icon would be an
unjustified dependency per Constitution Principle V.

---

## Decision 17: Keyboard Shortcuts via a Shared Hook, No New Library

**Decision**: A new `useKeyboardShortcuts(bindings)` hook
(`src/features/database/hooks/useKeyboardShortcuts.ts`) attaches a single
`keydown` listener (cleaned up on unmount) and dispatches to the provided
action map (e.g., `Delete` → delete selection, `Escape` → cancel tool/
close context menu/dismiss dialog, `Ctrl+Z` → undo, `Ctrl+C`/`Ctrl+V` →
copy/paste). No third-party hotkey library is introduced.

**Rationale**: The shortcut set required by spec FR-041 is small and
well-bounded; a ~30-line hook avoids a new dependency for a problem plain
`keydown` handling solves completely, consistent with Constitution
Principle V's bias against unjustified dependencies.

---

## Decision 18: Full Screen via the Native Fullscreen API, No New Library

**Decision**: A `useFullscreen(elementRef)` hook wraps the browser's native
Fullscreen API (`element.requestFullscreen()`/`document.exitFullscreen()`),
feature-detected at call time; the Full Screen control (spec FR-039) is
hidden/disabled when `document.fullscreenEnabled` is falsy.

**Rationale**: Every evergreen browser supports the native API directly;
a wrapper library would add a dependency for a five-method API surface.

---

## Decision 19: Shapefile Import Reuses the Bulk GeoJSON Import Endpoint

**Decision**: Shapefile import is parsed **entirely client-side**: the
`shapefile` npm package reads the uploaded `.shp`/`.dbf` (and `.shx` if
provided) into GeoJSON features in the browser; if a `.prj` file is also
provided, `proj4` (seeded with the `.prj`'s WKT, parsed via `proj4`'s
`Proj4js`-compatible WKT support) reprojects every coordinate to WGS84
before the features are assembled into a `FeatureCollection`. That
collection is then submitted to the **same**
`POST /api/layers/:layerId/features/import` endpoint already designed for
GeoJSON import (Decision 5) — **no second backend endpoint is introduced**.

**Rationale**: Once a Shapefile is converted to GeoJSON with WGS84
coordinates, it is indistinguishable from a GeoJSON import at the API
boundary — reusing the exact same Route Handler, Zod schema, and
transactional all-or-nothing repository function avoids duplicating
import/validation/error-handling logic for a second file format. Client-
side parsing also means an invalid Shapefile (missing companion file,
bad geometry) can be rejected before any network call, rather than
uploading a large binary just to have the server reject it.

**Alternatives considered**: Server-side Shapefile parsing (a new Route
Handler accepting the raw `.zip`/binary files) (rejected — would require a
second, parallel import pathway with its own validation/error-mapping code,
duplicating Decision 5's transactional logic for no benefit, and would mean
uploading potentially large binary shapefile parts to the server just to
find out they're invalid).

---

## Decision 20: Copy/Paste/Duplicate and Layer Lock Are Purely Client-Side

**Decision**: Copy/Paste/Duplicate (spec FR-027c–e) and Layer Lock (spec
FR-006a) introduce **no new Route Handler or repository function**. Copy
snapshots a feature's current geometry/attributes/style into
`editingStore`'s `clipboard` field; Paste/Duplicate call the existing
`useCreateFeature(layerId)` hook with that snapshot (a new id is assigned
by the server as usual — this is an ordinary create, not a special "clone"
endpoint). Layer Lock is a plain per-layer boolean in `editingStore`,
checked client-side before any tool activation/mutating action is allowed
against that layer's features — matching the client-only, session-only
precedent already set for visibility/opacity (003-database-foundation) and
confirmed for lock in spec.md's amended Assumptions.

**Rationale**: Both capabilities are fully expressible as thin client
logic over the existing single-feature create/update/delete API — adding
a dedicated "duplicate" or "lock" endpoint would duplicate what the
existing `POST`/repository-ownership-check machinery already does for
free.

**Alternatives considered**: A server-side "duplicate" endpoint
(`POST /api/features/:featureId/duplicate`) (rejected — functionally
identical to reading a feature then calling the existing create endpoint
with its data; a new endpoint would be pure duplication of logic that
already exists); persisting layer lock as a new `Layer.locked` column
(rejected — would require reopening the already-complete, already-migrated
003-database-foundation schema for a client-side-sufficient guard;
consistent with how visibility/opacity were already deliberately kept
session-only for the same reason).
