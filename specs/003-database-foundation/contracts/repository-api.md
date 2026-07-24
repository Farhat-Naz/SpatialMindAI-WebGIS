# Repository Contracts: Server-Only Data Access

**Feature**: 003-database-foundation

These are the function-level contracts between Route Handlers and the
repository layer at `src/server/repositories/` (Research Decision 2). This
boundary is internal to the server — it is never imported by client code — but
is documented as a contract because every future feature's Route Handlers will
call these same repositories rather than re-implementing project/layer/feature
access. Signatures describe inputs/outputs conceptually; they are not literal
TypeScript code.

---

## `projectRepository`

| Function | Input | Output | Notes |
|---|---|---|---|
| `listProjectsForOwner` | `ownerId` | `Project[]` | Ordered by `createdAt` descending |
| `createProject` | `ownerId`, `name`, `description?` | `Project` | Throws a duplicate-name error the Route Handler maps to `409 DUPLICATE_NAME` |
| `getProjectById` | `projectId`, `ownerId` | `Project \| null` | `null` (not an exception) signals not-found or not-owned — Route Handler maps to `404`/`401` per FR-006 |
| `updateProject` | `projectId`, `ownerId`, `{ name?, description? }` | `Project` | Refreshes `updatedAt` only |
| `deleteProject` | `projectId`, `ownerId` | `void` | Relies on `onDelete: Cascade` (Research Decision 7) — no manual child deletion |

## `layerRepository`

| Function | Input | Output | Notes |
|---|---|---|---|
| `listLayersForProject` | `projectId`, `ownerId` | `Layer[]` | Ordered by `order` ascending |
| `createLayer` | `projectId`, `ownerId`, `name` | `Layer` | Assigns `order` = current max + 1 within the project |
| `renameLayer` | `layerId`, `ownerId`, `name` | `Layer` | Duplicate-name check scoped to the layer's project |
| `reorderLayers` | `projectId`, `ownerId`, `orderedLayerIds` | `Layer[]` | Single transaction; validates the input set exactly matches the project's current layer IDs before writing (Research Decision 8) |
| `deleteLayer` | `layerId`, `ownerId` | `void` | Cascades to features/attributes/styles |

## `featureRepository`

| Function | Input | Output | Notes |
|---|---|---|---|
| `listFeaturesForLayer` | `layerId`, `ownerId`, `{ cursor?, limit, bbox? }` | `{ features: Feature[]; nextCursor: string \| null }` | Raw SQL join reading `geometry` via `ST_AsGeoJSON`; applies `ST_Intersects` when `bbox` is present (Research Decision 5) |
| `createFeature` | `layerId`, `ownerId`, `{ geometry, attributes?, style? }` | `Feature` | Runs `ST_IsValid` inside the same transaction as the insert; rolls back and signals `INVALID_INPUT` on failure (Research Decision 3) |
| `getFeatureById` | `featureId`, `ownerId` | `Feature \| null` | Includes attributes and style (or the documented default) |
| `updateFeature` | `featureId`, `ownerId`, `{ geometry?, attributes?, style? }` | `Feature` | Each facet updates independently; omitted facets are untouched (FR-017/FR-021/FR-024) |
| `deleteFeature` | `featureId`, `ownerId` | `void` | Cascades to attributes/style |

---

## Cross-Cutting Repository Rules

- Every function accepts `ownerId` and enforces it as part of the query itself
  (e.g., `WHERE project.ownerId = $1`), never as a separate check performed
  after an unscoped fetch — this is what makes `getProjectById`-style functions
  return `null` for "exists but not yours" indistinguishably from "doesn't
  exist," which the Route Handler is responsible for mapping to the correct
  `404`/`401` per FR-006's non-disclosure requirement (Edge Cases: "MUST NOT
  reveal data the requester is not entitled to see").
- Every write function throws a typed internal error
  (`DuplicateNameError`/`ValidationError`/`NotFoundError`) that the calling
  Route Handler maps to the shared `ApiError` envelope (Research Decision 10)
  — repositories never construct HTTP responses themselves.
- No repository function ever accepts a raw, unvalidated request body; Route
  Handlers parse and validate with the shared Zod schemas (`src/shared/
  contracts/`) before calling a repository function, per Constitution
  Principle II.
