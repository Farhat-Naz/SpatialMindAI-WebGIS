# Client Contracts: Services, Hooks, Store (Spatial Analysis Toolset)

**Feature**: 007-spatial-analysis

This extends the existing `src/features/analysis/` module (005 left it as
an empty shell — `index.ts` + `types/` only) rather than creating a second
analysis module, per Constitution Principle I and "reuse existing
architecture." It consumes `database`'s public barrel for layer/feature
data exactly as 005's contract already specified, and additionally
consumes `map`'s public barrel (for the Measure tool's Leaflet/Leaflet-
Geoman draw interactions) and 006-collaboration's public barrel (for the
current user's role, to conditionally disable write actions client-side —
enforcement itself always stays server-side per Constitution Principle VI).

---

## Services (`src/features/analysis/services/`)

### `analysisService.ts` (extended)

| Method | Calls | New in 007? |
|---|---|---|
| `runAnalysis(projectId, input)` | `POST /api/projects/:projectId/analysis` | modified (now may return `queued`/`running`) |
| `runBatchAnalysis(projectId, input)` | `POST /api/projects/:projectId/analysis/batch` | unchanged |
| `listRuns(projectId, params)` | `GET /api/projects/:projectId/analysis` | modified (`status` filter param) |
| `getRun(runId)` | `GET /api/analysis/:runId` | modified (extended fields) |
| `cancelAnalysis(runId)` | `POST /api/analysis/:runId/cancel` | **new** |
| `discardResult(runId)` | `POST /api/analysis/:runId/discard-result` | **new** |
| `rerunAnalysis(runId)` | `POST /api/analysis/:runId/rerun` | unchanged |
| `deleteRun(runId)` | `DELETE /api/analysis/:runId` | unchanged |
| `listPresets(projectId)` | `GET /api/projects/:projectId/analysis/presets` | **new** |
| `savePreset(projectId, input)` | `POST /api/projects/:projectId/analysis/presets` | **new** |
| `deletePreset(presetId)` | `DELETE /api/analysis/presets/:presetId` | **new** |
| `saveMeasurement(projectId, input)` | `POST /api/projects/:projectId/measurements` | **new** |
| `listMeasurements(projectId, params)` | `GET /api/projects/:projectId/measurements` | **new** |
| `deleteMeasurement(measurementId)` | `DELETE /api/measurements/:measurementId` | **new** |
| `logExport(projectId, input)` | `POST /api/projects/:projectId/exports` | **new** |
| `listExports(projectId, params)` | `GET /api/projects/:projectId/exports` | **new** |

All remain thin `apiFetch` wrappers — no business logic (Constitution
Principle I).

### `exportService.ts` (new file)

Client-side export execution — the actual work Decision 10 (revised)
describes. Not a thin API wrapper; this is the one service in the feature
permitted non-trivial logic because the export computation itself happens
here, not on the server.

| Method | Behavior |
|---|---|
| `exportLayerAsGeoJson(layerId)` | Reused unchanged from `database/services/exportLayer.ts` (imported, not duplicated) |
| `exportLayerAsCsv(layerId)` | Pages through the same Features API; flattens `attributes` to columns |
| `exportLayerAsKml(layerId)` | Pages through the same Features API; serializes via a small local GeoJSON→KML function |
| `exportLayerAsShapefile(layerId)` | Pages through the same Features API; zips via the new Shapefile-writer dependency (research.md Decision 10) |
| `exportAnalysisResult(run, format)` | Dispatches to one of the above using `run.resultLayerId`, or directly serializes `run.resultData` when there is no result layer |

Each method reports progress via an `onProgress(pagesLoaded, totalPages)`
callback consumed by the Result Panel's export progress UI, and calls
`analysisService.logExport(...)` on completion/failure.

### `measurementService.ts` (new file)

Wraps live, client-side measurement math for the interactive Measure tools
(distance/area/perimeter/radius/bearing/azimuth/coordinates) using Turf.js,
consistent with Constitution Principle IV's transient-UI-feedback carve-out.
This is the one place in the feature that computes geometry math in
JavaScript — its output is display-only until `analysisService.saveMeasurement`
sends the geometry to the server for authoritative recomputation
(research.md Decision 8).

---

## Hooks (`src/features/analysis/hooks/`)

### `useAnalysis.ts` (extended)

| Hook | Notes |
|---|---|
| `useRunAnalysis(projectId)` | Mutation; invalidates `queryKeys.analysisRuns(projectId)` + `database`'s `queryKeys.layers(projectId)` when a `resultLayerId` is present, unchanged from 005 |
| `useAnalysisRuns(projectId, params)` | Query; unchanged shape, now supports `status` filter |
| `useAnalysisRun(runId, options?)` | **modified**: accepts `{ poll?: boolean }`; when `poll` is true and the last-known `status` is `"queued"`/`"running"`, sets React Query's `refetchInterval` (e.g. 1500ms), automatically stopping once a terminal status is observed — this is the Progress Dialog's data source |
| `useCancelAnalysis()` | **new** mutation; calls `cancelAnalysis`, invalidates the run's query key |
| `useDiscardAnalysisResult(projectId)` | **new** mutation; calls `discardResult`, invalidates both `analysisRuns(projectId)` and `layers(projectId)` |
| `useRerunAnalysis()` | unchanged |
| `useDeleteAnalysisRun(projectId)` | unchanged |

