# API Contracts: Interactive WebGIS Editing

**Feature**: 004-map-editing-ui (expanded to cover all eight approved user
stories)

This feature introduces exactly **one new Route Handler** (bulk feature
import — used by both GeoJSON import and Shapefile import, the latter
converted to GeoJSON entirely client-side before submission, Research
Decision 19). Every other capability across all eight user stories (draw,
edit geometry, edit attributes, delete, undo, copy/paste/duplicate, layer
lock, multi-select, export, Project Explorer/Layer Tree CRUD) is
implemented entirely by **reusing** the Route Handlers already defined in
`specs/003-database-foundation/contracts/api-contracts.md`, or requires no
backend call at all (undo, copy/paste/duplicate, layer lock, multi-select
— all purely client-side, Research Decisions 4, 13, 20) — they are
referenced below, not redefined.

---

## New: `POST /api/layers/:layerId/features/import`

**Consumed by**: `src/features/database/services/featureService.ts`'s new
`importFeatureCollection` method (Research Decision 5)

### Request

| Field | Type | Required | Constraint |
|---|---|---|---|
| `type` | `"FeatureCollection"` | Yes | Literal |
| `features` | array | Yes | Non-empty; each entry validated against the existing per-feature geometry/attributes shape (`src/shared/contracts/feature.schema.ts`'s geometry/attributes rules) |

### Response — 201 Created

```
{
  "importedCount": number
}
```

### Response — Error

| HTTP Status | `code` | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed request body, empty `features` array, or ANY feature in the collection fails structural (Zod) or topological (`ST_IsValid`) validation — the whole import is rejected, none of it is partially applied |
| 404 | `NOT_FOUND` | The target layer does not exist or does not belong to the resolved user |
| 401 | `UNAUTHORIZED` | No resolvable user |
| 429 | `RATE_LIMITED` | Write rate limit exceeded (same `features:write` bucket as single-feature create) |
| 500 | `DATABASE_ERROR` | Unexpected failure |

```
{
  "error": { "code": string, "message": string }
}
```

**Transactional guarantee**: all inserts for one import request run inside a
single database transaction; any failure rolls back the entire batch
(spec FR-035, "all-or-nothing").

---

## Reused (unchanged): Feature Operations from 003-database-foundation

The following, already-approved endpoints are used as-is by this feature's
drawing, geometry editing, attribute editing, deletion, undo, and export
capabilities — see
`specs/003-database-foundation/contracts/api-contracts.md` for their full
request/response contracts:

| Endpoint | Used by this feature for |
|---|---|
| `POST /api/layers/:layerId/features` | Saving a newly drawn Point/LineString/Polygon/Rectangle-as-Polygon/Circle-as-Polygon feature |
| `GET /api/features/:featureId` | Reading a feature's current state before building an Undo Snapshot |
| `PATCH /api/features/:featureId` | Geometry edits (vertex drag/add/remove), attribute edits, style edits, and Undo's "restore previous geometry/attributes/style" replay |
| `DELETE /api/features/:featureId` | Deleting a selected feature; Undo replays this feature's prior state via a new `POST` (re-create) if the undone action was itself a delete |
| `GET /api/layers/:layerId/features` (cursor-paginated) | Rendering a layer's features on the map; client-side pagination-aggregation for GeoJSON export (Research Decision 6) |

No request/response shape from 003-database-foundation is changed by this
feature.
