# API Contracts: GIS Import & Export (005-import-export)

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) | **Date**: 2026-07-27

Every endpoint below follows the conventions already established across the 40+ Route Handlers in
this codebase:

- Acting user resolved by `getCurrentUser(request)` (`src/server/auth/getCurrentUser.ts`).
- Every mutating handler calls `assertWriteRateLimit(user.id, "import:write" | "export:write")`
  **before** any repository access; `GET` handlers are unthrottled.
- Every request body is parsed with a **Zod schema from `src/shared/contracts/`** before use
  (Constitution Principle II). The same schema module is imported by the client service, so
  request/response shapes cannot drift.
- Every handler wraps its body in `try/catch` and returns `handleRouteError(error)`.
- Every response passes through the local `respond()` helper that emits `logger.request({ method,
  path, status, durationMs })` (Constitution: Logging).
- Errors use the existing envelope `{ error: { code, message } }` — **no new `ApiErrorCode` is
  introduced** (research.md Decision 19).

**There is no file-upload endpoint.** Files are parsed in the browser; the server receives only
normalized JSON (research.md Decision 2).

---

## Error responses (shared)

| Code | HTTP | Raised when |
|---|---|---|
| `INVALID_INPUT` | 400 | Zod rejection: malformed chunk, unknown format/CRS, chunk over 1,000 features, body over 8 MB, `sourceCrs: "CUSTOM"` without `customCrsDefinition` |
| `UNAUTHORIZED` | 401 | No resolvable acting user |
| `FORBIDDEN` | 403 | Caller is a project `Viewer` attempting an import, export log, or rollback (FR-080) |
| `NOT_FOUND` | 404 | Unknown `importJobId` / `layerId` / `projectId`, **or** caller has no access at all (non-disclosure — matches `assertProjectRole`) |
| `CONFLICT` | 409 | Chunk POST after cancel; `complete`/`chunks` on a terminal job; rollback of an already-rolled-back job |
| `RATE_LIMITED` | 429 | `assertWriteRateLimit` exceeded |
| `DATABASE_ERROR` | 500 | Anything unrecognized; message is always the generic user-safe string (FR-086) |

```jsonc
// Every failure, every endpoint
{ "error": { "code": "CONFLICT", "message": "This import was cancelled and cannot accept more data." } }
```

---

## 1. Create an import job

```
POST /api/layers/:layerId/imports
```

Creates the `ImportJob` in `running` state after the client's preflight has completed and the user
has confirmed (FR-005, FR-011 — abandoning at the summary simply never calls this).

**Auth**: `Editor` on the layer's project. **Rate bucket**: `import:write`.

**Request** — `createImportJobSchema`:

```jsonc
{
  "sourceFormat": "shapefile",            // geojson | shapefile | kml | kmz | csv
  "fileName": "parcels_2026.zip",
  "fileSizeBytes": 18234881,
  "mimeType": "application/zip",
  "fileHash": "9f2c…",                    // optional, SHA-256, provenance only
  "sourceCrs": "EPSG:27700",              // ^EPSG:\d{4,6}$ | "CUSTOM"
  "customCrsDefinition": null,            // required iff sourceCrs === "CUSTOM"
  "mode": "lenient",                      // strict | lenient  (default lenient, FR-006)
  "totalFeatures": 84213,                 // from preflight — the progress denominator
  "columnMapping": null,                  // CSV only (FR-029/FR-030)
  "preflightIssues": [                    // optional, capped at 1000 (research.md D16)
    { "sourcePosition": 41, "category": "out_of_range_coordinate", "message": "Longitude 200 is outside -180..180." }
  ],
  "preflightCounts": {                    // preflight totals; always exact (SC-006)
    "rejected": 3,
    "duplicate": 12,
    "repaired": 1
  }
}
```

**Response** `201`:

```jsonc
{ "importJob": { /* ImportJobRecord — see repository-api.md */ } }
```

**Notes**
- `totalFeatures` is trusted as a *display denominator only*. Correctness never depends on it: the
  authoritative counts are accumulated from what chunks actually commit.
- `preflightIssues` beyond the 1,000 cap are silently not persisted; `preflightCounts` still
  carries the exact totals (research.md Decision 16).

---

## 2. Commit one chunk

```
POST /api/imports/:importJobId/chunks
```

The workhorse. Called once per 1,000 features (research.md Decisions 3, 5). Idempotent on
`chunkIndex`.

**Auth**: `Editor`. **Rate bucket**: `import:write`.

**Request** — `commitImportChunkSchema`:

```jsonc
{
  "chunkIndex": 12,                       // 0-based, monotonic
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [[[529000, 181000], …]] },
      "properties": { "uprn": "100023336956", "ward": "Holborn" }
    }
  ]
}
```

