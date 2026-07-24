---
description: "Task list for Interactive WebGIS Editing (004-map-editing-ui, full scope)"
---

# Tasks: Interactive WebGIS Editing (Map Editing & GIS Tools)

**Input**: Design documents from `specs/004-map-editing-ui/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md` (20 decisions),
`data-model.md`, `contracts/`, `quickstart.md` (all present and approved)

**Tests**: Included throughout, per Constitution Principle VII and this
feature's Testing Strategy (`plan.md`).

**Organization**: Grouped into the 11 phases requested (Foundation →
Drawing & Editing → Measurements → Layer Operations → Feature Operations →
Import/Export → Map UI → Search Integration → React Query/Zustand →
Testing → Polish) rather than strict per-user-story phases, since that
structure was explicitly requested. Every task still carries a `[Story]`
tag mapping it back to the relevant `spec.md` user story
(**US1** Project Explorer/Layer Tree · **US2** Viewing/Navigation/Chrome ·
**US3** Attributes · **US4** Drawing/Geometry Editing/Copy-Paste-Duplicate ·
**US5** Multi-Selection/Context Menu · **US6** Measurement · **US7**
Import/Export · **US8** Full Screen/Dark Mode/Keyboard Shortcuts), so
story-level traceability and independent-story testing are still possible
within this phase structure.

**Two capabilities in this list (Lock Layer, Copy/Paste/Duplicate) were
new requirements added to `spec.md` (FR-006a, FR-027c–e) immediately before
this task list was generated** — not invented at the task level.

## Format: `- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Parallel-safe — different files, no dependency on an incomplete task
- **[Story]**: US1–US8 per `spec.md`; omitted for Setup/Foundational/cross-cutting/Polish tasks
- Every task also lists **Priority**, **User Story**, **Files**, **Goal**, **Acceptance Criteria**, **Verification**, and **Dependencies**

## Path Conventions

Paths match `plan.md`'s Project Structure: `src/features/database/`,
`src/server/`, `src/shared/`, `app/api/`.

---

## Phase 1: Foundation

**Purpose**: Dependencies, shared utilities/types, and the one new backend
endpoint every later phase builds on.

- [X] T001 [P] Install drawing, measurement, and import dependencies
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `package.json`, `package-lock.json`
  - **Goal**: Add `@geoman-io/leaflet-geoman-free` (Research Decision 1), a Turf.js package (Decisions 2–3), `shapefile` and `proj4` (Decision 19).
  - **Acceptance Criteria**: All four packages installed; no version conflicts with existing `leaflet`/`react-leaflet`.
  - **Verification**: `npm ls @geoman-io/leaflet-geoman-free shapefile proj4` resolves; `npx tsc --noEmit` unaffected.
  - **Dependencies**: None

- [X] T002 [P] Shared geometry conversion utilities
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/utils/geometryConversion.ts`
  - **Goal**: `rectangleToPolygon(bounds)` and `circleToPolygon(center, radiusMeters, steps=64)` (via `turf.circle`), both returning a `GeoJSONGeometry` of type `Polygon` (Research Decision 2).
  - **Acceptance Criteria**: A circle conversion produces exactly `steps` boundary vertices; a rectangle conversion produces exactly 5 positions (4 corners + closing point).
  - **Verification**: Covered by T013's unit test.
  - **Dependencies**: T001

- [X] T003 [P] Coordinate reprojection utility
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/utils/reprojection.ts`
  - **Goal**: `reprojectToWgs84(coordinates, sourceProjWkt)` wrapping `proj4`, used by Shapefile import (Research Decision 19).
  - **Acceptance Criteria**: Given a known non-WGS84 WKT (e.g., a UTM zone) and a test coordinate, output matches the expected WGS84 lon/lat within floating-point tolerance.
  - **Verification**: Covered by T084's unit test.
  - **Dependencies**: T001

- [X] T004 [P] Client-side GeoJSON structural pre-check
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/utils/validateGeoJson.ts`
  - **Goal**: A thin wrapper re-using the existing `geometrySchema`/`featureSchema` (003-database-foundation) to structurally check a drawn/imported geometry client-side before any network call — fails fast on the six-type/coordinate-range rules without waiting for the server.
  - **Acceptance Criteria**: Rejects an unsupported geometry type or out-of-range coordinate with the same message the server would produce.
  - **Verification**: Unit test asserts parity with `geometrySchema.safeParse`.
  - **Dependencies**: None

- [X] T005 [P] Feature snapshot/clone helpers
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/utils/featureSnapshot.ts`
  - **Goal**: `snapshotFeature(feature)` producing an independent `{ geometry, attributes, style }` deep copy, used by Copy/Duplicate (FR-027c–e) and Undo (FR-027a).
  - **Acceptance Criteria**: Mutating the original feature object after snapshotting does not affect the snapshot (deep copy, not a reference).
  - **Verification**: Unit test asserts independence.
  - **Dependencies**: None

