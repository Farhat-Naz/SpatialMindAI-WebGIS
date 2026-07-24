# API Contracts: Spatial Analysis & Geoprocessing

**Feature**: 005-spatial-analysis-geoprocessing

This feature introduces **five new Route Handlers**, all under one resource
family (`/api/projects/:projectId/analysis` and `/api/analysis/:runId`),
per Research Decision 3. No existing Route Handler from
003-database-foundation or 004-map-editing-ui is modified. Authentication
(`getCurrentUser`), write rate limiting (`assertWriteRateLimit`), and error
mapping (`handleRouteError`/`toErrorResponse`) are reused exactly as-is from
`src/server/auth/`, `src/server/http/`, and `src/shared/errors/apiError.ts`.

---

## New: `POST /api/projects/:projectId/analysis`

Submits a single Analysis Run.

**Consumed by**: `src/features/analysis/services/analysisService.ts`'s
`runAnalysis` method

### Request

The body is a Zod discriminated union keyed by `operationType`. Every
variant shares this envelope:

| Field | Type | Required | Constraint |
|---|---|---|---|
| `operationType` | string (enum, see table below) | Yes | One of the 22 supported operation types |
| `inputLayerIds` | string array | Yes | 1 or 2 entries depending on the operation (see table below); each must belong to a layer owned by the resolved user |
| `parameters` | object | Depends | Shape varies by `operationType` (see table below); omitted entirely for operations that take none |

**Per-operation `inputLayerIds` count and `parameters` shape**:

| `operationType` | Inputs | `parameters` |
|---|---|---|
| `buffer` | 1 | `{ distance: number, unit: "meters" \| "kilometers" \| "feet" \| "miles" }` |
| `intersect` | 2 | — |
| `union` | 2 | — |
| `difference` | 2 | — |
| `clip` | 2 (`target`, `clipBoundary`) | — |
| `dissolve` | 1 | `{ attributeKey: string }` |
| `merge` | 2+ | — |
| `split` | 2 (`target`, `blade`) | — |
| `spatialJoin` | 2 (`target`, `source`) | `{ relationship: "intersects" \| "within" \| "contains" \| "nearest" }` |
| `pointInPolygon` | 2 (`points`, `polygons`) | — |
| `nearAnalysis` | 2 (`source`, `reference`) | `{ maxDistance?: number, unit?: "meters" \| "kilometers" }` |
| `distanceMatrix` | 2 | `{ unit: "meters" \| "kilometers" }` |
| `areaCalculation` | 1 | — |
| `lengthCalculation` | 1 | — |
| `centroid` | 1 | — |
| `convexHull` | 1 | — |
| `boundingBox` | 1 | — |
| `densityAnalysis` | 1 | `{ cellSize: number, unit: "meters" \| "kilometers" }` |
| `coordinateConversion` | 0 (raw coordinates, not a layer) | `{ coordinates: [number, number][], sourceCrs: string }` |
| `crsTransformation` | 1 | `{ targetCrs: string }` |

(Heatmap has no Route Handler — it is client-side-only per Research
Decision 9, and is not part of this contract.)

### Response — 201 Created

```
{
  "run": {
    "id": string,
    "projectId": string,
    "operationType": string,
    "status": "succeeded" | "failed",
    "parameters": object,
    "inputLayerIds": string[],
    "resultLayerId": string | null,
    "resultData": object | null,
    "errorMessage": string | null,
    "batchId": null,
    "createdAt": string,
    "updatedAt": string
  }
}
```

A run that fails validation *after* being accepted for processing (e.g., the
operation would produce invalid topology) still returns `201` with
`status: "failed"` and `errorMessage` populated — the submission itself
succeeded; the analysis did not. A run rejected *before* processing (bad
input, missing layer, oversized input) never creates a row at all and
returns a `4xx` error response instead (see Error table below).

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed body, unrecognized `operationType`, wrong input count for the operation, empty input layer, geometry-type mismatch the operation cannot process, or input exceeding the operation's size cap (Research Decision 7) |
| 404 | `NOT_FOUND` | Any `inputLayerIds` entry does not exist or does not belong to the resolved user |
| 401 | `UNAUTHORIZED` | No resolvable user |
| 429 | `RATE_LIMITED` | Write rate limit exceeded (`analysis:write` bucket) |
| 500 | `DATABASE_ERROR` | Unexpected failure |

