# Client Contracts: Services, Hooks, Store (Editing Increment)

**Feature**: 004-map-editing-ui

This extends `src/features/database/` (established in
003-database-foundation) with drawing/editing/measurement/import-export
client code. It does not modify any existing service, hook, or store file
from that feature — only adds new ones, plus one new method on the existing
`featureService` object.

---

## Services

### `featureService` (existing file, one new method added)

`src/features/database/services/featureService.ts`

| New method | Calls |
|---|---|
| `importFeatureCollection(layerId, collection)` | `POST /api/layers/:layerId/features/import` — used by both GeoJSON import and Shapefile import (after client-side conversion, Research Decision 19) |

### `shapefileToGeoJson` (new file)

`src/features/database/services/shapefileImport.ts` — client-side only:
parses `.shp`/`.dbf` via the `shapefile` package, reprojects via `proj4`
using an accompanying `.prj` if present (Research Decision 19), and returns
a `FeatureCollection` ready to pass to `importFeatureCollection`. Calls no
Route Handler itself.

### `exportLayerToGeoJson` (new file)

`src/features/database/services/exportLayer.ts` — not a `fetch` wrapper
around a new endpoint (there is none, Research Decision 6); it pages through
`featureService.list(layerId, { cursor, limit })` until `nextCursor` is
`null`, assembles a GeoJSON `FeatureCollection` client-side, and triggers a
browser download (`Blob` + object URL). Pure client-side aggregation, no new
Route Handler.

---

## Hooks (new file: `src/features/database/hooks/useFeatureEditing.ts`)

| Hook | Data source | Responsibility |
|---|---|---|
| `useImportFeatures(layerId)` | React Query mutation | Calls `featureService.importFeatureCollection`; invalidates the same `['layers', layerId, 'features', ...]` key `useCreateFeature` already invalidates (Research Decision 11) |
| `useExportLayer(layerId)` | Plain async function (not a query — has no cached "result" worth keeping) | Wraps `exportLayerToGeoJson`; exposed as a hook only so it can read `layerId` from context and report loading/error state to the UI the same way a mutation would |
| `useUndoLastEdit()` | Reads `editingStore`'s `undoSnapshot`; on invoke, calls the existing `updateFeature`/`createFeature` service function matching the snapshot's `kind`, then clears the snapshot | Implements Research Decision 4; no new Route Handler — replays existing calls |

Every hook that mutates a feature (draw/edit/delete, including the ones
already defined in 003-database-foundation) is responsible for writing a
fresh `UndoSnapshot` to `editingStore` in its `onSuccess`, capturing the
*prior* state (fetched via `getFeatureById`/`useFeatures` cache before the
mutation fires) — this is a small addition to the existing
`useUpdateFeature`/`useDeleteFeature`/`useCreateFeature` hooks' `onSuccess`
callbacks, not a new hook.

---

## Store: `editingStore` (new file)

`src/features/database/store/editingStore.ts` — a sibling to the existing
`databaseStore`. This new store owns everything specific to active map
editing/drawing/measurement/lock/clipboard, per Constitution "one
centralized place per client-only concept":

| Field | Type | Notes |
|---|---|---|
| `tool` | `ActiveTool` (see `data-model.md`) | `null` when no tool is active |
| `draftGeometry` | `GeoJSONGeometry \| null` | In-progress drawing/edit, pre-save |
| `targetLayerId` / `targetFeatureId` | `string \| null` | What a draft applies to |
| `undoSnapshot` | `UndoSnapshot \| null` | See `data-model.md` |
| `measurementResult` | `{ value: number; unit: string } \| null` | Recomputed live via Turf.js while a measure tool is active |
| `importResult` | `{ status; importedCount?; errorMessage? } \| null` | Transient, shown then dismissed |
| `lockedLayerIds` | `Set<string>` | Layers currently locked (spec FR-006a) |
| `clipboard` | `{ geometry; attributes; style } \| null` | Copied feature snapshot (spec FR-027c–e) |

Actions: `setTool(tool)` (clears `draftGeometry`/`measurementResult` when
switching), `setDraftGeometry(geometry)`, `cancelDraft()` (FR-027b — clears
draft with no API call), `setUndoSnapshot(snapshot)`, `clearUndoSnapshot()`,
`setMeasurementResult(result)`, `setImportResult(result)`,
`clearImportResult()`, `lockLayer(layerId)`/`unlockLayer(layerId)`,
`copyFeature(snapshot)`.

**Selection** lives in the existing `databaseStore`, additively extended
(Research Decision 13):

| Field | Type | Notes |
|---|---|---|
| `selectedFeatureId` | `string \| null` | Existing, unchanged — single-feature focus |
| `selectedFeatureIds` | `string[]` | New — the full multi-selection set (US5) |

New actions on `databaseStore`: `toggleFeatureSelection(id)`,
`selectFeatureRange(ids)`, `clearFeatureSelection()`. Existing actions
(`selectProject`, `selectLayer`, `selectFeature`, `clearSelection`) are
unchanged and continue to pass their existing tests unmodified.