- [X] T006 [P] Shared editing types
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/types/editing.types.ts`
  - **Goal**: `ActiveTool`, `UndoSnapshot`, `Clipboard`, and layer-lock/visibility/opacity map types per `data-model.md`.
  - **Acceptance Criteria**: Types compile and are imported (not redefined) by `editingStore.ts` (T011) and every hook/component that needs them.
  - **Verification**: `tsc --noEmit` passes.
  - **Dependencies**: None

- [X] T007 Bulk import Zod schema
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/shared/contracts/geoJsonImport.schema.ts`
  - **Goal**: `importFeatureCollectionSchema` — a `FeatureCollection` wrapper reusing the existing `geometrySchema`/attribute rules per feature (`data-model.md`'s Import Payload Shape).
  - **Acceptance Criteria**: Rejects an empty `features` array; rejects any entry whose `geometry` fails the existing six-type/range rules.
  - **Verification**: Covered by T014's unit test.
  - **Dependencies**: None

- [X] T008 `featureRepository.importFeatures`
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/server/repositories/featureRepository.ts`
  - **Goal**: New function per `contracts/repository-api.md` — ownership-scoped (reuses the existing `getLayerScopedToOwner` check), runs `ST_IsValid` and insert for every feature inside one `$transaction`, rolling back entirely on any failure (Research Decision 5).
  - **Acceptance Criteria**: A batch with one invalid geometry results in zero rows written for the whole batch.
  - **Verification**: Exercised by T085's API test.
  - **Dependencies**: T007

- [X] T009 `POST /api/layers/:layerId/features/import` Route Handler
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `app/api/layers/[layerId]/features/import/route.ts`
  - **Goal**: Resolves the user, Zod-validates the body with T007's schema, calls T008's repository function, maps results/errors via the existing `handleRouteError` — same shape as every existing Route Handler.
  - **Acceptance Criteria**: Returns `201 { importedCount }` on success; `400/404/401` per `contracts/api-contracts.md`.
  - **Verification**: `quickstart.md` Section 5 `curl` checks pass.
  - **Dependencies**: T008

- [X] T010 Apply the existing rate limiter to the new import endpoint
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `app/api/layers/[layerId]/features/import/route.ts`
  - **Goal**: Call the existing `assertWriteRateLimit(user.id, "features:write")` at the top of the handler, reusing the same bucket single-feature create already uses (no new bucket).
  - **Acceptance Criteria**: Exceeding the configured write-rate window on this endpoint returns `429 RATE_LIMITED`.
  - **Verification**: Manual burst test or unit test against the shared rate limiter.
  - **Dependencies**: T009

- [X] T011 [P] `editingStore.ts` scaffold
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/store/editingStore.ts`
  - **Goal**: New Zustand store — `tool`, `draftGeometry`, `targetLayerId`/`targetFeatureId`, `undoSnapshot`, `measurementResult`, `importResult`, `lockedLayerIds`, per-layer visibility/opacity map, `clipboard`, plus all actions listed in `contracts/client-api.md`.
  - **Acceptance Criteria**: Activating a new `tool` clears `draftGeometry`/`measurementResult` from any previous tool.
  - **Verification**: Covered by T030's unit test.
  - **Dependencies**: T006

- [X] T012 [P] `databaseStore.ts` additive extension for multi-select
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/store/databaseStore.ts`
  - **Goal**: Add `selectedFeatureIds: string[]` and `toggleFeatureSelection`/`selectFeatureRange`/`clearFeatureSelection`, additively (Research Decision 13) — every existing field/action/test untouched.
  - **Acceptance Criteria**: All pre-existing `databaseStore.test.ts` assertions (from 003-database-foundation) still pass unmodified.
  - **Verification**: `npm run test -- databaseStore` passes with zero regressions.
  - **Dependencies**: T006

- [X] T013 [P] Unit test: geometry conversion utilities
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/features/database/utils/__tests__/geometryConversion.test.ts`
  - **Goal**: Cover T002's rectangle/circle→Polygon conversion, including vertex-count assertions.
  - **Acceptance Criteria**: Both conversion functions verified structurally correct.
  - **Verification**: `npm run test -- geometryConversion` passes.
  - **Dependencies**: T002

- [X] T014 [P] Unit test: bulk import schema
  - **Priority**: Blocking
  - **User Story**: None (Foundation)
  - **Files**: `src/shared/contracts/__tests__/geoJsonImport.schema.test.ts`
  - **Goal**: Cover T007's accept/reject cases (empty array, invalid geometry entry).
  - **Acceptance Criteria**: At least one accept and two reject cases asserted.
  - **Verification**: `npm run test -- geoJsonImport.schema` passes.
  - **Dependencies**: T007

- [X] T015 **Checkpoint** — Foundation quality gate
  - **Priority**: Blocking (gates every later phase)
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the shared foundation is sound before drawing/editing/measurement/layer work begins.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, and all tests through T014 pass; new Route Handler reachable per `quickstart.md` Section 1.
  - **Verification**: All commands run clean in sequence.
  - **Dependencies**: T001–T014

---

## Phase 2: Drawing & Editing

**Purpose**: Draw new features and reshape/move/delete existing ones.

- [X] T016 [US4] `DrawingToolbar.tsx` shell with mutually exclusive tool selection
  - **Priority**: P4
  - **User Story**: US4 — Draw and Edit Geometry
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: shadcn `ToggleGroup` over `editingStore.tool`; selecting a new tool deselects any other.
  - **Acceptance Criteria**: Only one tool is ever active at a time.
  - **Verification**: Covered by T031's component test.
  - **Dependencies**: T011

- [X] T017 [US4] Draw Point
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: Wire Leaflet-Geoman's point-draw mode; on completion, call the existing `useCreateFeature(layerId)` with the drawn `Point` geometry.
  - **Acceptance Criteria**: A drawn point is saved and appears on the map within 2 s (SC-003).
  - **Verification**: `quickstart.md` Section 2, step 2.
  - **Dependencies**: T016

- [X] T018 [US4] Draw LineString
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: Geoman line-draw mode → `useCreateFeature` with a `LineString`.
  - **Acceptance Criteria**: A drawn line is saved and rendered.
  - **Verification**: Manual/component test.
  - **Dependencies**: T016

- [X] T019 [US4] Draw Polygon
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: Geoman polygon-draw mode → `useCreateFeature` with a `Polygon`.
  - **Acceptance Criteria**: A valid polygon saves; a self-intersecting one is rejected (FR-027, see T026).
  - **Verification**: `quickstart.md` Section 2, steps 3, 6.
  - **Dependencies**: T016

- [X] T020 [US4] Draw Rectangle (normalized to Polygon)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: Geoman rectangle-draw mode → T002's `rectangleToPolygon` → `useCreateFeature`.
  - **Acceptance Criteria**: Saved feature's `geometry.type === "Polygon"` (Research Decision 2).
  - **Verification**: `quickstart.md` Section 2, step 4.
  - **Dependencies**: T016, T002

- [X] T021 [US4] Draw Circle (normalized to Polygon)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: Geoman circle-draw mode → T002's `circleToPolygon` → `useCreateFeature`.
  - **Acceptance Criteria**: Saved feature's `geometry.type === "Polygon"` with ~64 vertices.
  - **Verification**: `quickstart.md` Section 2, step 5.
  - **Dependencies**: T016, T002

- [X] T022 [US4] Edit geometry — drag vertices
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx` (edit mode), or a sibling `GeometryEditor.tsx`
  - **Goal**: Geoman edit mode on a selected feature's layer; on edit-complete, call the existing `useUpdateFeature` with the new geometry.
  - **Acceptance Criteria**: A dragged vertex's new position is saved and reflected on reload.
  - **Verification**: `quickstart.md` Section 3, step 1.
  - **Dependencies**: T011

- [X] T023 [US4] Add/remove vertices during geometry edit
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: Same as T022
  - **Goal**: Geoman's add/remove-vertex edit affordances, same save path as T022.
  - **Acceptance Criteria**: Adding a vertex to a line/polygon and saving persists the new vertex count.
  - **Verification**: Component/manual test.
  - **Dependencies**: T022

- [X] T024 [US4] Move whole feature
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: Same as T022
  - **Goal**: Geoman drag/move mode on a selected feature; on move-complete, `useUpdateFeature` with the translated geometry.
  - **Acceptance Criteria**: Dragging a feature to a new position saves that position.
  - **Verification**: Manual/component test.
  - **Dependencies**: T022

- [X] T025 [US4] Delete geometry/feature via toolbar
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: Toolbar delete action calls the existing `useDeleteFeature`.
  - **Acceptance Criteria**: Deleted feature disappears from map and layer feature list; siblings unaffected.
  - **Verification**: `quickstart.md` Section 3, step 3.
  - **Dependencies**: T011

- [X] T026 [US4] Geometry validation error UI
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/components/DrawingToolbar.tsx`
  - **Goal**: Surface the existing `INVALID_INPUT`/`ST_IsValid`-rejection error message clearly (Alert/toast), never a raw stack trace, per FR-027.
  - **Acceptance Criteria**: A self-intersecting polygon submission shows a clear message and nothing is saved.
  - **Verification**: `quickstart.md` Section 2, step 6.
  - **Dependencies**: T019

- [X] T027 [US4] Cancel current drawing
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/store/editingStore.ts`, `DrawingToolbar.tsx`
  - **Goal**: `cancelDraft()` clears `draftGeometry`/`tool` with zero API calls (FR-027b).
  - **Acceptance Criteria**: Canceling mid-draw makes no network request and leaves no partial feature.
  - **Verification**: `quickstart.md` Section 2, step 7.
  - **Dependencies**: T011

- [X] T028 [US4] Undo last edit (single-step, no redo)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/hooks/useFeatureEditing.ts`, `onSuccess` additions to `useCreateFeature`/`useUpdateFeature`/`useDeleteFeature`
  - **Goal**: `useUndoLastEdit()` per Research Decision 4 — replays the inverse of the single most recent mutation, then clears the snapshot. Explicitly one step only, no redo (spec.md Assumptions, amended).
  - **Acceptance Criteria**: Deleting a feature then pressing Undo re-creates it with identical attributes/style; a second Undo press is a no-op.
  - **Verification**: `quickstart.md` Section 3, steps 4–5.
  - **Dependencies**: T005, T011, T017, T025

- [X] T029 [US4] Lock enforcement on mutating actions
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `DrawingToolbar.tsx`, editing action handlers
  - **Goal**: Before any draw/edit/delete/paste/duplicate action, check `editingStore.lockedLayerIds`; if locked, block with a clear message (FR-006a).
  - **Acceptance Criteria**: Every mutating action against a locked layer is blocked; viewing (popup, zoom) still works.
  - **Verification**: `quickstart.md` Section 8, step 4.
  - **Dependencies**: T011, T017, T022, T025

- [X] T030 [P] [US4] Unit test: `editingStore` tool/draft/undo-snapshot logic
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/__tests__/editingStore.test.ts`
  - **Goal**: Cover tool switching clearing draft/measurement, `cancelDraft`, undo-snapshot set/clear.
  - **Acceptance Criteria**: All `editingStore` actions from T011 asserted.
  - **Verification**: `npm run test -- editingStore` passes.
  - **Dependencies**: T011

- [X] T031 [P] [US4] Component test: `DrawingToolbar` mutual exclusivity
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/__tests__/DrawingToolbar.test.tsx`
  - **Goal**: Selecting each tool deselects any previously active one; disabled state on a locked layer.
  - **Acceptance Criteria**: Asserted for all five drawing tools plus edit/measure mutual exclusivity.
  - **Verification**: `npm run test -- DrawingToolbar` passes.
  - **Dependencies**: T016, T029

- [X] T032 [US4] Integration test: draw → edit → undo → delete
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/__tests__/drawingEditing.integration.test.ts`
  - **Goal**: Full flow against the real test database (skip-if-unavailable pattern), asserting each step's persisted state.
  - **Acceptance Criteria**: Matches `quickstart.md` Sections 2–3 end to end.
  - **Verification**: `npm run test -- drawingEditing.integration` passes (or skips cleanly).
  - **Dependencies**: T017, T022, T025, T028

- [X] T033 **Checkpoint** — Drawing & Editing quality gate
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: N/A
  - **Goal**: Confirm drawing/editing/undo/cancel/lock-enforcement all work independently.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, all tests through T032 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T016–T032

---

## Phase 3: Measurements

**Purpose**: Ephemeral, client-side distance/area/perimeter tools.

- [X] T034 [US6] `MeasurementToolbar.tsx` shell
  - **Priority**: P6
  - **User Story**: US6 — Measure Distance and Area
  - **Files**: `src/features/database/components/MeasurementToolbar.tsx`
  - **Goal**: shadcn toggle group activating `measure-distance`/`measure-area` in `editingStore.tool`, mutually exclusive with drawing/edit tools.
  - **Acceptance Criteria**: Activating a measurement tool deactivates any drawing/edit tool and vice versa.
  - **Verification**: Covered by T041.
  - **Dependencies**: T011

- [X] T035 [US6] Measure distance
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `MeasurementToolbar.tsx`
  - **Goal**: Each click appends a vertex to a local point list; `turf.length` recomputes `editingStore.measurementResult` (Research Decision 3) — no network call.
  - **Acceptance Criteria**: Distance updates after each click.
  - **Verification**: `quickstart.md` Section 4, step 1.
  - **Dependencies**: T034

- [X] T036 [US6] Measure area
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `MeasurementToolbar.tsx`
  - **Goal**: Clicked points form a polygon; `turf.area` computes the enclosed area.
  - **Acceptance Criteria**: Area updates as points are added.
  - **Verification**: `quickstart.md` Section 4, step 2.
  - **Dependencies**: T034

- [X] T037 [US6] Measure perimeter
  - **Priority**: P6
  - **User Story**: US6 (natural extension of Measure Distance applied to a closed ring — no new spec FR required, since it is the same `turf.length` calculation applied to a polygon boundary rather than an open line)
  - **Files**: `MeasurementToolbar.tsx`
  - **Goal**: When the area tool's polygon is closed, additionally compute and display its boundary length (perimeter) via `turf.length` on the ring.
  - **Acceptance Criteria**: Perimeter value shown alongside the area result for the same drawn shape.
  - **Verification**: Manual/component test.
  - **Dependencies**: T036

- [X] T038 [US6] Live measurement while drawing
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `MeasurementToolbar.tsx`
  - **Goal**: Recompute distance/area/perimeter on every vertex addition, not only on completion.
  - **Acceptance Criteria**: Result visibly updates mid-draw, before the shape is finished.
  - **Verification**: `quickstart.md` Section 4 (live update behavior).
  - **Dependencies**: T035, T036

- [X] T039 [P] [US6] Measurement formatting utilities
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/database/utils/formatMeasurement.ts`
  - **Goal**: Format a raw meters/square-meters value into a human-readable string with an appropriate unit (m/km, m²/hectares) based on magnitude.
  - **Acceptance Criteria**: A small value formats in meters/m²; a large one in km/hectares.
  - **Verification**: Covered by T040.
  - **Dependencies**: None

- [X] T040 [P] [US6] Unit test: measurement calculation + formatting
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/database/utils/__tests__/formatMeasurement.test.ts`
  - **Goal**: Cover T039's unit-switching thresholds and rounding.
  - **Acceptance Criteria**: At least one case per unit tier asserted.
  - **Verification**: `npm run test -- formatMeasurement` passes.
  - **Dependencies**: T039

- [X] T041 [US6] Component test: `MeasurementToolbar` live updates
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: `src/features/database/__tests__/MeasurementToolbar.test.tsx`
  - **Goal**: Simulate clicks, assert `measurementResult` updates each time and clears on tool close with zero mocked network calls.
  - **Acceptance Criteria**: Zero `fetch` calls throughout the test.
  - **Verification**: `npm run test -- MeasurementToolbar` passes.
  - **Dependencies**: T034–T038

- [X] T042 **Checkpoint** — Measurements quality gate
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: N/A
  - **Goal**: Confirm measurement is fully independent of persisted data.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T041 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T034–T041

---

## Phase 4: Layer Operations

**Purpose**: Project Explorer, Layer Tree, and all per-layer controls.

- [X] T043 [US1] `ProjectExplorer.tsx`
  - **Priority**: P1
  - **User Story**: US1 — Browse Projects and Manage the Layer List
  - **Files**: `src/features/database/components/ProjectExplorer.tsx`
  - **Goal**: List/switch projects using the existing `useProjects` hook (003-database-foundation) — no new data access.
  - **Acceptance Criteria**: Selecting a project opens its Layer Tree.
  - **Verification**: `quickstart.md` Section 8, step 1.
  - **Dependencies**: None (003-database-foundation hooks already exist)

- [X] T044 [US1] `LayerTree.tsx` shell
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/components/LayerTree.tsx`
  - **Goal**: List a project's layers ordered via the existing `useLayers` hook.
  - **Acceptance Criteria**: Layers render in persisted `order`.
  - **Verification**: `quickstart.md` Section 8, step 1.
  - **Dependencies**: T043

- [X] T045 [US1] `LayerTreeItem.tsx` — create layer
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/components/LayerTreeItem.tsx`
  - **Goal**: "New layer" control using the existing `useCreateLayer` hook.
  - **Acceptance Criteria**: Created layer appears in the tree without a full reload (FR-006).
  - **Verification**: `quickstart.md` Section 8, step 2.
  - **Dependencies**: T044

- [X] T046 [US1] `LayerTreeItem.tsx` — rename layer
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `LayerTreeItem.tsx`
  - **Goal**: Inline rename using the existing `useRenameLayer` hook.
  - **Acceptance Criteria**: Renamed layer reflects immediately.
  - **Verification**: `quickstart.md` Section 8, step 2.
  - **Dependencies**: T044

- [X] T047 [US1] `LayerTreeItem.tsx` — delete layer with confirmation
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `LayerTreeItem.tsx`, shadcn `AlertDialog`
  - **Goal**: Delete control using the existing `useDeleteLayer` hook, gated by a confirmation dialog.
  - **Acceptance Criteria**: Confirmed delete removes the layer and its features (cascade, existing behavior); canceling the dialog does nothing.
  - **Verification**: `quickstart.md` Section 8, step 2.
  - **Dependencies**: T044

- [X] T048 [US1] Visibility toggle per layer
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `LayerTreeItem.tsx`, `editingStore.ts`
  - **Goal**: Session-only visibility toggle (FR-003) reading/writing `editingStore`; hides/shows that layer's rendered features.
  - **Acceptance Criteria**: Toggling off hides only that layer's features; toggling on restores them.
  - **Verification**: `quickstart.md` Section 1, step 3 (original increment).
  - **Dependencies**: T011, T044

- [X] T049 [US1] Lock layer toggle
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `LayerTreeItem.tsx`, `editingStore.ts`
  - **Goal**: Session-only lock toggle (FR-006a) writing `editingStore.lockedLayerIds`.
  - **Acceptance Criteria**: Locked state is visually indicated in the tree; toggling unlocks and re-enables editing.
  - **Verification**: `quickstart.md` Section 8, step 4.
  - **Dependencies**: T011, T044

- [X] T050 [US1] Layer ordering — drag-and-drop reorder
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `LayerTree.tsx`
  - **Goal**: Native pointer-events drag-and-drop (Research Decision 12, no new DnD library) calling the existing `useReorderLayers` on drop.
  - **Acceptance Criteria**: New order persists across a reload.
  - **Verification**: `quickstart.md` Section 8, step 3.
  - **Dependencies**: T044

- [X] T051 [US1] Active layer selection
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `LayerTreeItem.tsx`
  - **Goal**: Clicking a layer calls the existing `databaseStore.selectLayer`.
  - **Acceptance Criteria**: The selected layer is visually indicated and becomes the default target for new drawings.
  - **Verification**: Manual/component test.
  - **Dependencies**: T044

- [X] T052 [US1] Opacity slider per layer
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `LayerTreeItem.tsx`, `editingStore.ts`
  - **Goal**: Session-only opacity control (FR-004) applied to that layer's rendered features.
  - **Acceptance Criteria**: Adjusting opacity visibly changes rendering without affecting other layers.
  - **Verification**: Manual/component test.
  - **Dependencies**: T011, T044

- [X] T053 [P] [US1] Unit test: `editingStore` lock/visibility/opacity actions
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/__tests__/editingStore.test.ts` (extended)
  - **Goal**: Cover lock/unlock, visibility toggle, opacity set.
  - **Acceptance Criteria**: All three per-layer state concerns asserted independently per layer id.
  - **Verification**: `npm run test -- editingStore` passes.
  - **Dependencies**: T048, T049, T052

- [X] T054 [US1] Component test: `LayerTree` CRUD/reorder/lock/visibility
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/__tests__/LayerTree.test.tsx`
  - **Goal**: Cover create/rename/delete, drag-reorder, lock toggle, visibility toggle, opacity change.
  - **Acceptance Criteria**: Each interaction calls the correct existing hook/store action.
  - **Verification**: `npm run test -- LayerTree` passes.
  - **Dependencies**: T045–T052

- [X] T055 **Checkpoint** — Layer Operations quality gate
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: N/A
  - **Goal**: Confirm Project Explorer/Layer Tree fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T054 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T043–T054

---

## Phase 5: Feature Operations

**Purpose**: Selection, multi-selection, clipboard operations, and attribute
editing.

- [X] T056 [US2] Select feature (click)
  - **Priority**: P2
  - **User Story**: US2 — View, Navigate, and Inspect Features
  - **Files**: Map feature-rendering layer (existing `map`/`database` integration point)
  - **Goal**: Clicking a rendered feature sets `databaseStore.selectedFeatureId` and applies a selected visual style.
  - **Acceptance Criteria**: Exactly one feature shows as selected at a time when not in multi-select mode.
  - **Verification**: `quickstart.md` Section 6, step 1.
  - **Dependencies**: T012

- [X] T057 [US5] Multi-select via Shift-click
  - **Priority**: P5
  - **User Story**: US5 — Multi-Select and Bulk Actions
  - **Files**: Same rendering layer as T056
  - **Goal**: Shift-click calls `databaseStore.toggleFeatureSelection(id)`.
  - **Acceptance Criteria**: Multiple features show selected simultaneously.
  - **Verification**: `quickstart.md` Section 9, step 1.
  - **Dependencies**: T012, T056

- [X] T058 [US5] Multi-select via box/drag-select
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/database/components/SelectionBox.tsx`
  - **Goal**: Drawing a box computes intersecting rendered features (via their Leaflet layer bounds) and calls `selectFeatureRange` once.
  - **Acceptance Criteria**: All features fully or partially within the drawn box become selected in one action.
  - **Verification**: `quickstart.md` Section 9, step 1 (alternate method).
  - **Dependencies**: T012

- [X] T059 [US4] Copy feature
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/hooks/useFeatureEditing.ts`
  - **Goal**: Copy action snapshots the selected feature (via T005) into `editingStore.clipboard`, replacing any prior entry.
  - **Acceptance Criteria**: Copying a second feature discards the first copy (FR-027c).
  - **Verification**: `quickstart.md` Section 10, step 1.
  - **Dependencies**: T005, T011, T056

- [X] T060 [US4] Paste feature
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `useFeatureEditing.ts`
  - **Goal**: Paste calls the existing `useCreateFeature(activeLayerId)` with the clipboard's geometry/attributes/style (FR-027d); blocked if the active layer is locked (T029).
  - **Acceptance Criteria**: A new, independent feature is created; the original is unchanged; paste can repeat.
  - **Verification**: `quickstart.md` Section 10, steps 1, 3.
  - **Dependencies**: T059, T029

- [X] T061 [US4] Duplicate feature
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `useFeatureEditing.ts`
  - **Goal**: One-action copy+paste on the currently selected feature (FR-027e).
  - **Acceptance Criteria**: A new copy appears without a separate explicit copy/paste step.
  - **Verification**: `quickstart.md` Section 10, step 2.
  - **Dependencies**: T059, T060

- [X] T062 [US4] Delete feature (single, from selection context)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: Reuses T025's delete path
  - **Goal**: Delete action available from the selection context (not only the drawing toolbar), calling the existing `useDeleteFeature`.
  - **Acceptance Criteria**: Same behavior as T025, reachable from a selected feature's context.
  - **Verification**: Manual/component test.
  - **Dependencies**: T025, T056

- [X] T063 [US5] Bulk delete (multi-selected)
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `useFeatureEditing.ts`
  - **Goal**: "Delete selected" iterates `databaseStore.selectedFeatureIds`, calling the existing `useDeleteFeature` for each (client-side batch, not a new bulk-delete endpoint — deletion has no all-or-nothing requirement in the spec).
  - **Acceptance Criteria**: Every selected feature is removed; unselected features are unaffected.
  - **Verification**: `quickstart.md` Section 9, step 2.
  - **Dependencies**: T057, T058

- [X] T064 [US4] Move feature (from selection context)
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: Reuses T024's move path
  - **Goal**: Confirm move/drag is reachable and correctly scoped when initiated from a selected feature (cross-reference to Phase 2's Geoman drag mode).
  - **Acceptance Criteria**: Same behavior as T024, verified from the selection/Feature-Operations entry point.
  - **Verification**: Manual/component test.
  - **Dependencies**: T024, T056

- [X] T065 [US3] `AttributeForm.tsx`
  - **Priority**: P3
  - **User Story**: US3 — View and Edit Feature Attributes
  - **Files**: `src/features/database/components/AttributeForm.tsx`
  - **Goal**: Dynamic key/value list editor (shadcn form primitives) over a feature's current attributes, validated against the existing `updateFeatureSchema` (Research Decision 7).
  - **Acceptance Criteria**: Renders every attribute currently on the feature.
  - **Verification**: Covered by T123.
  - **Dependencies**: T056

- [X] T066 [US3] Edit attribute value
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `AttributeForm.tsx`
  - **Goal**: Editing a value calls the existing `useUpdateFeature`, leaving geometry/style unchanged.
  - **Acceptance Criteria**: Only the edited key's value changes server-side.
  - **Verification**: `quickstart.md` Section 3, step 2.
  - **Dependencies**: T065

- [X] T067 [US3] Add new attribute key
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `AttributeForm.tsx`
  - **Goal**: "Add attribute" row, validated for uniqueness against existing keys (existing schema rule) before save.
  - **Acceptance Criteria**: New key/value persists; other features' attributes are unaffected.
  - **Verification**: Component test.
  - **Dependencies**: T065

- [X] T068 [US3] Edit feature style via Attribute Form
  - **Priority**: P3
  - **User Story**: US3
  - **Files**: `AttributeForm.tsx`
  - **Goal**: Style fields (color/strokeWidth/fillOpacity) call the existing `useUpdateFeature`, independent of attribute/geometry edits.
  - **Acceptance Criteria**: Style change does not alter geometry or attributes.
  - **Verification**: Component test.
  - **Dependencies**: T065

- [X] T069 [P] [US5] Unit test: `databaseStore` multi-select actions
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/database/__tests__/databaseStore.test.ts` (extended)
  - **Goal**: Cover `toggleFeatureSelection`, `selectFeatureRange`, `clearFeatureSelection`, and that existing single-select actions/tests still pass unmodified.
  - **Acceptance Criteria**: Zero regressions to pre-existing assertions; new actions fully covered.
  - **Verification**: `npm run test -- databaseStore` passes.
  - **Dependencies**: T012

- [X] T070 [US5] Component test: multi-select + bulk delete
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/database/__tests__/multiSelect.test.tsx`
  - **Goal**: Shift-click and box-select both produce the expected selection set; bulk delete removes exactly that set.
  - **Acceptance Criteria**: Matches `quickstart.md` Section 9.
  - **Verification**: `npm run test -- multiSelect` passes.
  - **Dependencies**: T057, T058, T063

- [X] T071 [US4] Integration test: copy → paste → verify independence
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: `src/features/database/__tests__/copyPaste.integration.test.ts`
  - **Goal**: Real-database test (skip-if-unavailable): copy, delete original, paste, confirm the pasted feature still has the original's geometry/attributes/style.
  - **Acceptance Criteria**: Matches `quickstart.md` Section 10, step 3.
  - **Verification**: `npm run test -- copyPaste.integration` passes or skips cleanly.
  - **Dependencies**: T059, T060, T061

- [X] T072 **Checkpoint** — Feature Operations quality gate
  - **Priority**: P3/P4/P5
  - **User Story**: US3, US4, US5
  - **Files**: N/A
  - **Goal**: Confirm selection, multi-selection, clipboard operations, and attribute editing are all independently functional.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T071 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T056–T071

---

## Phase 6: Import / Export

**Purpose**: GeoJSON and Shapefile import (append-only, all-or-nothing), and
GeoJSON export.

- [X] T073 [US7] `ImportExportControls.tsx` shell
  - **Priority**: P7
  - **User Story**: US7 — Import and Export Spatial Data
  - **Files**: `src/features/database/components/ImportExportControls.tsx`
  - **Goal**: File input (import) and download-trigger button (export), shadcn `Button`.
  - **Acceptance Criteria**: Both controls render and are keyboard-operable.
  - **Verification**: Covered by T124.
  - **Dependencies**: None

- [X] T074 [US7] Import GeoJSON — file read + parse
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `ImportExportControls.tsx`
  - **Goal**: Read the uploaded `.geojson`/`.json` file, parse it, run T004's client-side pre-check.
  - **Acceptance Criteria**: A malformed file is rejected before any network call.
  - **Verification**: `quickstart.md` Section 5.
  - **Dependencies**: T004, T073

- [X] T075 [US7] `useImportFeatures` hook
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/database/hooks/useFeatureEditing.ts`
  - **Goal**: React Query mutation calling `featureService.importFeatureCollection` (new method) → T009's endpoint; invalidates the layer's feature-list query key (Research Decision 11).
  - **Acceptance Criteria**: Successful import triggers a refetch showing the new features.
  - **Verification**: Covered by T085 (API) and hook test.
  - **Dependencies**: T009, T074

- [X] T076 [US7] Append-only guarantee verification
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: N/A (verification task)
  - **Goal**: Confirm importing into a layer with existing features never alters/removes them (FR-034).
  - **Acceptance Criteria**: Pre-existing feature count + imported count = post-import count, exactly.
  - **Verification**: `quickstart.md` Section 5, first `curl` check.
  - **Dependencies**: T075

- [X] T077 [US7] `shapefileImport.ts` — parse `.shp`/`.dbf`
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/database/services/shapefileImport.ts`
  - **Goal**: Use the `shapefile` package to read uploaded companion files into GeoJSON features, client-side (Research Decision 19).
  - **Acceptance Criteria**: A valid Shapefile set converts to a `FeatureCollection` with matching feature count.
  - **Verification**: Covered by T084.
  - **Dependencies**: T001

- [X] T078 [US7] CRS handling — reprojection via `.prj`
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `shapefileImport.ts`
  - **Goal**: If a `.prj` file is present, use T003's `reprojectToWgs84` on every coordinate before assembling the `FeatureCollection`; assume WGS84 if absent (spec.md Assumptions).
  - **Acceptance Criteria**: A non-WGS84 source Shapefile's features land at the geographically correct WGS84 position.
  - **Verification**: `quickstart.md` Section 11, step 1.
  - **Dependencies**: T003, T077

- [X] T079 [US7] Shapefile validation and rejection
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `shapefileImport.ts`
  - **Goal**: Reject (before any network call) a Shapefile missing a required companion file or containing an unsupported geometry type — all-or-nothing (FR-037).
  - **Acceptance Criteria**: Missing `.dbf` is rejected with a clear message.
  - **Verification**: `quickstart.md` Section 11, step 2.
  - **Dependencies**: T077

- [X] T080 [US7] Export GeoJSON — pagination aggregation
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/database/services/exportLayer.ts`
  - **Goal**: Page through the existing `featureService.list(layerId, { cursor, limit })` until `nextCursor` is `null`, assembling a complete `FeatureCollection` (Research Decision 6).
  - **Acceptance Criteria**: Assembled collection's feature count matches the layer's actual total.
  - **Verification**: `quickstart.md` Section 5, export check.
  - **Dependencies**: None

- [X] T081 [US7] `useExportLayer` hook — trigger download
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `useFeatureEditing.ts`
  - **Goal**: Wraps T080, builds a `Blob`/object URL, and triggers a `.geojson` file download; exposes loading/error state.
  - **Acceptance Criteria**: Clicking "Export" downloads a valid, complete GeoJSON file.
  - **Verification**: `quickstart.md` Section 5.
  - **Dependencies**: T080, T073

- [X] T082 [US7] Import error-handling UI
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `ImportExportControls.tsx`
  - **Goal**: Render the typed `{ error: { code, message } }` shape's message on any import failure (GeoJSON or Shapefile), never a raw stack trace.
  - **Acceptance Criteria**: Every rejection path (T076, T079, server `400`) shows a clear, distinct message.
  - **Verification**: `quickstart.md` Sections 5, 11.
  - **Dependencies**: T075, T079

- [X] T083 [US7] Import confirmation dialog for large files
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `ImportExportControls.tsx`, shadcn `AlertDialog`
  - **Goal**: Confirm before committing an import above a reasonable size threshold (e.g., >100 features), since it's irreversible via undo (single-step only).
  - **Acceptance Criteria**: Canceling the dialog makes no network call.
  - **Verification**: Component test.
  - **Dependencies**: T075

- [X] T084 [P] [US7] Unit test: Shapefile conversion + reprojection
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/database/services/__tests__/shapefileImport.test.ts`
  - **Goal**: Cover T077/T078/T079 with mocked `shapefile`/`proj4` outputs (fixture-based, no real binary files needed).
  - **Acceptance Criteria**: Reprojection correctness and rejection cases both asserted.
  - **Verification**: `npm run test -- shapefileImport` passes.
  - **Dependencies**: T077, T078, T079

- [X] T085 [US7] API test: bulk import endpoint
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `app/api/layers/[layerId]/features/import/__tests__/import.api.test.ts`
  - **Goal**: Against the real test database (skip-if-unavailable): success, partial-invalid-batch rejection (zero rows written), cross-owner `404`, malformed body `400`.
  - **Acceptance Criteria**: All four cases pass or skip cleanly.
  - **Verification**: `npm run test -- import.api` passes.
  - **Dependencies**: T009, T010

- [X] T086 [US7] Integration test: import → append-only → export → completeness
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `src/features/database/__tests__/importExport.integration.test.ts`
  - **Goal**: Full flow against the real test database.
  - **Acceptance Criteria**: Matches `quickstart.md` Section 5 end to end.
  - **Verification**: `npm run test -- importExport.integration` passes or skips cleanly.
  - **Dependencies**: T075, T081

- [X] T087 **Checkpoint** — Import/Export quality gate
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: N/A
  - **Goal**: Confirm both formats' import and export are fully functional and independently testable.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T086 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T073–T086

---

## Phase 7: Map UI

**Purpose**: Toolbars, context menus, sidebar, and chrome — new elements
plus verified reuse of already-existing ones.

- [X] T088 [US4] Integrate `DrawingToolbar` into the map shell
  - **Priority**: P4
  - **User Story**: US4
  - **Files**: Map shell/layout component (existing `dashboard`/`map` integration point)
  - **Goal**: Place the toolbar in the map UI without disrupting existing layout (Navbar/Sidebar/StatusBar).
  - **Acceptance Criteria**: Toolbar visible and usable alongside existing chrome.
  - **Verification**: Manual check.
  - **Dependencies**: T016

- [X] T089 [US6] Integrate `MeasurementToolbar` into the map shell
  - **Priority**: P6
  - **User Story**: US6
  - **Files**: Same as T088
  - **Goal**: Same integration as T088 for the measurement toolbar.
  - **Acceptance Criteria**: Both toolbars coexist without overlapping or conflicting.
  - **Verification**: Manual check.
  - **Dependencies**: T034, T088

- [X] T090 [US5] `FeatureContextMenu.tsx`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/database/components/FeatureContextMenu.tsx`
  - **Goal**: shadcn/ui `ContextMenu` (Research Decision 14) on right-click over a feature: delete, zoom-to, edit, copy, duplicate.
  - **Acceptance Criteria**: Escape or click-away dismisses with no side effects.
  - **Verification**: `quickstart.md` Section 9, step 3.
  - **Dependencies**: T056, T059, T061

- [X] T091 [US5] `LayerContextMenu.tsx`
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/database/components/LayerContextMenu.tsx`
  - **Goal**: Right-click over a Layer Tree item: rename, lock/unlock, delete, zoom-to-layer.
  - **Acceptance Criteria**: Actions match the equivalent Layer Tree controls (T046, T047, T049).
  - **Verification**: Component test.
  - **Dependencies**: T044, T046, T047, T049

- [X] T092 [US1] `RightSidebar.tsx` container
  - **Priority**: P1
  - **User Story**: US1
  - **Files**: `src/features/database/components/RightSidebar.tsx`
  - **Goal**: Layout container hosting `LayerTree` (and future Attribute Table/Feature Panel slots), following the existing `Sidebar.tsx` pattern from `dashboard`.
  - **Acceptance Criteria**: Collapsible/responsive consistent with the existing left `Sidebar.tsx` behavior.
  - **Verification**: Component test + manual responsive check.
  - **Dependencies**: T044

- [ ] T093 [US2] Verify Coordinate Display integration (no new code)
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A (verification against existing `src/features/dashboard/components/StatusBar.tsx`)
  - **Goal**: Confirm `StatusBar.tsx` continues to show live coordinates correctly alongside the new editing toolbars/panels (Research Decision 15 — already fully implemented, no new code).
  - **Acceptance Criteria**: Coordinates update continuously with the new UI mounted.
  - **Verification**: Manual check.
  - **Dependencies**: T088

- [ ] T094 [US2] Verify Scale Bar integration (no new code)
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A (verification against existing `MapCore.tsx`'s `ScaleControl`)
  - **Goal**: Confirm the existing scale bar renders correctly with the new toolbars/panels present (Research Decision 15).
  - **Acceptance Criteria**: Scale bar visible and accurate at various zoom levels.
  - **Verification**: Manual check.
  - **Dependencies**: T088

- [ ] T095 [US2] Verify Mouse Position display (same as Coordinate Display)
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A
  - **Goal**: Confirm "mouse position" is satisfied by the same `StatusBar.tsx` mechanism as T093 — no separate implementation needed.
  - **Acceptance Criteria**: Same as T093.
  - **Verification**: Manual check.
  - **Dependencies**: T093

- [ ] T096 [US2] Verify Zoom Controls integration (no new code)
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A (verification against existing `MapCore.tsx`'s `ZoomControl`)
  - **Goal**: Confirm existing zoom in/out controls remain usable alongside the new toolbars.
  - **Acceptance Criteria**: Zoom controls functional and not visually obscured by new UI.
  - **Verification**: Manual check.
  - **Dependencies**: T088

- [X] T097 [US2] `NorthArrow.tsx`
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/database/components/NorthArrow.tsx`
  - **Goal**: Static SVG/icon map overlay (Research Decision 16) — the one genuinely new US2 chrome element.
  - **Acceptance Criteria**: Renders consistently in both light and dark mode.
  - **Verification**: Component test (renders without error).
  - **Dependencies**: None

- [ ] T098 [US2] Verify Basemap Switcher integration (no new code)
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A (verification against existing `LayerSwitcher.tsx`/`basemaps.ts`)
  - **Goal**: Confirm basemap switching continues to work alongside the new editing UI (Research Decision 15).
  - **Acceptance Criteria**: Switching basemap doesn't disrupt active drawing/selection state.
  - **Verification**: Manual check.
  - **Dependencies**: T088

- [X] T099 [US8] `useKeyboardShortcuts` hook
  - **Priority**: P8
  - **User Story**: US8 — Map Chrome and Keyboard Access
  - **Files**: `src/features/database/hooks/useKeyboardShortcuts.ts`
  - **Goal**: Single `keydown` listener dispatching to an action map — Delete (delete selection), Escape (cancel tool/close menu/dismiss dialog), Ctrl+Z (undo), Ctrl+C/Ctrl+V (copy/paste) — per Research Decision 17, no new library.
  - **Acceptance Criteria**: Each bound key triggers exactly the same effect as its equivalent UI action.
  - **Verification**: Covered by T102.
  - **Dependencies**: T028, T059, T060, T062

- [X] T100 [US8] Wire keyboard shortcuts into the map-editing shell
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: Map shell/layout component
  - **Goal**: Mount `useKeyboardShortcuts` once at the shell level so bindings are active whenever the editing UI is open.
  - **Acceptance Criteria**: Shortcuts work regardless of which panel/toolbar currently has focus, except when a text input is focused (e.g., renaming a layer, editing an attribute value).
  - **Verification**: `quickstart.md` Section 12, step 3.
  - **Dependencies**: T099

- [X] T101 [P] [US5] Component test: context menus
  - **Priority**: P5
  - **User Story**: US5
  - **Files**: `src/features/database/__tests__/contextMenus.test.tsx`
  - **Goal**: Cover both `FeatureContextMenu` and `LayerContextMenu`'s actions and dismiss behavior.
  - **Acceptance Criteria**: Escape and click-away both dismiss with no side effects, per FR-029.
  - **Verification**: `npm run test -- contextMenus` passes.
  - **Dependencies**: T090, T091

- [X] T102 [P] [US8] Unit test: `useKeyboardShortcuts` dispatch
  - **Priority**: P8
  - **User Story**: US8
  - **Files**: `src/features/database/__tests__/useKeyboardShortcuts.test.ts`
  - **Goal**: Simulate each bound key, assert the correct handler fires exactly once.
  - **Acceptance Criteria**: All bindings from T099 covered.
  - **Verification**: `npm run test -- useKeyboardShortcuts` passes.
  - **Dependencies**: T099

- [X] T103 **Checkpoint** — Map UI quality gate
  - **Priority**: P1/P2/P5/P8
  - **User Story**: US1, US2, US5, US8 (chrome subset)
  - **Files**: N/A
  - **Goal**: Confirm all toolbars/menus/sidebar/chrome elements coexist correctly.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T102 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T088–T102

---

## Phase 8: Search Integration

**Purpose**: Confirm existing search/navigation capabilities integrate
cleanly with the new editing/selection state.

- [X] T104 [US2] Verify "zoom to search result" alongside editing
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: N/A (verification against existing 002-search `useMapSearchIntegration`)
  - **Goal**: Confirm the existing place-search flyTo still works with an active drawing/edit/measurement tool mounted, without disrupting that tool's state (FR-016/017).
  - **Acceptance Criteria**: Searching and flying to a location does not cancel an in-progress draft or clear the current selection unexpectedly.
  - **Verification**: `quickstart.md` Section 2 (original), step 5 (search integration scenario).
  - **Dependencies**: T016, T034

- [X] T105 [US2] Highlight selected feature on the map
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: Feature-rendering layer (same as T056)
  - **Goal**: Apply a distinct visual style (e.g., outline/glow) to whichever feature(s) `databaseStore.selectedFeatureId`/`selectedFeatureIds` currently reference.
  - **Acceptance Criteria**: Selected feature(s) are visually distinguishable from unselected ones at a glance.
  - **Verification**: `quickstart.md` Section 6, step 1.
  - **Dependencies**: T056, T057, T058

- [X] T106 [US7] Zoom to imported layer after import
  - **Priority**: P7
  - **User Story**: US7
  - **Files**: `ImportExportControls.tsx`
  - **Goal**: After a successful import, automatically frame the layer's new full extent (reusing the existing "zoom to layer" capability).
  - **Acceptance Criteria**: Imported features are immediately visible in the viewport without a manual zoom action.
  - **Verification**: Manual/component test.
  - **Dependencies**: T075

- [X] T107 [US2] "Fit to data" — frame combined visible-layer extent
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: Map navigation integration point
  - **Goal**: Implement FR-016 — frame the combined extent of every currently visible layer's features, distinct from "zoom to layer" (single layer).
  - **Acceptance Criteria**: With two visible layers in different areas, "fit to data" frames both; with nothing visible/non-empty, the view is unchanged and a clear message explains why (Edge Case).
  - **Verification**: `quickstart.md` Section 2 (original), step 5 (fit-to-data scenario).
  - **Dependencies**: T048

- [X] T108 [P] [US2] Component test: zoom-to-feature/zoom-to-layer/fit-to-data
  - **Priority**: P2
  - **User Story**: US2
  - **Files**: `src/features/database/__tests__/mapNavigation.test.tsx`
  - **Goal**: Cover all three framing behaviors, including the fit-to-data empty case.
  - **Acceptance Criteria**: Each of the three navigation actions asserted independently.
  - **Verification**: `npm run test -- mapNavigation` passes.
  - **Dependencies**: T107

- [X] T109 **Checkpoint** — Search Integration quality gate
  - **Priority**: P2/P7
  - **User Story**: US2, US7
  - **Files**: N/A
  - **Goal**: Confirm search/navigation integrates cleanly with all new editing state.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T108 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T104–T108

---

## Phase 9: React Query / Zustand Integration Audit

**Purpose**: A dedicated wiring/consistency pass across every store, hook,
query key, and service this feature added — not new functionality, but
confirmation that Constitution Principle V's "single centralized place per
concept" is actually true end to end.

- [X] T110 Finalize and audit `editingStore` actions
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/store/editingStore.ts`
  - **Goal**: Confirm every action listed in `contracts/client-api.md` exists, is exported, and is used by at least one component/hook (no dead actions, no component reaching into store internals directly).
  - **Acceptance Criteria**: Code review checklist passes; no component calls `editingStore.setState` directly.
  - **Verification**: Manual/code review + existing tests still passing.
  - **Dependencies**: T011, T016–T102

- [X] T111 Finalize and audit `databaseStore` multi-select actions
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/store/databaseStore.ts`
  - **Goal**: Same audit as T110, scoped to the multi-select additions (T012).
  - **Acceptance Criteria**: No regression to pre-existing single-select actions; new actions fully wired.
  - **Verification**: `npm run test -- databaseStore` passes.
  - **Dependencies**: T012, T057, T058, T063

- [X] T112 Finalize `useFeatureEditing.ts` hook barrel
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/hooks/useFeatureEditing.ts`
  - **Goal**: Confirm `useImportFeatures`, `useExportLayer`, `useUndoLastEdit` are all exported from one coherent module, each documented with JSDoc.
  - **Acceptance Criteria**: All three importable from a single path; each has a one-line JSDoc summary.
  - **Verification**: `tsc --noEmit`; manual review.
  - **Dependencies**: T028, T075, T081

- [X] T113 Query key consistency audit
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/services/queryKeys.ts`
  - **Goal**: Confirm the new `useImportFeatures` mutation invalidates via the existing centralized `queryKeys` factory (Research Decision 11) — no inline array-literal query keys introduced anywhere in this feature's new code.
  - **Acceptance Criteria**: A repo-wide grep for inline query-key arrays in new files returns none.
  - **Verification**: Manual grep + code review.
  - **Dependencies**: T075

- [X] T114 Finalize new service modules
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `featureService.ts`, `exportLayer.ts`, `shapefileImport.ts`
  - **Goal**: Confirm each new/modified service function has a one-line JSDoc summary and contains no business logic beyond request shaping/response parsing (Constitution Principle I).
  - **Acceptance Criteria**: Code review checklist passes.
  - **Verification**: Manual review.
  - **Dependencies**: T075, T077, T080

- [X] T115 Update the `src/features/database/index.ts` public barrel
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/index.ts`
  - **Goal**: Export the new components (`ProjectExplorer`, `LayerTree`, `DrawingToolbar`, `MeasurementToolbar`, `AttributeForm`, `ImportExportControls`, `FeaturePopup`, context menus, `NorthArrow`, `RightSidebar`), hooks, and `editingStore`/updated `databaseStore` selectors that other features are expected to consume.
  - **Acceptance Criteria**: Every new component/hook intended for external use is importable from the feature's barrel.
  - **Verification**: `tsc --noEmit`.
  - **Dependencies**: T110–T114

- [X] T116 [P] Unit test: query-key/store-boundary conventions
  - **Priority**: Should-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/__tests__/architectureConventions.test.ts`
  - **Goal**: A lightweight guard test asserting the new hooks call `queryKeys.*` (not inline arrays) and that store actions are the only mutation path exercised in existing component tests.
  - **Acceptance Criteria**: Test fails if a new hook is refactored to bypass `queryKeys`.
  - **Verification**: `npm run test -- architectureConventions` passes.
  - **Dependencies**: T113

- [X] T117 **Checkpoint** — React Query/Zustand quality gate
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm state management is fully centralized and consistent across the entire feature.
  - **Acceptance Criteria**: `tsc --noEmit`, `eslint`, tests through T116 pass.
  - **Verification**: Commands run clean.
  - **Dependencies**: T110–T116

---

## Phase 10: Testing (Cross-Cutting & Integration)

**Purpose**: Full end-to-end coverage beyond each phase's own unit/
component tests — the whole feature working together.

- [ ] T118 Full accessibility audit
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting, spec FR-042)
  - **Files**: N/A (audit across all new components)
  - **Goal**: Run an automated accessibility check (e.g., axe) against every new toolbar, menu, dialog, and tree item; confirm keyboard-only operability for each.
  - **Acceptance Criteria**: Zero critical/serious violations (SC-009).
  - **Verification**: `quickstart.md` accessibility spot-checks pass.
  - **Dependencies**: T016–T117