**Coordinates are in the source CRS, untransformed.** `ST_Transform` is applied server-side using
the job's `sourceCrs` (research.md Decision 4). Geometry structure is re-validated with the
existing `geometrySchema`; coordinate *range* validation is relaxed for non-4326 source CRSs,
since projected coordinates legitimately exceed ±180/±90.

**Response** `200`:

```jsonc
{
  "chunkIndex": 12,
  "committed": 987,
  "rejected": [
    { "sourcePosition": 12043, "category": "invalid_topology",  "message": "The polygon self-intersects." },
    { "sourcePosition": 12119, "category": "duplicate_in_layer", "message": "An identical feature already exists in this layer." }
  ],
  "job": { "importedCount": 12987, "rejectedCount": 5, "duplicateCount": 8, "status": "running" }
}
```

**Behavior**
- **Idempotent**: `chunkIndex <= job.chunksCommitted` returns the prior result without re-inserting.
- **Cancelled**: returns `409 CONFLICT`. This is the server-side half of cancellation — a stale
  client cannot keep writing (research.md Decision 13).
- **Terminal job**: `409 CONFLICT`.
- **Strict mode**: the endpoint behaves identically; the *client* reacts to any non-empty
  `rejected[]` by calling `/rollback` (research.md Decision 6).
- **Limits**: `features.length <= 1000`, body `<= 8 MB`, both Zod-enforced (FR-083 defense in depth).

---

## 3. Complete an import job

```
POST /api/imports/:importJobId/complete
```

**Auth**: `Editor`. **Rate bucket**: `import:write`.

```jsonc
// Request — completeImportJobSchema
{ "outcome": "succeeded", "errorMessage": null }   // succeeded | failed
```

**Response** `200`: `{ "importJob": { /* terminal ImportJobRecord */ } }`

Sets `completedAt`, freezes counters, transitions `running → succeeded | failed`. `409 CONFLICT`
if already terminal.

---

## 4. Cancel an import job

```
POST /api/imports/:importJobId/cancel
```

**Auth**: `Editor`. **Rate bucket**: `import:write`. No request body.

**Response** `200`: `{ "importJob": { "status": "cancelled", "importedCount": 12987, … } }`

Sets `cancelRequestedAt` and `status: "cancelled"`. Chunks already committed **remain** — the
confirmed design decision (spec Assumptions; research.md Decision 13). The response's
`importedCount` is what FR-070 requires the summary to state.

Calling cancel on an already-terminal job is a **no-op success**, not an error — deliberately
matching `POST /api/analysis/:runId/cancel`'s documented behavior.

---

## 5. Roll back an import ("Undo this import")

```
POST /api/imports/:importJobId/rollback
```

**Auth**: `Editor`. **Rate bucket**: `import:write`. No request body.

**Response** `200`:

```jsonc
{ "importJob": { "status": "rolled_back", … }, "deletedFeatureCount": 12987 }
```

Executes `DELETE FROM "Feature" WHERE "importJobId" = :id` (research.md Decision 14), cascading to
`FeatureAttribute` / `FeatureStyle`. Removes **exactly** that import's features — concurrent users'
features in the same layer are untouched (FR-072).

Available from `succeeded`, `failed`, and `cancelled`. `409 CONFLICT` if already `rolled_back`.

---

## 6. Get one import job (progress / status)

```
GET /api/imports/:importJobId
```

**Auth**: `Viewer`. Unthrottled.

**Response** `200`: `{ "importJob": { /* ImportJobRecord */ } }`

Polled by React Query **only** when a running job is opened without an in-memory driver — after a
reload or from another device (research.md Decision 12). Applies the abandoned-job sweep on read:
a `running` job whose `heartbeatAt` is older than 5 minutes is returned as `failed` (FR-074).

---

## 7. List a job's validation issues

```
GET /api/imports/:importJobId/issues?cursor=&limit=
```

**Auth**: `Viewer`. Unthrottled. `limit` default 100, max 500 — the 100 default is FR-058's inline
count.

**Response** `200`:

```jsonc
{
  "issues": [ { "id": "…", "sourcePosition": 41, "category": "out_of_range_coordinate", "message": "…" } ],
  "nextCursor": "clx…",
  "totalPersisted": 1000,
  "truncated": true          // true when the job's real issue count exceeded the 1,000 cap
}
```

`truncated: true` is how the UI honestly tells the user that history holds the first 1,000 of a
larger set (research.md Decision 16).

---

## 8. Import history for a project

```
GET /api/projects/:projectId/imports?cursor=&limit=&status=
```

**Auth**: `Viewer` — a view-only member reads history but cannot trigger anything (FR-080).
Unthrottled. `limit` default 20, max 100 — identical to `listExportsForProject`.

