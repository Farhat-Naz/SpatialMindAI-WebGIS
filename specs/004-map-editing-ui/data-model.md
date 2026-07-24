# Data Model: Interactive WebGIS Editing

**Feature**: 004-map-editing-ui (expanded to cover all eight approved user
stories — see `research.md`'s header note)
**Date**: 2026-07-22

This feature introduces **no new persisted database entity or column**. It
is a UI/interaction layer over the `Project`/`Layer`/`Feature`/
`FeatureAttribute`/`FeatureStyle` entities already defined in
`specs/003-database-foundation/data-model.md`, which remains the
authoritative source for those five entities — this document does not
repeat their field-level definitions.

The only server-side addition is a **new Route Handler operation**
(Research Decision 5), not a new entity: bulk feature import (used by both
GeoJSON and, after client-side conversion, Shapefile import — Research
Decision 19) writes multiple already-defined `Feature`/`FeatureAttribute`/
`FeatureStyle` rows in one transaction, using the exact same schema as
single-feature creation. Layer Lock and Copy/Paste/Duplicate (Research
Decision 20) introduce no server-side change at all.

---

## Client-Only Entities (this feature)

These exist only in the browser (Zustand state or ephemeral component
state) — never persisted, never sent to the server except where noted.

### Selection

*(Already defined in spec.md's Key Entities. Split across two store
fields per Research Decision 13 — an additive change, not a replacement of
the existing single-selection contract.)*

| Field | Store | Type | Notes |
|---|---|---|---|
| `selectedFeatureId` | `databaseStore` (existing, 003-database-foundation) | `string \| null` | Single-feature focus — popup, zoom-to-feature, Attribute Form. Unchanged contract; kept in sync as "most recently selected" whenever `selectedFeatureIds` changes. |
| `selectedFeatureIds` | `databaseStore` (new field on the existing store) | `string[]` | The full multi-selection set within the current layer (US5) |

Selection is cleared when the active layer/project changes, and when a
selected feature is deleted (via any path — single delete, bulk delete, or
undo-restoring a different feature).

### Layer Lock

*(New — Research Decision 20.)*

| Field | Store | Type | Notes |
|---|---|---|---|
| `lockedLayerIds` | `editingStore` (new) | `Set<string>` (or equivalent) | Layer ids currently locked; checked before any draw/edit/attribute-edit/delete/paste/duplicate action against that layer's features (spec FR-006a) |

Session-only, not persisted — matches the precedent already set for
visibility/opacity in 003-database-foundation.

### Clipboard

*(New — Research Decision 20.)*

| Field | Store | Type | Notes |
|---|---|---|---|
| `clipboard` | `editingStore` (new) | `{ geometry, attributes, style } \| null` | A snapshot (not a live reference) of the most recently copied feature; holds at most one entry; replaced on every new copy |

Paste/Duplicate (spec FR-027d/e) read this snapshot and call the existing
`useCreateFeature` — no new create pathway.

### Active Tool

| Field | Type | Notes |
|---|---|---|
| `tool` | `'select' \| 'draw-point' \| 'draw-line' \| 'draw-polygon' \| 'draw-rectangle' \| 'draw-circle' \| 'edit-geometry' \| 'measure-distance' \| 'measure-area' \| null` | Mutually exclusive; activating one clears any other |

Starting a new tool discards any in-progress drawing/measurement from the
previous tool (spec Edge Cases).

### In-Progress Draft (drawing/editing)

| Field | Type | Notes |
|---|---|---|
| `draftGeometry` | GeoJSON geometry \| `null` | The shape currently being drawn/edited, before save |
| `targetLayerId` | `string \| null` | Which layer a new draft will be saved into |
| `targetFeatureId` | `string \| null` | Set when editing an existing feature's geometry (vs. drawing new) |

Canceling (FR-027b) discards this draft entirely with no server call.

### Undo Snapshot

*(New this plan increment — Research Decision 4.)*

| Field | Type | Notes |
|---|---|---|
| `kind` | `'geometry' \| 'attributes' \| 'style' \| 'delete'` | Which facet the snapshot restores |
| `featureId` | `string` | The affected feature's id |
| `layerId` | `string` | Needed to re-create the feature if `kind === 'delete'` |
| `previousValue` | geometry \| attributes \| style \| full feature snapshot | The state to restore |

Exactly one `UndoSnapshot` exists at a time (or none). Set after every
successful edit/delete; cleared after Undo is used once, after a new edit
succeeds, or on navigating to a different feature/layer/project.

### Measurement Result

*(Already defined in spec.md's Key Entities.)*

| Field | Type | Notes |
|---|---|---|
| `value` | `number` | Current cumulative distance or area |
| `unit` | `string` | e.g. meters/kilometers, square meters/hectares |

Computed client-side via Turf.js (Research Decision 3); recalculated on
every vertex added while the measurement tool is active; discarded when the
tool closes.

### Import Result

*(Already defined in spec.md's Key Entities.)*

| Field | Type | Notes |
|---|---|---|
| `status` | `'success' \| 'error'` | Outcome of the most recent import attempt |
| `importedCount` | `number?` | Present on success |
| `errorMessage` | `string?` | Present on error; safe to display, never a raw stack trace |

Transient — shown once (e.g., a toast/dialog) and not retained after
dismissal.

---

## Server-Side: Reused Entities (no changes)

| Entity | Defined in | Used by this feature for |
|---|---|---|
| `Project` | 003-database-foundation | Ownership scoping (unchanged) |
| `Layer` | 003-database-foundation | The target of every draw/import operation; `layerId` on every new `Feature` |
| `Feature` | 003-database-foundation | Created via drawing/import; updated via geometry/attribute/style edits; deleted via delete/undo |
| `FeatureAttribute` | 003-database-foundation | Edited via the Attribute Form; imported features' properties are mapped to these rows |
| `FeatureStyle` | 003-database-foundation | Unchanged by this feature (no new style-editing capability beyond what 003 already exposed) |

## Import Payload Shape (new Zod contract, not a new entity)

`src/shared/contracts/geoJsonImport.schema.ts` (new file) validates the
bulk-import request body:

| Field | Type | Constraint |
|---|---|---|
| `type` | `"FeatureCollection"` | Literal, per GeoJSON spec |
| `features` | array of `{ type: "Feature", geometry, properties? }` | Each `geometry` re-validated with the existing `geometrySchema` (003-database-foundation); `properties` (if present) mapped to `FeatureAttribute` key/value rows, flattened to strings the same way single-feature creation already does |

No new persisted shape — this is purely a request-body contract wrapping
the existing per-feature shape in a collection.
