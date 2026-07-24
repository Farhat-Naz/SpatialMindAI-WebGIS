# Client Contracts: Services, Hooks, Store (Spatial Analysis & Geoprocessing)

**Feature**: 005-spatial-analysis-geoprocessing

This is a **new feature module**, `src/features/analysis/`, following the
same feature-first structure `database`/`search`/`map` already use
(`components/`, `hooks/`, `services/`, `store/`, `types/`, `__tests__/`,
`index.ts`). It does not modify any existing feature's service, hook, or
store file — it consumes `database`'s public barrel (`useLayers`,
`useFeatures`, `useDatabaseStore`) for layer/feature data, never reaching
into `database`'s internals directly (Constitution Principle I).

---

## Services

### `analysisService` (new file: `src/features/analysis/services/analysisService.ts`)

| Method | Calls |
|---|---|
| `runAnalysis(projectId, input)` | `POST /api/projects/:projectId/analysis` |
| `runBatchAnalysis(projectId, input)` | `POST /api/projects/:projectId/analysis/batch` |
| `listRuns(projectId, params)` | `GET /api/projects/:projectId/analysis` |
| `getRun(runId)` | `GET /api/analysis/:runId` |
| `rerunAnalysis(runId)` | `POST /api/analysis/:runId/rerun` |
| `deleteRun(runId)` | `DELETE /api/analysis/:runId` |

All six are thin `fetch` wrappers via the same `apiFetch` helper pattern
`database`'s services already use (request shaping/response parsing only,
no business logic — Constitution Principle I).

---

## Hooks (new file: `src/features/analysis/hooks/useAnalysis.ts`)

| Hook | Data source | Responsibility |
|---|---|---|
| `useRunAnalysis(projectId)` | React Query mutation | Calls `analysisService.runAnalysis`; invalidates `queryKeys.analysisRuns(projectId)` and, when the result includes a `resultLayerId`, the `database` feature's own `queryKeys.layers(projectId)` (a new layer now exists) |
| `useRunBatchAnalysis(projectId)` | React Query mutation | Same invalidation as above, for the batch endpoint |
| `useAnalysisRuns(projectId, params)` | React Query query | Cursor-paginated Analysis History listing, mirroring `useFeatures`'s pattern exactly |
| `useAnalysisRun(runId)` | React Query query | Single run detail/status (used for polling a `pending` row's resolution, though Research Decision 7 means most runs resolve synchronously within the mutation's own response) |
| `useRerunAnalysis()` | React Query mutation | Calls `analysisService.rerunAnalysis`; invalidates the same keys as `useRunAnalysis` |
| `useDeleteAnalysisRun(projectId)` | React Query mutation | Calls `analysisService.deleteRun`; invalidates `queryKeys.analysisRuns(projectId)` only — never touches `queryKeys.layers`, since deleting a history entry must not affect its result layer (FR-026) |

**Query keys**: a new, centralized `src/features/analysis/services/queryKeys.ts`
(same per-feature factory pattern as `database`'s own `queryKeys.ts`) —
`analysisRuns(projectId, params?)`, `analysisRun(runId)`. This feature never
invalidates via an inline array literal (matching the fix already applied
to `database`'s `queryKeys.featuresList` in 004 Phase 9).

---

## Store: `analysisStore` (new file: `src/features/analysis/store/analysisStore.ts`)

A sibling to `database`'s `databaseStore`/`editingStore`, owning only
analysis-workflow-in-progress state (Research Decision 6):

| Field | Type | Notes |
|---|---|---|
| `selectedOperationType` | one of the 22 operation types, or `null` | Which operation the analysis toolbar/panel is currently configuring |
| `draftParameters` | operation-specific object, or `null` | In-progress parameter form values, before submission |
| `stagedInputLayerIds` | `string[]` | Layers picked as input for the next submission |
| `isHistoryPanelOpen` | `boolean` | Whether the Analysis History panel is visible |
| `lastError` | `string \| null` | Same "safe to display as-is" convention as `database`'s `editingStore.lastError` |

Actions: `setSelectedOperationType(type)` (clears `draftParameters` when
switching, mirroring `editingStore.setTool`'s clear-on-switch behavior),
`setDraftParameters(params)`, `stageInputLayer(layerId)` /
`unstageInputLayer(layerId)` / `clearStagedInputLayers()`,
`toggleHistoryPanel()`, `setLastError(message)` / `clearLastError()`.

This store never duplicates `database`'s `selectedProjectId`/
`selectedLayerId`/`selectedFeatureIds` (read via `useDatabaseStore` where
needed) or `editingStore`'s drawing/measurement/lock/clipboard state.
