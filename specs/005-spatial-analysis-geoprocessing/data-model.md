# Data Model: Spatial Analysis & Geoprocessing

**Feature**: 005-spatial-analysis-geoprocessing
**Date**: 2026-07-23

This extends the persisted data model established by `003-database-foundation`
(`User → Project → Layer → Feature`) with exactly one new Prisma model,
`AnalysisRun`, plus new relations from `Project` and `Layer` (Research
Decision 2). It intentionally does not include literal `schema.prisma` syntax
or migration SQL, which belong to the implementation phase.

---

## Schema Organization

`AnalysisRun` is declared after `Feature` in dependency order (it references
both `Project` and, optionally, `Layer`). No existing model's fields change;
`Project` gains a `analysisRuns AnalysisRun[]` back-relation and `Layer`
gains a `resultOfAnalysisRuns AnalysisRun[]` back-relation. Both additions are
purely additive — no existing column, index, or relation is altered.

---

## Entity: AnalysisRun

**Repository**: `src/server/repositories/analysisRepository.ts`

| Field | Type | Constraint |
|---|---|---|
| `id` | identifier (string) | Primary key |
| `projectId` | identifier (string) | Foreign key → `Project.id`, cascade delete |
| `operationType` | string | One of the 22 named operations (spec.md); validated against a fixed enum at the Zod/contract layer, stored as plain string for forward-compatible querying |
| `status` | string | `"pending"` \| `"succeeded"` \| `"failed"` |
| `parameters` | JSON | The operation-specific parameter set that was submitted (distance+unit for Buffer, attribute key for Dissolve, relationship for Spatial Join, etc.) — also what a re-run replays verbatim (FR-025) |
| `inputLayerIds` | JSON (string array) | Which layer(s) were used as input; for a two-layer operation (Intersect, Clip, Spatial Join, …) both ids are recorded in a fixed, documented order |
| `resultLayerId` | identifier (string)? | Foreign key → `Layer.id`, set-null on delete; present only when the operation produced new geometry (FR-029) |
| `resultData` | JSON? | Non-geometry results — the Distance Matrix table, or Near Analysis's per-feature nearest-id/distance annotations (Research Decision 5) |
| `errorMessage` | string? | Populated only when `status = "failed"`; the same user-safe message class every other Route Handler already returns (never a raw stack trace) |
| `batchId` | string? | Groups multiple `AnalysisRun` rows submitted together as one Batch Run (Research Decision 2); `null` for a standalone run |
| `createdAt` | timestamp | Auto-set on creation; the ordering field for Analysis History (FR-024) |
| `updatedAt` | timestamp | Auto-refreshed when status transitions from `pending` |

**Relationships**:
- Many `AnalysisRun` belong to one `Project` (cascade: deleting a project
  deletes its analysis history, consistent with every other child entity).
- Zero-or-one `AnalysisRun` references one `Layer` as its result
  (`resultLayerId`); deleting that `Layer` sets `resultLayerId` to `null`
  rather than deleting the history entry (FR-026 — removing an entry's
  underlying layer must not silently destroy the history record, and
  removing the history record must not affect the layer).

**Validation rules** (enforced before any row is written, matching
`featureRepository.ts`'s existing `assertGeometryIsValid` pattern):
- `operationType` MUST be one of the 22 supported values (FR-001–FR-021
  collectively define the set); an unrecognized value is rejected as
  `INVALID_INPUT` before any PostGIS call runs.
- Every `inputLayerIds` entry MUST resolve to a layer owned (via its
  project) by the requesting user, or the request is rejected as
  `NOT_FOUND` — the same ownership-scoping pattern as
  `getLayerScopedToOwner` (FR-030).
- An operation whose result is new geometry MUST pass `ST_IsValid` before
  the new `Layer`/`Feature` rows are committed, or the whole run is marked
  `failed` with a specific message — never partially persisted (FR-028,
  reusing `assertGeometryIsValid`).
- Every operation MUST reject an empty input feature set, a geometry-type
  mismatch it cannot process, or an input exceeding its documented size cap
  (Research Decision 7) before any PostGIS call runs (FR-027).

**Lifecycle**:
1. Created with `status = "pending"` at submission time (or, for a
   synchronous single request/response execution — Research Decision 7 —
   effectively created and resolved in the same transaction/request).
2. Transitions to `"succeeded"` (with `resultLayerId` and/or `resultData`
   populated) or `"failed"` (with `errorMessage` populated).
3. A re-run (FR-025) creates a **new** `AnalysisRun` row with the same
   `operationType`/`parameters`/`inputLayerIds` as the original — it does
   not mutate the original row, so both remain visible in history.
4. Deleting a history entry (FR-026) deletes only the `AnalysisRun` row;
   any `resultLayerId` it referenced is untouched (the layer keeps existing
   independently, exactly as any other layer would).

**Indexes**:
- `@@index([projectId, createdAt])` — Analysis History listing, newest
  first, scoped to a project (mirrors `Layer`'s `[projectId, order]` index
  shape).
- `@@index([batchId])` — fetching every member of one Batch Run.

---

## Non-Persisted / Transient Concepts

- **Batch Run** is not its own table (Research Decision 2) — it is the set
  of `AnalysisRun` rows sharing a `batchId`, assembled by
  `listAnalysisRunsForProject`'s existing query with an optional
  `batchId` filter, not a new repository function.
- **Analysis History Entry** is not its own table either — it is exactly an
  `AnalysisRun` row, viewed through the existing project-scoped listing
  query; "history" names a UI/query concern, not a distinct persisted
  entity.
- **Heatmap** has no persisted representation at all (Research Decision 9)
  — it is computed and rendered entirely client-side from data already in
  the `useFeatures` React Query cache.