---

## New: `POST /api/projects/:projectId/analysis/batch`

Submits a Batch Run: one operation type and one parameter set applied
independently across multiple input sets.

### Request

| Field | Type | Required | Constraint |
|---|---|---|---|
| `operationType` | string (enum) | Yes | Same 22 values as above |
| `parameters` | object | Depends | Same per-operation shape as above, shared across every item |
| `items` | array of `{ inputLayerIds: string[] }` | Yes | 1–20 items; each validated independently against the operation's input-count rule |

### Response — 201 Created

```
{
  "batchId": string,
  "runs": [ /* one run object per item, same shape as the single-run response above */ ]
}
```

Each item's outcome is independent (FR-023): one invalid item is reported
with `status: "failed"` and a specific `errorMessage` inside its own run
object, while every valid item still completes and returns `"succeeded"`.
The endpoint itself only returns a non-`201` error response if the batch
request shape itself is malformed (e.g., zero items) — never because one
item among many failed.

### Response — Error

Same table as the single-run endpoint above, plus:

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | `items` is empty or exceeds the 20-item cap |

---

## New: `GET /api/projects/:projectId/analysis`

Lists Analysis History for a project (FR-024), newest first.

### Request (query params)

| Field | Type | Required | Constraint |
|---|---|---|---|
| `cursor` | string | No | Keyset pagination cursor, same convention as `GET /api/layers/:layerId/features` |
| `limit` | number | No | Default/max mirror the existing feature-listing endpoint |
| `batchId` | string | No | Scope the listing to one Batch Run's member runs |

### Response — 200 OK

```
{
  "runs": [ /* run objects, newest createdAt first */ ],
  "nextCursor": string | null
}
```

---

## New: `GET /api/analysis/:runId`

Fetches one Analysis Run's current detail/status.

### Response — 200 OK

Same single run object shape as the submission endpoints.

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | The run does not exist or does not belong to the resolved user (via its project) |
| 401 | `UNAUTHORIZED` | No resolvable user |

---

## New: `POST /api/analysis/:runId/rerun`

Re-runs a past analysis with its original inputs and parameters (FR-025).

### Response — 201 Created

A new run object (new `id`, `createdAt`), with the same
`operationType`/`parameters`/`inputLayerIds` as the original — the original
row is untouched.

### Response — Error

Same as `POST /api/projects/:projectId/analysis`, plus:

| HTTP Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | The original run does not exist / isn't owned by the user, **or** any of its original input layers has since been deleted (spec.md Edge Cases — rejected with a message identifying the missing input) |

---

## New: `DELETE /api/analysis/:runId`

Deletes an Analysis History entry (FR-026). Does not delete or affect
`resultLayerId`'s layer.

### Response — 204 No Content

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 404 | `NOT_FOUND` | The run does not exist or does not belong to the resolved user |
| 401 | `UNAUTHORIZED` | No resolvable user |
| 429 | `RATE_LIMITED` | Write rate limit exceeded |

---

## Reused (unchanged) from 003-database-foundation / 004-map-editing-ui

| Endpoint | Used by this feature for |
|---|---|
| `GET /api/projects/:projectId/layers` | Populating the input-layer picker for every operation |
| `POST /api/layers/:layerId/features` (single) / `.../features/import` (bulk) | How a successful geometry-producing operation's result layer is populated — `analysisRepository.ts` inserts result features the same way `importFeatures` does, inside its own transaction, not by calling this Route Handler internally |
| `GET /api/layers/:layerId/features` | Reading a layer's features client-side for Heatmap's transient rendering (Research Decision 9 — no new endpoint) |