- [ ] T119 Integration test: full US1→US8 happy-path walkthrough
  - **Priority**: Must-have
  - **User Story**: US1–US8 (all)
  - **Files**: `src/features/database/__tests__/fullWalkthrough.integration.test.ts`
  - **Goal**: One extended test against the real test database exercising: open project/layer → draw a feature → edit its geometry → measure a distance → import a small GeoJSON file → export the layer → lock the layer → multi-select and bulk-delete on a different, unlocked layer → verify keyboard shortcuts.
  - **Acceptance Criteria**: Matches the combined intent of `quickstart.md` Sections 1–12.
  - **Verification**: `npm run test -- fullWalkthrough.integration` passes or skips cleanly.
  - **Dependencies**: T033, T042, T055, T072, T087, T103, T109

- [ ] T120 API test: cross-owner security spot-check across all endpoints touched
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting, Constitution Principle VI)
  - **Files**: `src/app/api/layers/[layerId]/features/import/__tests__/import.security.test.ts`
  - **Goal**: Confirm the new import endpoint returns `404` (not `401`) for a layer owned by a different user, and `401` when no user resolves at all — consistent with the non-disclosure pattern already established in 003-database-foundation.
  - **Acceptance Criteria**: Both cases pass against the real test database.
  - **Verification**: `npm run test -- import.security` passes or skips cleanly.
  - **Dependencies**: T009

