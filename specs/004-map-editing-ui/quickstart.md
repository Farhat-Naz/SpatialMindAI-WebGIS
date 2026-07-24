# Quickstart Validation Guide: Interactive WebGIS Editing

**Feature**: 004-map-editing-ui (expanded to cover all eight approved user
stories)
**Date**: 2026-07-22

Validates this feature once `/speckit-implement` has completed its tasks.
Assumes 003-database-foundation's own quickstart already passes (a working
database, a seeded user, at least one project and layer). Sections 1–7
below validate the original (US2 subset/US3/US4/US6/US7-GeoJSON) scope;
Sections 8–12 validate the expanded scope (US1, US5, Shapefile, US8).

---

## Prerequisites

- 003-database-foundation fully implemented and its quickstart passing
- Dependencies installed, including this increment's new packages:
  `@geoman-io/leaflet-geoman-free`, `@turf/turf` (or the specific `@turf/*`
  sub-packages actually used — see `plan.md` Technical Context)
- Dev server running (`npm run dev`)

---

## 1. Build & Quality Gates (Constitution Principle X)

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Expected: zero TypeScript errors, zero ESLint warnings, all applicable test
tiers passing, production build succeeds.

```bash
ANALYZE=true npm run build
```

Expected: `leaflet-geoman` and Turf.js do **not** appear in the initial
route's shared bundle — both must show up only in a dynamically-loaded
chunk (Research Decision 1, 9).

---

## 2. Drawing (US4)

1. Open a project, select a layer, activate "Draw Point."
2. Click once on the map. **Expected**: a point feature is created and
   saved (`POST /api/layers/:layerId/features` succeeds) within ~2 seconds
   (SC-003).
3. Activate "Draw Polygon," click 3+ points, close the ring. **Expected**:
   saved and rendered.
4. Activate "Draw Rectangle," drag a box. **Expected**: saved as a 4-vertex
   `Polygon` (Research Decision 2) — confirm via `GET /api/features/:id`
   that `geometry.type === "Polygon"`.
5. Activate "Draw Circle," click a center and drag to set radius.
   **Expected**: saved as a `Polygon` approximating a circle (Research
   Decision 2) — confirm `geometry.type === "Polygon"` with ~64 vertices.
6. Start drawing a self-intersecting polygon and attempt to finish it.
   **Expected**: rejected client-side or by the existing `ST_IsValid` check,
   with a clear message; nothing saved (SC-004).
7. Start a new drawing, then press the "cancel" shortcut/button before
   finishing. **Expected**: the draft disappears, no API call was made
   (FR-027b).

---

## 3. Geometry & Attribute Editing, Delete, Undo (US3, US4)

1. Select an existing feature, enter geometry edit mode, drag a vertex.
   **Expected**: `PATCH /api/features/:id` fires with the new geometry;
   the feature's attributes/style are unchanged in the response.
2. Open the Attribute Form for a feature, edit a value, add a new key.
   **Expected**: saved via the existing `PATCH` endpoint; geometry/style
   unchanged.
3. Delete a feature. **Expected**: removed from the map and `DELETE
   /api/features/:id` returns `204`.
4. Immediately press "Undo." **Expected**: the deleted feature reappears
   (re-created via `POST`, Research Decision 4) with the same attributes/
   style it had before deletion.
5. Press "Undo" again with no new edit since. **Expected**: no-op — nothing
   happens (only one undo step is retained).

---

## 4. Measurement (US6)

1. Activate "Measure Distance," click three points on the map. **Expected**:
   a running distance total updates after each click (SC-010), computed
   without any network request (Research Decision 3).
2. Activate "Measure Area," click a polygon's points. **Expected**: an area
   total is shown.
3. Close the measurement tool. **Expected**: `GET /api/layers/:layerId/features`
   shows no new feature was created.

---

## 5. Import & Export GeoJSON (US7, GeoJSON only this increment)

```bash
curl -X POST "http://localhost:3000/api/layers/<layerId>/features/import" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "FeatureCollection",
    "features": [
      { "type": "Feature", "geometry": {"type":"Point","coordinates":[10,20]}, "properties": {"name":"A"} },
      { "type": "Feature", "geometry": {"type":"Point","coordinates":[11,21]}, "properties": {"name":"B"} }
    ]
  }'
```

Expected: `201`, `{ "importedCount": 2 }`; the layer's existing features are
unaffected (append-only, spec FR-034).

```bash
curl -X POST "http://localhost:3000/api/layers/<layerId>/features/import" \
  -H "Content-Type: application/json" \
  -d '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,1],[1,0],[0,1],[0,0]]]},"properties":{}}]}'
```

Expected: `400`, `{ "error": { "code": "INVALID_INPUT", ... } }` (the ring
self-intersects); a subsequent `GET` on the layer shows the feature count
unchanged from before this call (all-or-nothing).

In the UI: choose "Export" on a layer with several features. **Expected**: a
`.geojson` file downloads containing every feature currently in that layer
(SC-006/quickstart timing check for 1,000 features: complete within 10s for
import, and the export download itself should be near-instant since it
reuses already-cached pages where possible).