### `useAnalysisPresets.ts` (new)

`usePresets(projectId, operationType?)` (query), `useSavePreset(projectId)`
/ `useDeletePreset(projectId)` (mutations) — same query-key-factory,
invalidate-on-mutate shape as every other hook in this feature.

### `useMeasurements.ts` (new)

`useMeasurementHistory(projectId, params)` (query, cursor-paginated),
`useSaveMeasurement(projectId)` / `useDeleteMeasurement(projectId)`
(mutations).

### `useExportHistory.ts` (new)

`useExportHistory(projectId, params)` (query), `useExportResult()`
(mutation-shaped wrapper around `exportService`'s methods — client
execution, not a network mutation in the React Query sense, but modeled
as one so the Result Panel gets consistent `isPending`/`onSuccess`/
`onError` semantics).

### `useAnalysisPanel.ts` (new)

Thin selector hooks over `analysisPanelStore` (below) for the dockable
panel's open/dock/size state, kept separate from data-fetching hooks per
Constitution Principle I's "components don't reach into store internals"
— all consumers go through named hooks, never `useAnalysisPanelStore()`
directly with a raw selector inline.

**Query keys**: `src/features/analysis/services/queryKeys.ts` (existing
file from 005, extended) — adds `analysisPresets(projectId)`,
`measurementHistory(projectId, params?)`, `exportHistory(projectId, params?)`
factories, following the same centralized, no-inline-literal convention
005 already established.

---

## Stores (`src/features/analysis/store/`)

### `analysisStore.ts` (extended from 005's empty shell)

Same fields 005's contract already specified
(`selectedOperationType`, `draftParameters`, `stagedInputLayerIds`,
`isHistoryPanelOpen`, `lastError`), plus:

| Field | Type | Notes |
|---|---|---|
| `selectedPresetId` | `string \| null` | Currently applied preset, if any; clearing `draftParameters` manually clears this too |
| `activeRunId` | `string \| null` | The run currently shown in the Progress Dialog/Result Panel |
| `spatialQueryPredicate` | one of the predicate enum values, or `null` | US2's in-progress "Select by Location" configuration |
| `measurementDraft` | `{ type, points: LatLng[] } \| null` | The Measure tool's in-progress live reading (feeds `measurementService`) |

### `analysisPanelStore.ts` (new — dockable workspace UI state, US10)

Deliberately separate from `analysisStore` (which owns *analysis
configuration*): this store owns only *panel chrome*, matching
`dashboard`'s existing `useSidebar` precedent for panel-open state rather
than mixing UI-shell concerns into a feature's data-configuration store.

| Field | Type | Notes |
|---|---|---|
| `isPanelOpen` | `boolean` | |
| `dockPosition` | `"left" \| "right" \| "floating"` | Mirrors the existing `RightSidebar` dock slot as the default (`"right"`) |
| `panelWidth` | `number` | Persisted resize state |
| `activeTab` | `"toolbox" \| "result" \| "history" \| "properties"` | Which sub-panel is focused |
| `selectedHistoryRunId` | `string \| null` | Drives the Property Panel when a history row is selected |

Actions: `openPanel()` / `closePanel()` / `togglePanel()`,
`setDockPosition(pos)`, `setPanelWidth(px)`, `setActiveTab(tab)`,
`selectHistoryRun(runId)`.

---

## Component hierarchy (`src/features/analysis/components/`)

```text
AnalysisPanel                     # dockable shell (US10); mounted once from DashboardLayout,
├── AnalysisToolbox               #   alongside the existing RightSidebar slot
│   └── ToolCategoryGroup × N     # Buffer / Query / Measurement / Overlay / Geometry / Statistics / Raster
├── OperationConfigForm           # per-operationType Zod-schema-driven form (parameters)
├── ProgressDialog                # subscribes to useAnalysisRun(id, { poll: true })
├── ResultPanel                   # shows resultLayerId/resultData; Add to Project / Export / Discard actions
├── PropertyPanel                 # full parameter/status detail for one run
├── AnalysisSummary                # aggregate view (counts by status/operationType) over the current listing
├── HistoryPanel                  # useAnalysisRuns list + re-run/delete actions
├── PresetPicker                  # used inside OperationConfigForm
└── MeasureToolbar                # map-overlay control activating measurementService live readouts
```

Every component is presentational (Constitution Principle I) — data
fetching lives in the hooks above, mutation/business logic in the
services above.