- [ ] T121 Store test: `editingStore` full action coverage
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/database/__tests__/editingStore.test.ts` (final pass)
  - **Goal**: Ensure every action added across Phases 1–9 has at least one direct assertion (not just indirect coverage via component tests).
  - **Acceptance Criteria**: 100% of `editingStore`'s exported actions referenced in this test file.
  - **Verification**: `npm run test -- editingStore` passes.
  - **Dependencies**: T030, T053

- [ ] T122 Store test: `databaseStore` multi-select full action coverage
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/database/__tests__/databaseStore.test.ts` (final pass)
  - **Goal**: Same completeness check as T121, scoped to the multi-select additions.
  - **Acceptance Criteria**: 100% of new actions referenced.
  - **Verification**: `npm run test -- databaseStore` passes.
  - **Dependencies**: T069

- [ ] T123 Component test: `AttributeForm` validation + save
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/database/__tests__/AttributeForm.test.tsx`
  - **Goal**: Cover edit/add-key/style-edit paths (T066–T068) including a rejected duplicate-key attempt.
  - **Acceptance Criteria**: All three edit paths and the rejection case pass.
  - **Verification**: `npm run test -- AttributeForm` passes.
  - **Dependencies**: T065–T068

- [ ] T124 Component test: `ImportExportControls` loading/error states
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/database/__tests__/ImportExportControls.test.tsx`
  - **Goal**: Assert `isPending`-driven loading indicators and typed-error-message rendering (T082) for both import and export.
  - **Acceptance Criteria**: Loading and error states both render correctly, never a raw stack trace.
  - **Verification**: `npm run test -- ImportExportControls` passes.
  - **Dependencies**: T073, T082

