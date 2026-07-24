# API Contracts: Spatial Analysis Toolset (007)

**Feature**: 007-spatial-analysis

This feature **modifies two existing Route Handlers** (`POST`/`GET
/api/projects/:projectId/analysis`, `GET /api/analysis/:runId`) and **adds
nine new ones**, all under the same two resource families 005 already
established (`/api/projects/:projectId/analysis*` and `/api/analysis/:runId*`,
plus two small new sibling families for presets and measurements).
Authentication, rate limiting, and error mapping continue to reuse
`getCurrentUser`, `assertWriteRateLimit`, and `handleRouteError`/
`toErrorResponse` unchanged. Every write endpoint additionally calls
`assertProjectRole` (research.md Decision 3) once 006-collaboration's role
infrastructure exists; see plan.md's Complexity Tracking for the
sequencing note.

---

## MODIFIED: `POST /api/projects/:projectId/analysis`

Submits a single Analysis Run — now covers the full 007 `operationType`
set (005's 20 plus US2/US4/US5/US6's additions from data-model.md) and can
respond before execution finishes.

**Consumed by**: `src/features/analysis/services/analysisService.ts`'s
`runAnalysis`

### Request

Unchanged envelope shape from 005 (`operationType` / `inputLayerIds` /
`parameters`, one discriminated-union variant per operation — see
data-model.md's "New `operationType` values" for the full current list).
Additionally accepts an optional `presetId` field: when present, the
server loads that preset's `parameters` as the base and the request body's
`parameters` (if any) override individual keys.

### Response — 202 Accepted

```
{
  "run": {
    "id": string,
    "projectId": string,
    "userId": string,
    "operationType": string,
    "status": "queued" | "running" | "succeeded" | "failed",
    "progress": number | null,
    "parameters": object,
    "inputLayerIds": string[],
    "resultLayerId": string | null,
    "resultData": object | null,
    "errorMessage": string | null,
    "batchId": string | null,
    "presetId": string | null,
    "startedAt": string | null,
    "completedAt": string | null,
    "executionTimeMs": number | null,
    "createdAt": string,
    "updatedAt": string
  }
}
```

**Status code changes from 005**: `202` replaces `201` — the row always
exists by response time, but `status` may still be `"queued"` or
`"running"` for an operation large enough to need background execution
(research.md Decision 5). A fast operation (small input) may already show
`"succeeded"`/`"failed"` in this same response — the client always checks
`status`, never assumes a fixed timing.

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed body, unrecognized `operationType`, wrong input count, empty input layer/selection (spec Edge Cases), geometry-type mismatch |
| 403 | `FORBIDDEN` | Resolved user is a project member below the required role (Editor) |
| 404 | `NOT_FOUND` | Any `inputLayerIds`/`presetId` entry does not exist or is not visible to the resolved user, or the user is not a project member at all (non-disclosure — indistinguishable from "doesn't exist," per 005's existing convention) |
| 401 | `UNAUTHORIZED` | No resolvable user |
| 429 | `RATE_LIMITED` | `analysis:write` bucket exceeded, or the per-user concurrent-job cap (research.md Decision 12) is exceeded |
| 500 | `DATABASE_ERROR` | Unexpected failure |

---

## UNCHANGED: `GET /api/projects/:projectId/analysis`

Cursor-paginated Analysis History — request/response shape unchanged from
005, `runs[]` entries now carry the extended fields shown above. Adds one
optional query param: `status` (comma-separated subset of the status enum)
to support the History Panel's "show only running" filter.

## UNCHANGED: `POST /api/projects/:projectId/analysis/batch`

Unchanged from 005 — each item independently follows the same
queued/running/terminal lifecycle as a single run.

---

## MODIFIED: `GET /api/analysis/:runId`

Fetch one run's current detail — now the **polling target** for progress
(research.md Decision 5). Response body unchanged shape from the `POST`
response above (full `run` object, extended fields included).

## OPTIONAL/ADDITIVE: `GET /api/analysis/:runId/stream`

Server-Sent Events (`text/event-stream`) alternative to polling
(research.md Decision 6). Each event's `data` is the same JSON shape as
`GET /api/analysis/:runId`'s response. Not required for any client path to
function — polling remains the guaranteed baseline.

---

## NEW: `POST /api/analysis/:runId/cancel`

Requests cancellation of a queued or running run (FR-028).

**Consumed by**: `analysisService.ts`'s `cancelAnalysis`

### Response — 200 OK

Returns the current `run` object. If the run had already reached a
terminal state before the cancel request arrived, the response still
succeeds and simply reflects that terminal state unchanged — cancelling an
already-finished run is a no-op, not an error (spec Edge Cases).

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 403 | `FORBIDDEN` | Requesting user is not the run's owner and not a project Owner/Editor |
| 404 | `NOT_FOUND` | Run does not exist / not visible to user |
| 401 | `UNAUTHORIZED` | No resolvable user |

---

## NEW: `POST /api/analysis/:runId/discard-result`

Undoes a specific analysis result (FR-031): deletes the run's
`resultLayerId` layer (cascading its features, per the existing `Layer`
cascade rule) if one exists, and clears `resultLayerId` on the run. The
history row itself is **not** deleted — it remains visible with
`resultLayerId: null`, so the audit trail of "this analysis ran" survives
even though its output was discarded (distinct from `DELETE
/api/analysis/:runId`, which removes the history entry itself and already
existed in 005 unchanged for that purpose).

### Response — 200 OK

Returns the updated `run` object (`resultLayerId: null`).

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Run has no result to discard (e.g., `resultData`-only run, or already discarded) |
| 403 | `FORBIDDEN` | Insufficient role |
| 404 | `NOT_FOUND` | Run not found/visible |

---

## UNCHANGED: `POST /api/analysis/:runId/rerun`

Unchanged from 005 (FR-025/FR-020). Now additionally validates the
original run's owner still has at least Editor access before re-running
(research.md Decision 3).

## UNCHANGED: `DELETE /api/analysis/:runId`

Unchanged from 005 — deletes the history entry only, never the result
layer (that is `discard-result`'s job, above).

---

## NEW: `GET /api/projects/:projectId/analysis/presets`

Lists presets visible in a project (US8/FR-021).

**Consumed by**: `analysisService.ts`'s `listPresets`

### Response — 200 OK

```
{ "presets": [{ "id": string, "projectId": string, "userId": string,
    "name": string, "operationType": string, "parameters": object,
    "createdAt": string, "updatedAt": string }] }
```

## NEW: `POST /api/projects/:projectId/analysis/presets`

Saves a named parameter set.

### Request

```
{ "name": string, "operationType": string, "parameters": object }
```

`operationType`/`parameters` validated against the same per-operation
shape `analysisRequestSchema` already defines (data-model.md).

### Response — 201 Created

`{ "preset": { ...as above } }`

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Invalid `operationType`/`parameters` shape |
| 403 | `FORBIDDEN` | Insufficient role |
| 409 | `DUPLICATE_NAME` | A preset with this name already exists in the project |

## NEW: `DELETE /api/analysis/presets/:presetId`

Deletes a preset (creator or project Owner only). `AnalysisRun.presetId`
on any run that used it is set null (already the schema's `onDelete:
SetNull` behavior) — deleting a preset never deletes runs that used it.

### Response — 204 No Content / Error

| HTTP Status | `code` | When |
|---|---|---|
| 403 | `FORBIDDEN` | Not the creator and not an Owner |
| 404 | `NOT_FOUND` | Preset not found/visible |

---

## NEW: `POST /api/projects/:projectId/measurements`

Saves a measurement reading (US3/FR-008; research.md Decision 8 —
server-recomputes the value from the submitted geometry before persisting).

**Consumed by**: `analysisService.ts`'s `saveMeasurement`

### Request

```
{
  "measurementType": "distance" | "area" | "perimeter" | "radius"
                    | "bearing" | "azimuth" | "coordinates",
  "geometry": GeoJSON geometry,
  "label": string | null
}
```

### Response — 201 Created

```
{ "measurement": { "id": string, "projectId": string, "userId": string,
    "measurementType": string, "geometry": GeoJSON, "value": number | null,
    "unit": string | null, "label": string | null, "createdAt": string } }
```

`value`/`unit` are the **server-recomputed** PostGIS result, which may
differ negligibly from the client's live readout due to floating-point/
projection nuance — this is expected and is exactly why Decision 8
recomputes rather than trusting the client's number.

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Geometry fails structural or `ST_IsValid` validation |
| 403 | `FORBIDDEN` | Insufficient role |

## NEW: `GET /api/projects/:projectId/measurements`

Cursor-paginated measurement history, same pagination shape as
`GET /api/projects/:projectId/analysis`.

## NEW: `DELETE /api/measurements/:measurementId`

Deletes a saved measurement (creator or Owner only). `204`/`403`/`404`
identical shape to the preset delete above.

---

## NEW: `POST /api/projects/:projectId/exports`

Logs a completed client-side export for history (research.md Decision 10,
revised — **not** an execution-tracking endpoint; called *after* the
client has already produced and downloaded the file).

**Consumed by**: `analysisService.ts`'s `logExport`, called from the
export UI's completion/failure handler.

### Request

```
{
  "sourceAnalysisRunId": string | null,
  "sourceLayerId": string | null,
  "format": "geojson" | "shapefile" | "csv" | "kml",
  "status": "succeeded" | "failed",
  "featureCount": number | null,
  "errorMessage": string | null
}
```

### Response — 201 Created

`{ "exportJob": { ...ExportJob fields... } }`

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Both or neither of `sourceAnalysisRunId`/`sourceLayerId` set with a non-null value inconsistent with data-model.md's rule |
| 403 | `FORBIDDEN` | Insufficient role |

## NEW: `GET /api/projects/:projectId/exports`

Cursor-paginated export history, same pagination shape as the analysis/
measurement history endpoints.

---

## Cross-cutting notes

- **Validation**: every request body is Zod-parsed before any repository
  call, per Constitution Principle II — extending `analysis.schema.ts`
  (new `operationType` variants) and adding `presetRequest.schema.ts`,
  `measurementRequest.schema.ts` (new, small, same file-per-concern
  convention as `analysis.schema.ts`).
- **Error responses**: unchanged envelope (`{ error: { code, message } }`),
  extended with the `FORBIDDEN` code 006-collaboration's plan already adds
  to `apiError.ts` (research.md Decision 15) — 007 does not redefine it.
- **Cancellation and job status** are covered above per-endpoint; no
  separate generic "jobs" resource exists — every job is either an
  `AnalysisRun` or (client-driven, no polling) an `ExportJob` log entry.
