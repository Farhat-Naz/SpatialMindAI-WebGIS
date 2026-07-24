# API Contracts: Projects, Layers, Features

**Feature**: 003-database-foundation

These are the authoritative request/response contracts for every Route Handler
introduced by this module. Every endpoint requires a resolved user (Research
Decision 6) and enforces ownership per `spec.md` FR-006. All error responses
share the envelope `{ "error": { "code": string, "message": string } }`
(Research Decision 10); success shapes are shown per endpoint. All request
bodies are validated with the shared Zod schemas in `src/shared/contracts/`
before touching a repository (Constitution Principle II/VI).

---

## Projects API

### `GET /api/projects`

List the current user's projects.

**Response — 200 OK**
```
{ "projects": Project[] }
```

### `POST /api/projects`

**Request body**
| Field | Type | Required | Constraint |
|---|---|---|---|
| `name` | string | Yes | Non-empty, unique per owner |
| `description` | string | No | — |

**Response — 201 Created**: `{ "project": Project }`

**Errors**: `400 INVALID_INPUT` (empty/invalid name) · `409 DUPLICATE_NAME`
(owner already has a project with this name)

### `GET /api/projects/:projectId`

**Response — 200 OK**: `{ "project": Project }`
**Errors**: `404 NOT_FOUND` · `401 UNAUTHORIZED` (not the owner)

### `PATCH /api/projects/:projectId`

**Request body** (all fields optional, at least one required)
| Field | Type | Constraint |
|---|---|---|
| `name` | string | Non-empty, unique per owner if changed |
| `description` | string | — |

**Response — 200 OK**: `{ "project": Project }`
**Errors**: `400 INVALID_INPUT` · `404 NOT_FOUND` · `409 DUPLICATE_NAME` ·
`401 UNAUTHORIZED`

### `DELETE /api/projects/:projectId`

Cascades to every layer/feature/attribute/style owned by the project (FR-004).

**Response — 204 No Content**
**Errors**: `404 NOT_FOUND` · `401 UNAUTHORIZED`

---

## Layers API

### `GET /api/projects/:projectId/layers`

Returns layers ordered by `order` ascending (FR-011).

**Response — 200 OK**: `{ "layers": Layer[] }`
**Errors**: `404 NOT_FOUND` (project) · `401 UNAUTHORIZED`

### `POST /api/projects/:projectId/layers`

**Request body**
| Field | Type | Required | Constraint |
|---|---|---|---|
| `name` | string | Yes | Non-empty, unique per project |

**Response — 201 Created**: `{ "layer": Layer }` (assigned the next `order`
value in the project)
**Errors**: `400 INVALID_INPUT` · `404 NOT_FOUND` (project) ·
`409 DUPLICATE_NAME` · `401 UNAUTHORIZED`

### `PATCH /api/layers/:layerId`

**Request body**
| Field | Type | Constraint |
|---|---|---|
| `name` | string | Non-empty, unique per project if changed |

**Response — 200 OK**: `{ "layer": Layer }`
**Errors**: `400 INVALID_INPUT` · `404 NOT_FOUND` · `409 DUPLICATE_NAME` ·
`401 UNAUTHORIZED`

### `PATCH /api/projects/:projectId/layers/reorder`

Bulk reorder (Research Decision 8).

**Request body**
```
{ "orderedLayerIds": string[] }
```
`orderedLayerIds` MUST be exactly the set of the project's current layer IDs,
in the desired order — a partial list is rejected.

**Response — 200 OK**: `{ "layers": Layer[] }` (in new order)
**Errors**: `400 INVALID_INPUT` (list doesn't match the project's actual
layers) · `404 NOT_FOUND` (project) · `401 UNAUTHORIZED`

### `DELETE /api/layers/:layerId`

Cascades to every feature/attribute/style owned by the layer (FR-010).

**Response — 204 No Content**
**Errors**: `404 NOT_FOUND` · `401 UNAUTHORIZED`

---

## Features API

### `GET /api/layers/:layerId/features`

Cursor-paginated (Research Decision 5).

**Query parameters**
| Parameter | Type | Required | Constraint |
|---|---|---|---|
| `cursor` | string | No | A feature `id` from a previous page's `nextCursor` |
| `limit` | number | No | Default 100; server clamps to max 500 |
| `bbox` | string | No | `minLng,minLat,maxLng,maxLat`; applies `ST_Intersects` |

**Response — 200 OK**
```
{
  "features": Feature[],
  "nextCursor": string | null
}
```
Each `Feature` includes its `geometry` (GeoJSON), `attributes` (key/value
array), and `style` (or the documented default if none is set).

**Errors**: `400 INVALID_INPUT` (malformed `bbox`/`cursor`/`limit`) ·
`404 NOT_FOUND` (layer) · `401 UNAUTHORIZED`

### `POST /api/layers/:layerId/features`

**Request body**
| Field | Type | Required | Constraint |
|---|---|---|---|
| `geometry` | GeoJSON geometry | Yes | One of the six supported types; structurally valid per Zod, topologically valid per `ST_IsValid` |
| `attributes` | `{ key: string; value: string }[]` | No | Unique keys within the array |
| `style` | `{ color, strokeWidth?, fillOpacity? }` | No | Defaults applied if omitted |

**Response — 201 Created**: `{ "feature": Feature }`
**Errors**: `400 INVALID_INPUT` (bad structure, unsupported type, or fails
`ST_IsValid`) · `404 NOT_FOUND` (layer) · `401 UNAUTHORIZED`

### `GET /api/features/:featureId`

**Response — 200 OK**: `{ "feature": Feature }`
**Errors**: `404 NOT_FOUND` · `401 UNAUTHORIZED`

### `PATCH /api/features/:featureId`

Any subset of the three independent facets may be sent (FR-017/FR-021/FR-024);
omitted facets are left unchanged.

**Request body** (all optional, at least one required)
| Field | Type | Constraint |
|---|---|---|
| `geometry` | GeoJSON geometry | Same validation as create |
| `attributes` | `{ key: string; value: string }[]` | Full replacement of the attribute set |
| `style` | `{ color, strokeWidth?, fillOpacity? }` | Full replacement of the style |

**Response — 200 OK**: `{ "feature": Feature }`
**Errors**: `400 INVALID_INPUT` · `404 NOT_FOUND` · `401 UNAUTHORIZED`

### `DELETE /api/features/:featureId`

**Response — 204 No Content**
**Errors**: `404 NOT_FOUND` · `401 UNAUTHORIZED`

---

## Common Error Reference

| `code` | HTTP Status | Meaning |
|---|---|---|
| `INVALID_INPUT` | 400 | Request failed Zod structural validation or PostGIS `ST_IsValid` |
| `NOT_FOUND` | 404 | The referenced project/layer/feature does not exist |
| `DUPLICATE_NAME` | 409 | A name collided within its required uniqueness scope |
| `UNAUTHORIZED` | 401 | The resolved user does not own the target resource |
| `DATABASE_ERROR` | 500 | An unexpected storage failure; never includes a raw stack trace |
