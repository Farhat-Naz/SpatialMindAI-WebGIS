# Implementation Plan: Interactive WebGIS Editing (Full Scope)

**Branch**: `004-map-editing-ui` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-map-editing-ui/spec.md`

**Revision note**: This plan was originally scoped to a subset of the
approved spec (US2 subset/US3/US4/US6/US7-GeoJSON-only). It has been
**expanded to cover all eight approved user stories** in response to a
subsequent request for a full task list across the entire feature. Two
genuinely new capabilities requested at that point (Layer Lock,
Copy/Paste/Duplicate) were first added to `spec.md` as new requirements
(FR-006a, FR-027c–e) before being planned here — see spec.md's checklist
Notes for that amendment.

---

## Summary

This plan now covers the complete `004-map-editing-ui` spec: **US1**
(Project Explorer, Layer Tree, visibility/opacity/ordering, Layer Lock),
**US2** (viewing, selection, popup, coordinate display, scale bar, north
arrow, basemap switcher, zoom/fit navigation, search integration), **US3**
(Attribute Table/Form), **US4** (drawing, geometry editing, delete, single-
step undo, cancel, copy/paste/duplicate), **US5** (multi-selection, context
menu), **US6** (measurement), **US7** (GeoJSON and Shapefile import/
export), and **US8** (full screen, dark mode, keyboard shortcuts).

Three findings shape this plan significantly:

1. **Most of US1's data operations and three of US2's chrome elements
   already exist.** 003-database-foundation already built
   `useProjects`/`useLayers`/reorder/etc.; 001-app-foundation already built
   coordinate display (`StatusBar.tsx`), a scale bar (`MapCore.tsx`'s
   `ScaleControl`), and basemap switching (`LayerSwitcher.tsx`). This plan
   reuses all of it — the only new US1/US2 work is new UI shells
   (`ProjectExplorer`, `LayerTree`) and one new chrome element (north
   arrow).
2. **Exactly one new Route Handler is needed for the entire feature**: bulk
   feature import. Shapefile import reuses it after client-side conversion
   (Research Decision 19) rather than needing a second endpoint.
3. **Undo/redo, layer lock, and copy/paste/duplicate are all
   purely client-side.** None requires a new database column or Route
   Handler (Research Decisions 4, 20) — each is a thin layer over the
   already-existing single-feature create/update/delete API.

---

## Technical Context

**Language/Version**: TypeScript 5 (strict mode — unchanged)

**Primary Dependencies**:
- next@16, react@19/react-dom@19 (unchanged)
- `@geoman-io/leaflet-geoman-free` (drawing/editing, Research Decision 1 —
  reaffirmed over `react-leaflet-draw` for this expanded scope too, since
  Geoman's native move/edit/rectangle/circle support still covers this
  plan's needs more completely than the alternative)
- Turf.js (measurement + circle→polygon conversion, Research Decisions 2–3)
- `shapefile` (new — client-side `.shp`/`.dbf` parsing, Research Decision
  19) and `proj4` (new — `.prj`-based reprojection to WGS84, Research
  Decision 19), both dynamically imported and only loaded when a Shapefile
  import is actually invoked
- @tanstack/react-query@5, zustand@5, zod (existing — reused)
- shadcn/ui (existing — `ContextMenu`, `AlertDialog`, form primitives, drag
  handles for Layer Tree reordering)

**Storage**: No schema change. One new Route Handler
(`POST /api/layers/:layerId/features/import`) and one new repository
function (`featureRepository.importFeatures`), used by both GeoJSON and
(post-conversion) Shapefile import, inside a single transaction per import
(Research Decisions 5, 19).

**Testing**: Vitest + React Testing Library (unchanged). New Route Handler
tested against the real ephemeral PostGIS test database, skip-if-
unavailable, matching 003-database-foundation's established pattern.

**Target Platform**: Unchanged — Node.js runtime.

**Project Type**: Web application — single Next.js app. Adds one Route
Handler; all client code lives in the existing `src/features/database/`
module plus minor, additive extensions to `src/features/dashboard/` and
`src/features/map/` only where a genuinely new element (north arrow) or
integration point (keyboard shortcuts, full screen) is needed — no
existing component from those two modules is rewritten.

**Performance Goals** (from spec Success Criteria, full scope):
- New/edited feature saved within 2 s (SC-003); 5,000 features smoothly
  pannable (SC-002); Attribute Table responsive at 10,000+ features
  (SC-005); 1,000-feature GeoJSON import within 10 s (SC-006); 1,000-
  feature Shapefile import (incl. reprojection) within 15 s (SC-007);
  measurement result within 1 s (SC-010); basemap/full-screen toggle
  within 1 s with no position loss (SC-011); "fit to data" always correct
  when applicable (SC-012).

**Constraints**:
- Rectangle/Circle save as `Polygon`, never a new geometry kind (Decision 2)
- Measurement is always client-side/ephemeral (Decision 3)
- Undo is single-step, session-only, no redo (spec.md Assumptions)
- Import is append-only and all-or-nothing for both formats (spec
  FR-034/FR-035/FR-036/FR-037)
- Layer visibility/opacity/lock and the clipboard are all session-only,
  never persisted (spec Assumptions, Decision 20)
- Multi-selection is scoped to one layer at a time (spec Assumptions)

**Scale/Scope**: One new Route Handler, one new repository function, one
new Zod schema (`geoJsonImport.schema.ts`), two new client-side-only
service modules (`exportLayer.ts`, `shapefileImport.ts`), one new store
(`editingStore.ts`), one additive extension to the existing
`databaseStore`, and roughly a dozen new UI components — all within
`src/server/`, `src/shared/contracts/`, and `src/features/database/`
(plus the two minor cross-feature integration points noted above). No
existing Route Handler, repository function, or hook is modified in a
breaking way.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design —
see bottom of this section.*

| Principle | Check | Notes |
|---|---|---|
| I. Architecture (Feature-First) | ✅ PASS | All new client code lives in `src/features/database/` (plus two minor, additive cross-feature touchpoints); the one new Route Handler lives under `app/api/`; only the existing `featureRepository.ts` gains a new function — no new file imports `@prisma/client` |
| II. Type Safety | ✅ PASS | New `importFeatureCollectionSchema` shares the existing `geometrySchema`; no `any` introduced |
| III. Database | ✅ PASS | No schema change across the entire expanded scope — Layer Lock/clipboard/multi-select are all client-only by deliberate design (Decision 20), not an oversight |
| IV. GIS Principles | ✅ PASS | All persisted geometry (drawn, edited, or imported from either format) is validated via PostGIS `ST_IsValid`; Rectangle/Circle remain UI affordances producing `Polygon`; measurement remains the constitutionally-sanctioned client-side "temporary UI feedback" case; Shapefile reprojection to WGS84 happens client-side *before* the API boundary, so the server still only ever receives/stores WGS84 geometry, preserving the platform's fixed-SRID guarantee |
| V. Performance | ✅ PASS | Leaflet-Geoman, Turf.js, `shapefile`, and `proj4` are all dynamically imported, never in the initial bundle; memoized per-feature rendering; Layer Tree reordering uses no new heavy dependency (Decision 12) |
| VI. Security | ✅ PASS | The one new Route Handler follows the identical `getCurrentUser` → ownership-scoped repository call → `handleRouteError` pattern as every existing endpoint; every purely-client-side capability (undo, copy/paste/duplicate, lock, multi-select) still ultimately calls the existing, already-secured single-feature API for any actual mutation |
| VII. Testing | ✅ PASS | Unit/hook/API/integration tiers cover every new capability; accessibility checks extended to the new Layer Tree, context menu, and toolbars |
| VIII. Documentation | ✅ PASS | spec→plan→(tasks→implementation→tests→docs) lifecycle in progress; JSDoc required on all new exported functions |
| IX. Git Workflow | ✅ PASS (process) | Standard workflow applies |
| X. Quality Gates | ✅ PASS | TypeScript, ESLint, tests, `next build` (incl. bundle-analyzer check for the four new dependencies) all gate merge |

**No violations.**

**Re-check after Phase 1 design**: Confirmed still PASS. `data-model.md`
and `contracts/` confirm the expanded scope still introduces zero new
persisted entities and exactly one new Route Handler.

---

## Project Structure

### Documentation (this feature)

```text
specs/004-map-editing-ui/
├── spec.md               # Approved, amended (FR-006a, FR-027c-e added)
├── plan.md                # This file (expanded)
├── research.md            # Phase 0 output (20 decisions)
├── data-model.md           # Phase 1 output
├── quickstart.md           # Phase 1 output
├── contracts/
│   ├── api-contracts.md
│   ├── repository-api.md
│   └── client-api.md
├── checklists/
│   └── requirements.md
└── tasks.md               # Generated by /speckit-tasks (NOT this command)
```

### Source Code (repository root) — additions only

```text
src/
├── server/
│   └── repositories/
│       └── featureRepository.ts        # MODIFIED: + importFeatures()
│
├── shared/
│   └── contracts/
│       └── geoJsonImport.schema.ts     # NEW
│
└── features/
    └── database/
        ├── components/
        │   ├── ProjectExplorer.tsx     # NEW (US1)
        │   ├── LayerTree.tsx           # NEW (US1) — visibility/opacity/lock/reorder/CRUD
        │   ├── LayerTreeItem.tsx       # NEW (US1)
        │   ├── DrawingToolbar.tsx      # NEW (US4)
        │   ├── MeasurementToolbar.tsx  # NEW (US6)
        │   ├── AttributeForm.tsx       # NEW (US3)
        │   ├── ImportExportControls.tsx # NEW (US7)
        │   ├── FeaturePopup.tsx        # NEW (US2)
        │   ├── FeatureContextMenu.tsx  # NEW (US5)
        │   ├── LayerContextMenu.tsx    # NEW (US5)
        │   ├── SelectionBox.tsx        # NEW (US5) — box/drag-select overlay
        │   └── NorthArrow.tsx          # NEW (US2) — the one genuinely new chrome element
        ├── hooks/
        │   ├── useFeatureEditing.ts    # NEW: useImportFeatures, useExportLayer, useUndoLastEdit
        │   ├── useKeyboardShortcuts.ts # NEW (US8)
        │   └── useFullscreen.ts        # NEW (US8)
        ├── services/
        │   ├── featureService.ts       # MODIFIED: + importFeatureCollection
        │   ├── exportLayer.ts          # NEW
        │   └── shapefileImport.ts      # NEW (US7)
        ├── store/
        │   ├── databaseStore.ts        # MODIFIED: + selectedFeatureIds, selection actions
        │   └── editingStore.ts         # NEW: tool/draft/undo/measurement/import/lock/clipboard
        ├── types/
        │   └── database.types.ts       # MODIFIED: + re-exports for new schema types
        └── __tests__/                  # new tests co-located, per existing convention

