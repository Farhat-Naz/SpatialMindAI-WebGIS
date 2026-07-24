# Quickstart Validation Guide: Spatial Analysis & Geoprocessing

**Feature**: 005-spatial-analysis-geoprocessing
**Date**: 2026-07-23

Validates this feature once `/speckit-implement` has completed its tasks.
Assumes 003-database-foundation and 004-map-editing-ui are already
implemented and passing their own quickstarts (a working database, at least
one project with two or more layers to run overlay/join operations against).

---

## Prerequisites

- 003-database-foundation and 004-map-editing-ui fully implemented
- Dev server running (`npm run dev`), database migrated
  (`npm run test:db:up` / `prisma migrate deploy` as applicable)
- A project with at least two layers of compatible/overlapping geometry
  (e.g., a polygon layer and a point layer) to exercise two-input operations

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

---

## 2. Buffer & Proximity Analysis (US1)

1. Select a layer, run Buffer with a 500 m distance.
   **Expected**: a new layer appears in the project containing one buffered
   polygon per input feature (`api-contracts.md`'s single-run endpoint).
2. Run Near Analysis between two layers.
   **Expected**: each source feature is annotated with its nearest reference
   feature's id and distance.
3. Run Distance Matrix between two small feature sets.
   **Expected**: an exportable table of pairwise distances is produced (no
   new layer — `resultData`, per `data-model.md`).

## 3. Overlay & Set Operations (US2)

1. Run Intersect on two overlapping polygon layers.
   **Expected**: a new layer containing only the overlapping area.
2. Run Union, Difference, Clip, Dissolve, Merge, and Split once each on
   suitable inputs.
   **Expected**: each produces the layer described by its acceptance
   scenario in `spec.md` User Story 2.

## 4. Measurement & Derived Geometry (US3)

1. Request Area Calculation on a polygon layer and Length Calculation on a
   line layer.
   **Expected**: correct values in a standard unit.
2. Request Centroid, Convex Hull, and Bounding Box on a feature selection.
   **Expected**: each produces the correctly-shaped new feature described in
   `spec.md` User Story 3.

## 5. Spatial Relationship Queries (US4)

1. Run Point in Polygon with a point layer and a polygon layer.
   **Expected**: each point is annotated with its containing polygon, or
   "none."
2. Run Spatial Join with the `nearest` relationship.
   **Expected**: a new layer combining target geometry with matched source
   attributes.

## 6. Coordinate System Conversion (US5)

1. Submit a coordinate pair with a named source CRS for Coordinate
   Conversion.
   **Expected**: the converted coordinate matches a known reference point
   within source precision (SC-006).
2. Request a CRS Transformation export of an existing layer.
   **Expected**: the export reflects transformed coordinates; the layer's
   own stored geometry is unchanged (verify via `GET` on the layer's
   features before/after).

## 7. Density and Heatmap Visualization (US6)

1. Enable Heatmap over a point layer.
   **Expected**: a density-shaded overlay renders; no new layer is created
   (Research Decision 9).
2. Run Density Analysis on the same layer.
   **Expected**: a computed density result is produced and can be saved as
   a new layer.

## 8. Batch Processing (US7)

1. Select three layers and submit one Buffer batch run.
   **Expected**: three output layers are created from one submission
   (`POST /api/projects/:projectId/analysis/batch`).
2. Submit a batch where one of three inputs is geometry-incompatible with
   the chosen operation.
   **Expected**: that item reports `status: "failed"` with a specific
   reason; the other two still succeed (FR-023).

## 9. Analysis History (US8)

1. Open Analysis History after running a few analyses.
   **Expected**: every run appears with operation type, parameters,
   timestamp, and status, newest first.
2. Re-run a past entry.
   **Expected**: a new run is submitted with the exact original inputs and
   parameters; the original entry is unchanged.
3. Delete a history entry whose run produced a result layer.
   **Expected**: the entry disappears from history; the result layer still
   exists in the project, untouched.
4. Re-run a past entry whose original input layer has since been deleted.
   **Expected**: rejected with a message identifying the missing input
   layer, not a generic failure.

## 10. Ownership & Security Spot-Check

1. Attempt any analysis endpoint against a project/layer/run owned by a
   different user.
   **Expected**: `404 NOT_FOUND` (never a `401`/`403` that would reveal the
   resource exists) — matches the non-disclosure pattern already
   established in 003/004.

## Production Readiness Checklist

- [ ] All 22 operations produce results matching their `spec.md` acceptance
      scenarios
- [ ] No operation ever persists topologically invalid geometry
      (`ST_IsValid` enforced for every geometry-producing operation)
- [ ] Batch runs report per-item success/failure with zero silent failures
- [ ] Analysis History supports re-run and delete without side effects on
      result layers
- [ ] Cross-owner requests return `404`, never `401`/`403`
- [ ] `tsc --noEmit`, `eslint`, full test suite, and `next build` all pass