---

## 6. Selection, Hover, Popup, Zoom to Feature (US2 subset)

1. Click a feature. **Expected**: visually selected; a popup shows its
   attributes.
2. Hover a feature (no click). **Expected**: a hover highlight appears;
   no popup opens on hover alone (popups are click/keyboard-triggered only,
   FR-009).
3. With a feature selected, choose "zoom to feature." **Expected**: the map
   frames that single feature.

---

## 7. Security Spot-Check

1. As a different resolved user (swap `DEV_USER_ID`), attempt to import
   into a layer owned by the original test user.
   **Expected**: `404 NOT_FOUND` (ownership-scoped, matching every other
   endpoint's non-disclosure behavior — see 003-database-foundation
   Research Decision on `UnauthorizedError`/`NotFoundError`).
2. Attempt the same import request with a malformed JSON body.
   **Expected**: `400 INVALID_INPUT`, no partial write.

---

## 8. Project Explorer & Layer Tree (US1)

1. Open the Project Explorer. **Expected**: all of the user's projects are
   listed; selecting one opens its Layer Tree in persisted order.
2. Create, rename, and delete a layer via the Layer Tree. **Expected**:
   each reflects immediately with no full page reload (FR-006), using the
   existing 003-database-foundation endpoints.
3. Drag one layer above another. **Expected**: order persists across a
   reload (existing reorder endpoint).
4. Lock a layer, then attempt to draw/edit/delete a feature on it.
   **Expected**: blocked with a clear message; the layer remains visible
   and its features remain selectable/viewable. Unlock it — editing works
   again.

## 9. Multi-Selection & Context Menu (US5)

1. Shift-click three features (or drag a selection box over them).
   **Expected**: all three show as selected simultaneously.
2. Choose "delete selected." **Expected**: all three removed; no other
   feature affected.
3. Right-click a feature. **Expected**: a context menu appears with
   relevant actions; Escape or clicking elsewhere dismisses it with no
   side effects.

## 10. Copy, Paste, Duplicate (US4 addition)

1. Select a feature, choose "copy," then "paste." **Expected**: a new,
   independent feature appears with the same geometry/attributes/style;
   the original is unchanged.
2. Select a feature, choose "duplicate." **Expected**: a new copy appears
   in one action.
3. Delete the original feature after copying it, then paste. **Expected**:
   paste still succeeds (the clipboard is an independent snapshot).

## 11. Shapefile Import (US7 addition)

1. Import a valid `.shp`/`.dbf`/`.prj` set describing a non-WGS84
   coordinate system. **Expected**: features are reprojected to WGS84 and
   appended to the layer, positioned correctly (SC-007: within 15 s for
   1,000 features).
2. Import a Shapefile missing its `.dbf`. **Expected**: rejected client-
   side with a clear message before any network call.

## 12. Full Screen, Dark Mode, Keyboard Shortcuts (US8)

1. Toggle full screen. **Expected**: map fills the screen; toggling again
   restores the layout with no loss of position/zoom/selection.
2. Switch to dark mode. **Expected**: every panel/toolbar from this
   feature (Layer Tree, toolbars, Attribute Form, context menus) renders
   consistently with the rest of the app.
3. With a feature selected, press the documented delete shortcut.
   **Expected**: deleted exactly as if chosen from a menu. Press the copy/
   paste shortcuts, then Escape while a tool is active. **Expected**: copy/
   paste work identically to the menu actions; Escape cancels the active
   tool with no side effects.

---

## Success Criteria Checklist

- [ ] All quality gates pass (Section 1)
- [ ] `leaflet-geoman`/Turf.js confirmed absent from the initial bundle
- [ ] Point/LineString/Polygon/Rectangle/Circle all draw and save correctly,
      Rectangle/Circle confirmed stored as `Polygon` (Section 2)
- [ ] Invalid geometry rejected, draft cancel works with no API call
      (Section 2)
- [ ] Geometry edit, attribute edit, delete, and single-step undo all work
      (Section 3)
- [ ] Measurement updates live with zero network calls (Section 4)
- [ ] Bulk import succeeds and correctly rejects invalid batches
      all-or-nothing (Section 5)
- [ ] Export downloads a complete, correct GeoJSON file (Section 5)
- [ ] Selection/hover/popup/zoom-to-feature all behave per spec (Section 6)
- [ ] Cross-owner import rejected as `404`, malformed body rejected as `400`
      (Section 7)
- [ ] Project Explorer/Layer Tree CRUD, reorder, and lock all work
      (Section 8)
- [ ] Multi-select, bulk delete, and context menu all work (Section 9)
- [ ] Copy/paste/duplicate work, including after deleting the original
      (Section 10)
- [ ] Shapefile import reprojects correctly and rejects invalid sets
      (Section 11)
- [ ] Full screen, dark mode consistency, and keyboard shortcuts all work
      (Section 12)