app/
└── api/
    └── layers/
        └── [layerId]/
            └── features/
                └── import/
                    └── route.ts         # NEW: POST bulk import (GeoJSON + Shapefile-as-GeoJSON)
```

**Structure Decision**: Unchanged from the original narrower plan — every
addition slots into the existing `src/features/database/` module and
`src/server/` layer. The expanded scope adds more files within that same
structure; it does not introduce a new top-level module.

---

## 1. Project Explorer & Layer Tree (US1)

`ProjectExplorer.tsx` and `LayerTree.tsx`/`LayerTreeItem.tsx` are pure UI
over the fully-existing `useProjects`/`useLayers`/`useCreateLayer`/
`useRenameLayer`/`useReorderLayers`/`useDeleteLayer` hooks (Decision 12).
`LayerTreeItem.tsx` adds three purely client-side, session-only controls
per layer: visibility toggle, opacity slider, and lock toggle (spec
FR-003/FR-004/FR-006a) — all three read/write `editingStore`'s new
`lockedLayerIds` (lock) or a similar per-layer visibility/opacity map
(also `editingStore`, session-only, mirroring the lock field's shape).
Reordering is native drag-and-drop calling the existing
`useReorderLayers` mutation on drop — no new drag-and-drop library
(Decision 12).

## 2. Viewing, Navigation & Map Chrome (US2)

Rendering, selection, and zoom-to-feature/zoom-to-layer/fit-to-data reuse
the existing feature-rendering and map-fitting logic established for
003-database-foundation's data. **Coordinate display, scale bar, and
basemap switching require zero new code** (Decision 15) — `StatusBar.tsx`,
`MapCore.tsx`'s `ScaleControl`, and `LayerSwitcher.tsx` are reused exactly
as they already exist. The **one new element**, `NorthArrow.tsx`, is a
static overlay icon (Decision 16). `FeaturePopup.tsx` is new, triggered on
click/keyboard-select (never hover-only, FR-009), reading already-cached
React Query feature data. The existing 002-search place-search control
requires no changes to keep working alongside this feature (FR-016/017).

## 3. Attribute Management (US3)

`AttributeForm.tsx` is a dynamic key/value list editor (shadcn form
primitives) validated client-side against the existing
`updateFeatureSchema`'s `attributes` shape (Decision 7) before calling the
existing `useUpdateFeature`. No new validation schema for attributes.

## 4. Drawing, Geometry Editing, Undo, Copy/Paste/Duplicate (US4)

`DrawingToolbar.tsx` exposes Point/LineString/Polygon/Rectangle/Circle via
Leaflet-Geoman (Decision 1); Rectangle/Circle normalize to `Polygon` before
save (Decision 2). Move/edit-vertices use Geoman's edit mode, calling the
existing `useUpdateFeature`. Delete uses the existing `useDeleteFeature`.
**Undo** (`useUndoLastEdit`, Decision 4) replays the inverse of the single
most recent mutation via existing create/update/delete calls. **Cancel**
clears the in-progress draft with no API call (FR-027b). **Copy/Paste/
Duplicate** (Decision 20) read/write `editingStore.clipboard` and call the
existing `useCreateFeature` for Paste/Duplicate — no new create pathway.
Every one of these actions is blocked client-side, with a clear message,
if the target layer is in `editingStore.lockedLayerIds` (FR-006a).

## 5. Multi-Selection & Context Menu (US5)

`databaseStore` gains `selectedFeatureIds: string[]` additively (Decision
13) — `selectedFeatureId` is untouched, kept in sync as "most recently
selected." `SelectionBox.tsx` implements drag/box-select by intersecting
the drawn box with each rendered feature's Leaflet layer bounds.
`FeatureContextMenu.tsx`/`LayerContextMenu.tsx` use shadcn/ui's
`ContextMenu` primitive (Decision 14) for right-click actions scoped to
the target (feature: delete/zoom-to/edit/copy/duplicate; layer:
rename/lock/delete/zoom-to-layer), dismissible via Escape or click-away
with no side effects.

## 6. Measurement (US6)

`MeasurementToolbar.tsx` activates measure-distance/measure-area tools;
`turf.length`/`turf.area` recompute `editingStore.measurementResult` on
every vertex addition (Decision 3) — no Route Handler involved, ever.

## 7. Import & Export (US7)

**Import**: `POST /api/layers/:layerId/features/import` (Decision 5),
Zod-validated, transactional, all-or-nothing. **GeoJSON** files are
submitted directly. **Shapefiles** are parsed and reprojected entirely
client-side (`shapefile` + `proj4`, Decision 19) into the same
`FeatureCollection` shape, then submitted to the *same* endpoint — no
second Route Handler. Both share append-only, all-or-nothing behavior
(spec FR-034–037). **Export**: no new endpoint (Decision 6) —
`exportLayer.ts` pages through the existing listing endpoint and triggers
a download.

## 8. UI (Toolbars, Menus, Dialogs, States)

Editing/Measurement toolbars, Import/Export controls, Layer Tree, context
menus, and the Attribute Form all use shadcn/ui primitives exclusively.
Loading states use React Query's standard `isPending` directly; error
states render the existing typed `{ error: { code, message } }` shape's
`message` in an `Alert`/toast, never a raw stack trace; delete and
large-file import use `AlertDialog` confirmation.

## 9. Performance

Memoized per-feature map layers (keyed by id + `updatedAt`); Attribute
Table row virtualization (later increment's concern, but the data layer
here must not preclude it — confirmed it doesn't, since features are
fetched via the existing paginated endpoint); Leaflet-Geoman, Turf.js,
`shapefile`, and `proj4` all dynamically imported and confirmed absent
from the initial bundle (quickstart.md); bulk import as one transaction/
one round trip regardless of format.

## 10. Security

Every new capability — including the four that are "just client state"
(undo, copy/paste/duplicate, lock, multi-select) — ultimately funnels any
actual data mutation through the existing, already-ownership-scoped
single-feature create/update/delete API or the one new equally-scoped
import endpoint. No new authorization mechanism is introduced anywhere in
the expanded scope (Decision 8, reaffirmed for Decision 20's additions).
The new import Route Handler validates its full request body with Zod
before any repository call, exactly like every existing Route Handler; the
existing `features:write` rate-limit bucket applies to it unchanged.

---

## Testing Strategy

| Tier | Coverage |
|---|---|
| **Unit** | `geoJsonImport.schema.ts`; `editingStore` actions (tool switching, lock, clipboard, undo-snapshot); `databaseStore`'s new multi-select actions (existing single-select actions/tests untouched); Rectangle/Circle→Polygon helpers; Shapefile→GeoJSON conversion helper (mocked `shapefile`/`proj4` output) |
| **Hook** | `useImportFeatures`, `useUndoLastEdit`, `useExportLayer` against mocked services |
| **API** | New import Route Handler against the real test database (success, partial-invalid-batch rejection, cross-owner 404, malformed-body 400) |
| **Component** | `LayerTree`/`LayerTreeItem` (visibility/opacity/lock/reorder/CRUD), `ProjectExplorer`, `FeatureContextMenu`/`LayerContextMenu`, `AttributeForm`, toolbars |
| **Integration** | Draw → edit → undo → delete; copy → paste → verify independence; import (GeoJSON and Shapefile) → verify append-only → export → verify completeness; multi-select → bulk delete |
| **Accessibility** | Every new toolbar/menu/dialog/tree item checked against WCAG 2.2 AA; keyboard-shortcut coverage for delete/escape/undo/copy/paste |

---

## Development Phases (for `/speckit-tasks`)

**Phase 1 — Setup**: Install `@geoman-io/leaflet-geoman-free`, Turf.js,
`shapefile`, `proj4`; scaffold `editingStore.ts`; scaffold
`geoJsonImport.schema.ts`; extend `databaseStore.ts` additively.

**Phase 2 — Foundational**: `featureRepository.importFeatures` + the new
Route Handler; Rectangle/Circle→Polygon helpers; undo-snapshot wiring
added to existing create/update/delete hooks' `onSuccess`; Shapefile→
GeoJSON conversion helper.

**Phase 3 — Project Explorer & Layer Tree**: `ProjectExplorer.tsx`,
`LayerTree.tsx`, `LayerTreeItem.tsx` (visibility/opacity/lock/reorder/CRUD,
all over existing hooks).

**Phase 4 — Drawing & Geometry Editing**: `DrawingToolbar.tsx`, Geoman
integration, cancel, undo replay, copy/paste/duplicate, lock enforcement.

**Phase 5 — Attributes, Popup & Selection**: `AttributeForm.tsx`,
`FeaturePopup.tsx`, `NorthArrow.tsx`, zoom-to-feature/layer/fit-to-data.

**Phase 6 — Multi-Selection & Context Menu**: `databaseStore` extension,
`SelectionBox.tsx`, `FeatureContextMenu.tsx`, `LayerContextMenu.tsx`.

**Phase 7 — Measurement**: `MeasurementToolbar.tsx`, live Turf.js wiring.

**Phase 8 — Import/Export**: `ImportExportControls.tsx`,
`useImportFeatures`, `shapefileImport.ts`, `exportLayer.ts`, confirmation
dialogs.

**Phase 9 — Chrome & Accessibility**: `useKeyboardShortcuts.ts`,
`useFullscreen.ts`, dark-mode consistency pass across every new component.

**Phase 10 — Polish**: loading/error state pass, accessibility audit,
bundle-analyzer verification, quickstart.md full run-through, Constitution
Check re-verification.

Phases 3–8 are largely parallelizable once Phase 2 lands, since they touch
disjoint file sets and share only `editingStore`'s/`databaseStore`'s
already-defined shapes; Phase 9 depends on components existing from
Phases 3–8 to wire shortcuts/fullscreen/theme-consistency against.

---

## Quality Gates

- **TypeScript**: `tsc --noEmit` — zero errors
- **ESLint**: `eslint src --max-warnings 0` — zero errors/warnings
- **Vitest**: all applicable tiers above passing
- **Production build**: `next build` succeeds; `ANALYZE=true npm run build`
  confirms Leaflet-Geoman/Turf.js/`shapefile`/`proj4` are excluded from the
  initial bundle

---

## Complexity Tracking

*No Constitution violations.* Two spec amendments were made to support
this expanded plan (recorded in `spec.md`, not hidden here): Layer Lock
(FR-006a) and Copy/Paste/Duplicate (FR-027c–e) were added as new
requirements before being planned, since they were requested at the task-
list stage without prior spec approval.
