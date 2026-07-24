# Repository Contract Addition: Bulk Feature Import

**Feature**: 004-map-editing-ui

Exactly one new repository function is added to
`src/server/repositories/featureRepository.ts` (the existing
003-database-foundation repository file — no new repository module). Every
other repository function it exposes (`getFeatureById`, `createFeature`,
`updateFeature`, `deleteFeature`, `listFeaturesForLayer`) is reused
unchanged.

## `featureRepository.importFeatures`

| Function | Input | Output | Notes |
|---|---|---|---|
| `importFeatures` | `layerId`, `ownerId`, `features: { geometry, attributes? }[]` | `{ importedCount: number }` | Scoped by `ownerId` exactly like `createFeature` (same `getLayerScopedToOwner` check, Research Decision 8). Runs `ST_IsValid` for every geometry and all inserts inside one `$transaction` — if any feature is invalid, the transaction rolls back and the function throws the same `ValidationError` `createFeature` already throws, so the Route Handler's existing error-mapping (`handleRouteError`) requires no changes. |

**Cross-cutting rule (unchanged from 003-database-foundation)**: this
function never accepts a raw, unvalidated request body — the Route Handler
parses/validates the full `FeatureCollection` with the new
`importFeatureCollectionSchema` (Zod) before calling it, consistent with
every other repository function's contract.