**Response** `200`:

```jsonc
{ "imports": [ /* ImportJobRecord[], newest first */ ], "nextCursor": "clx…" }
```

Optional `status` filter is served by the `[projectId, status, createdAt]` index. Each record
carries `targetLayerName` and a null `targetLayerId` when the layer has since been deleted
(FR-079). This read is also where the abandoned-job sweep runs (research.md Decision 17).

---

## 9. Export history for a project *(EXISTING — unchanged)*

```
GET  /api/projects/:projectId/exports?cursor=&limit=
POST /api/projects/:projectId/exports
```

Already implemented (`src/app/api/projects/[projectId]/exports/route.ts`). **The route handler
requires no change.** Only its Zod schema, `logExportRequestSchema`, is widened:

```diff
- format: z.enum(["geojson", "shapefile", "csv", "kml"]),
+ format: z.enum(["geojson", "shapefile", "csv", "kml", "pdf"]),
+ scope: z.enum(["selection", "layer", "project"]).default("layer"),
+ outputCrs: z.string().regex(/^EPSG:\d{4,6}$/).optional(),
+ layerCount: z.number().int().positive().optional(),
+ sourceProjectExport: z.boolean().optional(),
```

The existing `.refine()` (at most one of `sourceAnalysisRunId` / `sourceLayerId`) is retained
unchanged, with one addition: `scope: "project"` must carry neither source id.

Export execution stays entirely client-side and this endpoint continues to **log a finished
attempt, never drive one** — 007's research Decision 10, preserved verbatim.

---

## 10. Feature listing *(EXISTING — unchanged, deliberately)*

`GET /api/layers/:layerId/features` is the read path for every export scope. It is **not**
modified — no `srid` query parameter is added.

Output-CRS transformation for export happens client-side with proj4, because an exported file is
neither persisted platform state nor an authoritative server query result, and therefore falls
outside Constitution Principle IV's PostGIS mandate (research.md Decision 4). Leaving this endpoint
alone means Map Editing's read path is bit-for-bit untouched.

---

## Endpoint summary

| # | Method | Path | Auth | Bucket | New? |
|---|---|---|---|---|---|
| 1 | POST | `/api/layers/:layerId/imports` | Editor | `import:write` | New |
| 2 | POST | `/api/imports/:importJobId/chunks` | Editor | `import:write` | New |
| 3 | POST | `/api/imports/:importJobId/complete` | Editor | `import:write` | New |
| 4 | POST | `/api/imports/:importJobId/cancel` | Editor | `import:write` | New |
| 5 | POST | `/api/imports/:importJobId/rollback` | Editor | `import:write` | New |
| 6 | GET | `/api/imports/:importJobId` | Viewer | — | New |
| 7 | GET | `/api/imports/:importJobId/issues` | Viewer | — | New |
| 8 | GET | `/api/projects/:projectId/imports` | Viewer | — | New |
| 9 | GET/POST | `/api/projects/:projectId/exports` | Viewer / Editor | `export:write` | **Existing — schema widened only** |
| 10 | GET | `/api/layers/:layerId/features` | Viewer | — | **Existing — untouched** |
| — | POST | `/api/layers/:layerId/features/import` | Editor | `features:write` | **Existing — untouched** (Map Editing's small-file path, research.md Decision 5) |

Eight new handlers. Two existing handlers reused, one of them with a widened schema and no code
change. No existing endpoint's behavior changes for any current caller.

---

## Zod schema modules (`src/shared/contracts/`)

| File | Exports | Status |
|---|---|---|
| `importJob.schema.ts` | `createImportJobSchema`, `completeImportJobSchema`, `importJobRecordSchema`, `importSourceFormatSchema`, `importModeSchema` | New |
| `importChunk.schema.ts` | `commitImportChunkSchema`, `importChunkResultSchema`, `IMPORT_CHUNK_MAX_FEATURES` | New |
| `importIssue.schema.ts` | `importIssueCategorySchema`, `importIssueSchema` | New |
| `crs.schema.ts` | `crsCodeSchema`, `crsSelectionSchema` (code + optional custom definition) | New |
| `exportLogRequest.schema.ts` | *widened* — `format` gains `"pdf"`; `scope`, `outputCrs`, `layerCount` added | **Modified** |
| `geoJsonImport.schema.ts` | `importFeatureCollectionSchema`, `propertiesToAttributes` | **Reused unchanged** |
| `geometry.schema.ts` | `geometrySchema` and the six type schemas | **Reused unchanged** |

Each new schema exports its `z.infer` type, imported by **both** the Route Handler and the client
service — Constitution Principle II's single-source-of-truth rule, and the pattern
`geoJsonImport.schema.ts` and `exportLogRequest.schema.ts` already follow.
