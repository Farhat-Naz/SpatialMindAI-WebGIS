# Client Contracts: Services, Hooks, Store

**Feature**: 003-database-foundation

These are the contracts for `src/features/database/` — the client-side module
that consumes the Projects/Layers/Features API (`api-contracts.md`) and is the
foundation every later map-editing UI feature builds on. This phase delivers
the service/hook/store layer; it does not require building the eventual
project/layer/feature management screens (no implementation code is generated
by this plan — screens are a later feature's concern). Consistent with
Constitution Principle I: components (when built later) render only; hooks own
behavior; services own the only fetch path; the store owns the only mutation
path.

---

## Services (`src/features/database/services/`)

Each service function wraps exactly one Route Handler call and returns a typed
result inferred from the shared Zod contracts (Constitution Principle II) —
services contain no business logic beyond request shaping and response
parsing.

| Service function | Calls |
|---|---|
| `projectService.list()` | `GET /api/projects` |
| `projectService.create(input)` | `POST /api/projects` |
| `projectService.get(projectId)` | `GET /api/projects/:projectId` |
| `projectService.update(projectId, input)` | `PATCH /api/projects/:projectId` |
| `projectService.remove(projectId)` | `DELETE /api/projects/:projectId` |
| `layerService.list(projectId)` | `GET /api/projects/:projectId/layers` |
| `layerService.create(projectId, input)` | `POST /api/projects/:projectId/layers` |
| `layerService.rename(layerId, name)` | `PATCH /api/layers/:layerId` |
| `layerService.reorder(projectId, orderedLayerIds)` | `PATCH /api/projects/:projectId/layers/reorder` |
| `layerService.remove(layerId)` | `DELETE /api/layers/:layerId` |
| `featureService.list(layerId, params)` | `GET /api/layers/:layerId/features` |
| `featureService.create(layerId, input)` | `POST /api/layers/:layerId/features` |
| `featureService.get(featureId)` | `GET /api/features/:featureId` |
| `featureService.update(featureId, input)` | `PATCH /api/features/:featureId` |
| `featureService.remove(featureId)` | `DELETE /api/features/:featureId` |

Query keys are centralized in `src/features/database/services/queryKeys.ts`
(Constitution Principle V): `['projects']`, `['projects', projectId,
'layers']`, `['layers', layerId, 'features', params]`, etc.

---

## Hooks (`src/features/database/hooks/`)

| Hook | Data source | Responsibility |
|---|---|---|
| `useProjects()` | React Query | List the current user's projects |
| `useCreateProject()` | React Query mutation | Create + invalidate `['projects']` |
| `useUpdateProject(projectId)` | React Query mutation | Update + invalidate the project's detail and list queries |
| `useDeleteProject(projectId)` | React Query mutation | Delete + invalidate `['projects']`; also clears the project from `databaseStore` if it was selected |
| `useLayers(projectId)` | React Query | List a project's layers, ordered |
| `useCreateLayer(projectId)` | React Query mutation | Create + invalidate the project's layer list |
| `useRenameLayer(layerId)` | React Query mutation | Rename + invalidate the layer's parent layer list |
| `useReorderLayers(projectId)` | React Query mutation | Bulk reorder + invalidate the project's layer list |
| `useDeleteLayer(layerId)` | React Query mutation | Delete + invalidate the parent layer list |
| `useFeatures(layerId, params)` | React Query (paginated) | List a layer's features; `params` drives `cursor`/`bbox` |
| `useCreateFeature(layerId)` | React Query mutation | Create + invalidate the layer's feature list |
| `useUpdateFeature(featureId)` | React Query mutation | Update + invalidate the feature's detail and its layer's list |
| `useDeleteFeature(featureId)` | React Query mutation | Delete + invalidate the parent feature list |

All server data (projects/layers/features) lives exclusively in the React
Query cache — never copied into `databaseStore`, per Constitution Principle V
(State Management).

---

## Store (`src/features/database/store/databaseStore.ts`)

Zustand store for client-only UI state — no server data, no persistence this
phase (unlike `002-search`'s `recentSearches`, nothing here needs to survive a
reload):

| Field | Type | Notes |
|---|---|---|
| `selectedProjectId` | `string \| null` | Which project the user is currently viewing/editing |
| `selectedLayerId` | `string \| null` | Which layer within the selected project is active |
| `selectedFeatureId` | `string \| null` | Which feature is being edited, if any |

Actions: `selectProject(id)`, `selectLayer(id)`, `selectFeature(id)`,
`clearSelection()`. Selecting a different project clears `selectedLayerId`/
`selectedFeatureId` (they belong to the previous project's hierarchy).

---

## Barrel (`src/features/database/index.ts`)

Exports only what other features are expected to consume: the three service
objects, the hooks table above, `databaseStore`'s selector hooks, and the
shared types re-exported from `src/shared/contracts/`. Internal repository/
Route Handler code is never exported from this barrel — it is server-only and
lives outside `src/features/` entirely (Research Decision 2).