- [ ] T125 Performance test: 5,000-feature pan/zoom smoothness
  - **Priority**: Should-have
  - **User Story**: US2 (SC-002)
  - **Files**: `src/features/database/__tests__/renderPerformance.test.tsx` (or a manual profiling script if a reliable automated assertion isn't practical)
  - **Goal**: Seed/mock 5,000 features in a layer, confirm per-feature memoization (Research Decision 9 from the original plan) prevents re-rendering unchanged features on pan/zoom.
  - **Acceptance Criteria**: A pan/zoom event does not trigger a re-render of feature components whose data is unchanged (assert via render-count spy).
  - **Verification**: `npm run test -- renderPerformance` passes.
  - **Dependencies**: T056

- [ ] T126 Performance test: bulk import within budget
  - **Priority**: Should-have
  - **User Story**: US7 (SC-006/SC-007)
  - **Files**: `src/app/api/layers/[layerId]/features/import/__tests__/import.performance.test.ts`
  - **Goal**: Against the real test database, time a 1,000-feature GeoJSON import (budget: 10 s) and, separately, a 1,000-feature Shapefile import including reprojection (budget: 15 s).
  - **Acceptance Criteria**: Both complete within budget.
  - **Verification**: `npm run test -- import.performance` passes or skips cleanly.
  - **Dependencies**: T009, T078

- [ ] T127 **Checkpoint** — Testing quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Confirm the full test suite (all tiers, all phases) passes together.
  - **Acceptance Criteria**: `npm run test` reports zero failures (DB-dependent tests pass or skip cleanly, never silently "pass" when they didn't run).
  - **Verification**: `npm run test` full run.
  - **Dependencies**: T118–T126

---

## Phase 11: Polish

**Purpose**: Final cross-cutting quality pass before this feature is
considered done.

- [ ] T128 [P] Accessibility pass — keyboard operability + accessible names
  - **Priority**: Must-have
  - **User Story**: None (spec FR-042)
  - **Files**: All new components from Phases 2–8
  - **Goal**: Confirm every interactive control introduced by this feature is keyboard-operable and has an accessible name (aria-label or equivalent).
  - **Acceptance Criteria**: Matches T118's audit findings, with any remaining gaps closed.
  - **Verification**: Re-run accessibility audit; zero violations remain.
  - **Dependencies**: T118

- [ ] T129 [P] Performance pass — memoization + bundle verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Feature-rendering layer, `next.config.ts` (bundle-analyzer invocation only, no config change expected)
  - **Goal**: Confirm `React.memo` is applied where T125 identified gaps; run `ANALYZE=true npm run build` and confirm Leaflet-Geoman/Turf.js/`shapefile`/`proj4` are excluded from the initial bundle.
  - **Acceptance Criteria**: Bundle-analyzer output shows all four heavy dependencies only in dynamically-loaded chunks.
  - **Verification**: `quickstart.md` Section 1, bundle check.
  - **Dependencies**: T125

- [ ] T130 [P] JSDoc documentation pass
  - **Priority**: Should-have
  - **User Story**: None (Constitution Principle VIII)
  - **Files**: All new exported functions across `src/server/`, `src/shared/contracts/`, `src/features/database/`
  - **Goal**: Single-line JSDoc summary on every exported function/hook/component/store action added by this feature, per the same standard applied in 003-database-foundation.
  - **Acceptance Criteria**: No exported function introduced by this feature lacks a JSDoc comment.
  - **Verification**: Manual review / code-review checklist.
  - **Dependencies**: T001–T117

- [ ] T131 [P] Feature README update
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/database/README.md`
  - **Goal**: Document the new capabilities (drawing/editing/measurement/import-export/layer management/multi-select/shortcuts) and known limitations (single-step undo only, session-only lock/visibility/opacity/clipboard, multi-select scoped to one layer), extending the file 003-database-foundation started.
  - **Acceptance Criteria**: Every limitation called out explicitly, matching this plan's Assumptions.
  - **Verification**: Manual review.
  - **Dependencies**: T130

- [ ] T132 [P] Structured logging on the new import Route Handler
  - **Priority**: Should-have
  - **User Story**: None (Constitution Principle re: logging)
  - **Files**: `app/api/layers/[layerId]/features/import/route.ts`
  - **Goal**: Confirm the handler logs method/path/status/duration via the existing shared logger, consistent with every other Route Handler — no new logging mechanism.
  - **Acceptance Criteria**: A request to this endpoint produces the same structured log shape as any existing endpoint.
  - **Verification**: Manual log inspection during `quickstart.md` Section 5.
  - **Dependencies**: T009

- [ ] T133 [P] Error boundaries around new editing UI
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: Map shell/layout component
  - **Goal**: Wrap the new toolbars/panels (`DrawingToolbar`, `MeasurementToolbar`, `LayerTree`, `AttributeForm`, `ImportExportControls`) in a React error boundary so a crash in one does not blank the entire map/dashboard shell.
  - **Acceptance Criteria**: A simulated render error in one panel leaves the rest of the shell (map, other panels) functional.
  - **Verification**: Component test forcing a render error.
  - **Dependencies**: T088, T089, T092

- [ ] T134 Full `quickstart.md` run-through (all 12 sections)
  - **Priority**: Must-have (final gate)
  - **User Story**: US1–US8 (all)
  - **Files**: N/A
  - **Goal**: Execute every section of `quickstart.md` top to bottom against a fresh environment with a real database available.
  - **Acceptance Criteria**: Every item in the Success Criteria Checklist at the bottom of `quickstart.md` is checked off.
  - **Verification**: Manual run, all 12 sections pass.
  - **Dependencies**: T001–T133

- [ ] T135 Final Constitution Check re-verification
  - **Priority**: Must-have (final gate)
  - **User Story**: None
  - **Files**: `plan.md` (update the Constitution Check re-check note if anything changed during implementation)
  - **Goal**: Re-confirm all 10 principles still PASS as actually implemented, and that the two recorded spec amendments (Layer Lock, Copy/Paste/Duplicate) and the one recorded architectural note (Geoman over `react-leaflet-draw`) still accurately describe the shipped code.
  - **Acceptance Criteria**: No principle regresses from PASS to FAIL; any new deviation is fixed or added to Complexity Tracking with justification before this task is checked off.
  - **Verification**: Manual review against `.specify/memory/constitution.md` v3.0.0.
  - **Dependencies**: T134

- [ ] T136 Production readiness checklist review
  - **Priority**: Must-have (final gate)
  - **User Story**: None
  - **Files**: N/A
  - **Goal**: Walk the same enumerated gate list 003-database-foundation used (TypeScript, ESLint, tests, production build, bundle-analyzer, security headers unaffected, known limitations recorded and visible) for this feature's full scope.
  - **Acceptance Criteria**: Every item in the checklist below is checked.
  - **Verification**: All commands re-run one final time.
  - **Dependencies**: T135

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies — BLOCKS every later phase (T015 gate).
- **Phase 2 (Drawing & Editing)**: Depends on Phase 1.
- **Phase 3 (Measurements)**: Depends on Phase 1 only — independent of Phase 2 (different files, `editingStore.tool` already defined in T011).
- **Phase 4 (Layer Operations)**: Depends on Phase 1 only — independent of Phases 2–3.
- **Phase 5 (Feature Operations)**: Depends on Phase 1; T059–T061 (copy/paste/duplicate) additionally depend on Phase 2's delete/create wiring (T025) and lock enforcement (T029).
- **Phase 6 (Import/Export)**: Depends on Phase 1 only.
- **Phase 7 (Map UI)**: Depends on the components it wires from Phases 2–6 existing (T016, T034, T090's dependencies, etc.) — cannot start meaningfully until at least Phases 2, 3, 5 have their core components.
- **Phase 8 (Search Integration)**: Depends on Phase 7 (toolbars must exist to verify search coexists with them) and Phase 4 (visibility, for fit-to-data).
- **Phase 9 (React Query/Zustand Audit)**: Depends on all of Phases 1–8 existing to audit.
- **Phase 10 (Testing)**: Depends on all of Phases 1–9.
- **Phase 11 (Polish)**: Depends on Phase 10.

### Parallel Opportunities

- Once Phase 1 (T001–T015) completes, **Phases 2, 3, 4, and 6 can proceed in parallel** — they touch disjoint file sets and share only `editingStore`'s/`databaseStore`'s already-defined shapes from Phase 1.
- Within Phase 1: T001–T006 are mutually parallel; T007→T008→T009→T010 is a strict chain; T011/T012 are parallel with each other and with T007–T010.
- Within each phase, every task marked `[P]` (schema/utility unit tests, independent component tests) can run alongside the phase's non-`[P]` implementation tasks once their specific file dependencies are met.
- Phase 5's T056–T058 (selection) are parallel with Phase 4's Layer Tree work and Phase 6's import/export work.

---

## Parallel Execution Example: Phase 1 → Phases 2/3/4/6

```bash
# After Phase 1 completes (T015 checkpoint passes):
Task: "DrawingToolbar.tsx shell + Draw Point/Line/Polygon/Rectangle/Circle"   # Phase 2 (T016-T021)
Task: "MeasurementToolbar.tsx shell + distance/area/perimeter"                # Phase 3 (T034-T038)
Task: "ProjectExplorer.tsx + LayerTree.tsx + CRUD/visibility/lock/reorder"    # Phase 4 (T043-T052)
Task: "ImportExportControls.tsx + GeoJSON import/export + Shapefile parsing" # Phase 6 (T073-T081)
```

---

## Implementation Strategy

### MVP First

1. Phase 1 (Foundation) — mandatory first
2. Phase 2 (Drawing & Editing) — the core "editing" value proposition
3. **STOP and VALIDATE**: `quickstart.md` Sections 2–3 pass independently
4. This is a legitimate, demoable increment: draw/edit/undo/delete against real data, even before layer management UI, measurement, or import/export exist

### Incremental Delivery

1. Foundation (Phase 1) → foundation ready
2. Drawing & Editing (Phase 2) → demo: draw and edit features
3. Layer Operations (Phase 4) → demo: full Project Explorer/Layer Tree
4. Feature Operations (Phase 5) → demo: selection, multi-select, clipboard
5. Measurements (Phase 3) and Import/Export (Phase 6) → demo: utilities
6. Map UI (Phase 7) and Search Integration (Phase 8) → demo: full chrome
7. React Query/Zustand Audit (Phase 9), Testing (Phase 10), Polish (Phase 11) → production-ready

### Team Strategy

Given Phases 2, 3, 4, and 6 are mutually independent after Phase 1, up to
four developers can work in parallel immediately after the Phase 1
checkpoint, converging on Phase 7 (Map UI) once their respective components
exist.

---

## Production Readiness Checklist

- [ ] All 136 tasks (T001–T136) checked off
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero errors/warnings
- [ ] `npm run test` — all unit, store, hook, component, API, integration, and performance tests passing (DB-dependent tests pass or skip cleanly)
- [ ] `npm run build` — production build succeeds
- [ ] `ANALYZE=true npm run build` — Leaflet-Geoman/Turf.js/`shapefile`/`proj4` confirmed excluded from the initial bundle
- [ ] `quickstart.md` — all 12 sections pass end-to-end (T134)
- [ ] Security headers unaffected; no new external host introduced
- [ ] Constitution Check re-verified against the actual shipped code (T135)
- [ ] Known limitations recorded and visible: single-step undo only (no redo), session-only layer lock/visibility/opacity, session-only single-entry clipboard, multi-selection scoped to one layer at a time
- [ ] Two spec amendments (Layer Lock, Copy/Paste/Duplicate) and one architectural note (Geoman retained over `react-leaflet-draw`) recorded in `spec.md`/`plan.md`/`research.md`, not just in this file
- [ ] Feature README (`src/features/database/README.md`) updated (T131)
