
---

description: "Task list for feature implementation"
---

# Tasks: GIS Import & Export

**Input**: Design documents from `specs/005-import-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present and approved)

**Tests**: Explicitly requested (unit, repository, API, service, hook, store, integration, large-dataset/performance, accessibility) — included throughout.

**Organization**: This roadmap uses the 20-phase, layer-first structure explicitly requested for this feature (Foundation → Database → Repository → Route Handlers → Client Services → Hooks → Stores → per-format/per-story phases → UI → Performance → Accessibility → Testing → Docs), matching the structure 007-spatial-analysis used. Phases 8–15 carry `[US#]` story labels; Phases 1–7 and 16–20 are cross-cutting and carry no story label, per the Task Generation Rules' own convention.

---

## ⚠️ Architecture note (read before starting)

Several concepts named in this roadmap's phase outline are **not** separate Prisma models, repositories, or Route Handlers. They are already-decided consolidations in the **approved** research.md / data-model.md / contracts/. Tasks below implement each named concept faithfully to what it actually is, and say so explicitly wherever the outline's name could be read as "create a new table/file/endpoint."

| Outline name | What it actually is | Authority |
|---|---|---|
| `ImportHistory` model | **Not a table.** `ImportJob` rows *are* the import history — never deleted, and carrying every column FR-075 lists | research.md D15, data-model.md "Rejected models" |
| `ExportHistory` model | **Not a table.** `ExportJob` rows *are* the export history; its repository, route, and hook already exist from 007 | research.md D15 |
| `FileMetadata` model | **Not a table.** `ImportJob.fileName` / `fileSizeBytes` / `mimeType` / `fileHash` columns. **No file bytes are ever stored server-side** | research.md D2, D15 |
| `ExportStatistics` model | **Not a table.** `ExportJob.featureCount` / `layerCount` / `status` / `errorMessage` columns | research.md D15 |
| `ImportError` model | Named **`ImportIssue`** — it carries non-error categories too (`duplicate`, `repaired`, `sanitized_attribute`) | data-model.md |
| `HistoryRepository`, `FileRepository` | **Not separate files.** History listing = `importJobRepository.listImportsForProject` + the existing `exportLogRepository.listExportsForProject`. There is no file repository because there is no file storage | research.md D2, contracts/repository-api.md |
| `ProgressService`, `ProgressStore` | **Not separate modules.** Progress is client-owned in `importStore`; the server-side read is `importService.get` | research.md D12 |
| Per-format import routes (`Import GeoJSON`, `Import Shapefile`, …) | **One format-agnostic endpoint pair.** All five formats are parsed in the **browser** and reach the server as identical normalized chunks via `POST /api/imports/:id/chunks` | research.md D2, D3 |
| Per-format export routes (`Export GeoJSON`, `Export PDF`, …) | **No server-side export endpoints exist or are added.** Export runs entirely client-side; `POST /api/projects/:id/exports` *logs a finished attempt*, it never drives one | 007 research D10, preserved by research.md D21 |

**Never modified by this feature**: `src/server/repositories/featureRepository.ts` (research.md D5), `POST /api/layers/:layerId/features/import` (Map Editing's small-file path), `GET /api/layers/:layerId/features`, and `next.config.ts`'s CSP (research.md D7, D18).

---

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[Story]**: US1–US10 per spec.md, applied only to Phases 8–15; Phases 1–7 / 16–20 carry no story label
- Every task lists exact file paths and the fields required by this roadmap: **Priority, User Story, Files, Goal, Acceptance Criteria** (traceable to a spec.md FR-/SC- id), **Verification, Dependencies**

### Checkpoint command convention

Every phase ends with a checkpoint task running:

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
```

Phases containing Prisma changes additionally run `npx prisma validate && npx prisma generate`, plus `npx prisma migrate dev` locally (`npx prisma migrate deploy` is the CI/production form — see plan.md Deployment Notes).

**`npm run test:e2e` is not applicable**: this repository has no end-to-end harness (`package.json` defines `dev`, `build`, `start`, `lint`, `test`, `test:db:up`, `test:db:down` only). Browser-level scenarios are covered by the Vitest + React Testing Library integration tier and by the manual quickstart.md walkthroughs in Phase 20. Database-backed tests require `npm run test:db:up` first and skip if unavailable.

---

## Phase 1: Foundation

**Purpose**: Constants, shared types, Zod contract schemas, file/geometry/projection/progress utilities, error mapping, query keys, module scaffold, and environment validation that every later phase builds on.

- [X] T001 Add import constants module
  - **Priority**: Must-have
  - **User Story**: None (cross-cutting)
  - **Files**: `src/features/import-export/types/importExport.constants.ts` (new)
  - **Goal**: Define `IMPORT_CHUNK_SIZE` (1000), `IMPORT_WORKER_THRESHOLD` (5000 features), `IMPORT_MAX_FILE_BYTES` default (50 MB), `IMPORT_MAX_PERSISTED_ISSUES` (1000), `IMPORT_INLINE_ISSUE_LIMIT` (100), `ARCHIVE_MAX_EXPANSION_RATIO` (100), `ARCHIVE_MAX_UNCOMPRESSED_BYTES` (500 MB), `ABANDONED_JOB_THRESHOLD_MS` (5 min), `IMPORT_PROGRESS_POLL_MS` (2000) as named typed constants — no magic numbers in later phases.
  - **Acceptance Criteria**: Every later task needing a chunk size, threshold, cap, or limit imports from this file (spec FR-058, FR-067, FR-069, FR-081, FR-083; research.md D3, D7, D16, D17).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T002 [P] Add export constants module
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/types/exportConstants.ts` (new)
  - **Goal**: Define `EXPORT_MIME_TYPES` and `EXPORT_FILE_EXTENSIONS` widened with `pdf`, `LARGE_EXPORT_FEATURE_THRESHOLD` (50 000), `PAGE_SIZES` (A4/A3/Letter dimensions in mm), and `CSV_FORMULA_PREFIXES` (`= + - @`) — re-exporting rather than re-declaring the two maps that already exist in `src/features/analysis/services/exportService.ts`.
  - **Acceptance Criteria**: No MIME/extension value is duplicated between this file and the existing analysis export service (Constitution: never duplicate code); `pdf` is present in both maps (FR-034).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T003 [P] Add shared GIS import/export types
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/types/importExport.types.ts` (new)
  - **Goal**: Declare `ImportSourceFormat`, `ImportMode`, `ImportStatus`, `ImportIssueCategory`, `NormalizedFeature`, `ParsedImport`, `PreflightResult`, `ColumnMapping`, `ExportSource`, `ExportOptions`, `PrintLayout`, and `CrsEntry` per data-model.md and contracts/client-api.md. Re-export the server-side `ImportJobRecord`/`ImportIssueRecord` shapes rather than restating them.
  - **Acceptance Criteria**: Zero `any`; every field of data-model.md's `ImportJob`, `ImportIssue`, and extended `ExportJob` has a corresponding TypeScript type (Constitution Principle II).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T004 [P] Add import validation Zod schemas
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/importJob.schema.ts` (new), `src/shared/contracts/importChunk.schema.ts` (new), `src/shared/contracts/importIssue.schema.ts` (new)
  - **Goal**: Implement `createImportJobSchema`, `completeImportJobSchema`, `importJobRecordSchema`, `commitImportChunkSchema` (with `IMPORT_CHUNK_MAX_FEATURES` = 1000 and `IMPORT_CHUNK_MAX_BYTES` = 8 MB), `importChunkResultSchema`, and `importIssueCategorySchema` exactly per contracts/api-contracts.md. **Reuse `geometrySchema` from `src/shared/contracts/geometry.schema.ts`** for feature geometry — do not restate structure or range rules.
  - **Acceptance Criteria**: Each module exports its `z.infer` type; `sourceCrs === "CUSTOM"` without `customCrsDefinition` fails via `.refine` (contracts/api-contracts.md §1); coordinate-range validation is relaxed when the job's source CRS is not 4326 (projected coordinates legitimately exceed ±180/±90).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T001, T003

- [X] T005 [P] Widen the export log schema
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/shared/contracts/exportLogRequest.schema.ts` (modify)
  - **Goal**: Add `"pdf"` to the `format` enum; add `scope` (`selection|layer|project`, default `"layer"`), `outputCrs` (optional, `^EPSG:\d{4,6}$`), and `layerCount` (optional positive int) per contracts/api-contracts.md §9. Retain the existing `.refine()` unchanged and add one rule: `scope === "project"` must carry neither `sourceAnalysisRunId` nor `sourceLayerId`.
  - **Acceptance Criteria**: Every existing caller of `logExportRequestSchema` (007's `useExportResult`) still type-checks with no edit (FR-034, FR-035, FR-041, FR-043).
  - **Verification**: `npx tsc --noEmit && npm run test -- exportLogRequest`
  - **Dependencies**: T003

- [X] T006 [P] Add file utilities (format detection, hashing, archive guards)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/utils/fileGuards.ts` (new)
  - **Goal**: Implement `detectFormat(file)` by **content** (magic bytes / structural probe), not extension; `hashFile(file)` (SHA-256 via SubtleCrypto); `assertFileSize(file)`; `assertArchiveEntryPath(name)` (rejects absolute paths and `..` segments); `assertExpansionRatio(compressed, uncompressed)`.
  - **Acceptance Criteria**: A `.geojson` file containing XML is rejected by `detectFormat` (FR-004); a `../../evil.shp` entry name is rejected (FR-082); a >100:1 ratio or >500 MB uncompressed total is rejected (FR-083); an oversized file is rejected before any read (FR-081).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T001

- [X] T007 [P] Add geometry utilities (ring repair, duplicate hashing)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/utils/repairGeometry.ts` (new), `src/features/import-export/utils/duplicateHash.ts` (new)
  - **Goal**: `closeUnclosedRing(geometry)` returns the repaired geometry plus a `repaired: boolean` flag where closure is unambiguous (FR-053). `hashFeature(geometry, attributes)` produces a stable digest over geometry plus the **sorted** attribute pair set, for in-file duplicate detection (research.md D8).
  - **Acceptance Criteria**: Two features with identical geometry and identical attributes hash equal regardless of attribute insertion order; a geometry-only match does **not** hash equal (spec Assumptions: duplicate definition); repair never alters a correctly-closed ring.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T008 [P] Add projection helpers / CRS catalog
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/crsCatalog.ts` (new)
  - **Goal**: Implement `CRS_CATALOG` (WGS84 EPSG:4326, Web Mercator EPSG:3857, plus ~15 common national grids as proj4 strings), `findCrs`, `parseCustomCrs` (proj4 **or** WKT via the already-installed `wkt-parser`), `previewTransform`, `isBboxPlausible`. Generalizes — and supersedes — `src/features/database/utils/reprojection.ts`.
  - **Acceptance Criteria**: **No network lookup of any kind** — `connect-src 'self'` in `next.config.ts` blocks epsg.io/spatialreference.org at runtime (research.md D4). Every function is pure and independently unit-testable. Used only for preview and export, never for a persisted transform.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T009 [P] Add progress and chunking helpers
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/importPipeline.ts` (new, partial — `chunkFeatures` + progress math only)
  - **Goal**: Implement `chunkFeatures(features, size = IMPORT_CHUNK_SIZE)` and `toProgress(processed, total)` returning both a percentage and a `processed of total` string, per FR-009.
  - **Acceptance Criteria**: `chunkFeatures` handles 0, 1, exactly `size`, and `size + 1` inputs correctly with no lost or duplicated feature; progress never exceeds 100% and never moves backwards.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T001, T003

- [X] T010 [P] Map import failures onto the existing error vocabulary
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/utils/importErrors.ts` (new)
  - **Goal**: Provide user-safe message builders per `ImportIssueCategory` and document the situation → `ApiErrorCode` mapping from contracts/api-contracts.md. **No new `ApiErrorCode` is added** — all nine existing codes in `src/shared/errors/apiError.ts` cover every situation (research.md D19).
  - **Acceptance Criteria**: `src/shared/errors/apiError.ts` is **not modified**; no message contains a stack trace, driver string, or internal identifier (FR-086); every category from data-model.md's `ImportIssue.category` list has a builder.
  - **Verification**: `npx tsc --noEmit && git diff --exit-code src/shared/errors/apiError.ts`
  - **Dependencies**: T003

- [X] T011 [P] Map export failures onto the existing error vocabulary
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/utils/exportErrors.ts` (new)
  - **Goal**: Provide user-safe messages for the export failure paths: empty scope ("nothing to export", FR-042), mixed-geometry Shapefile warning (FR-038), unserializable layer inside a project export, and PDF rasterization failure (research.md D11). Each maps to an existing `ApiErrorCode` where a server call is involved.
  - **Acceptance Criteria**: An empty-scope export produces a clear message and **no** file (FR-042); no new error code is introduced.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T012 [P] Add centralized React Query keys
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/queryKeys.ts` (new)
  - **Goal**: Implement `importJob`, `importIssues`, `importHistory`, `importHistoryList`, `exportHistoryList` exactly per contracts/client-api.md. The two `*List` prefixes are deliberately **one element shorter** than their parameterized counterparts.
  - **Acceptance Criteria**: No hook anywhere in this feature builds a key inline (Constitution Principle V). The doc comment states why the prefix keys are shorter — `invalidateQueries` matches by prefix, so a key ending in `undefined` would only match the no-params page, exactly the trap documented on `database/services/queryKeys.ts`'s `featuresList()`.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: None

- [X] T013 Scaffold the feature module and its shared entry points
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/index.ts` (new), `src/features/import-export/services/apiFetch.ts` (new), directory skeleton for `components/`, `hooks/`, `services/`, `services/parsers/`, `store/`, `types/`, `utils/`, `__tests__/fixtures/`
  - **Goal**: Create the module with the same internal structure `database`/`analysis`/`map` use. `apiFetch.ts` **re-exports** `@/features/database/services/apiFetch` — it is not reimplemented.
  - **Acceptance Criteria**: The barrel exports only services, hooks, store selectors, and components other features may consume. **No import in this module resolves through `@/features/database` or `@/features/analysis` barrels** — all cross-feature imports are deep, because those barrels pull Leaflet/geoman into every consumer (the hazard `analysis/services/exportService.ts` documents in its header).
  - **Verification**: `npx tsc --noEmit && npm run lint`
  - **Dependencies**: T001, T003

- [X] T014 Add environment validation for the upload limit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/config/` (modify the existing config module), `.env.example` (modify)
  - **Goal**: Read and validate `IMPORT_MAX_FILE_BYTES` server-side (optional, positive integer, default 50 MB) alongside the platform's other tunables, and document it in `.env.example`.
  - **Acceptance Criteria**: A malformed value fails fast at startup rather than at a user's first import; the value is **never** exposed via a `NEXT_PUBLIC_*` variable (Constitution Principle VI); the client's own limit constant (T001) is documented as the UX mirror of this server value.
  - **Verification**: `npx tsc --noEmit && npm run build`
  - **Dependencies**: T001

- [X] T015 Checkpoint (Phase 1)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm Foundation is complete and green before Phase 2 (Database) begins.
  - **Acceptance Criteria**: T001–T014 complete; no `TODO` or stub left in a non-test file from this phase; `src/shared/errors/apiError.ts` and `next.config.ts` are unmodified.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T001–T014

---

## Phase 2: Database

**Purpose**: Schema changes — add `ImportJob` and `ImportIssue`, extend `ExportJob`, add `Feature.importJobId`, indexes, relations, one additive migration, and test-seed support. Every `ImportHistory`/`ExportHistory`/`FileMetadata`/`ExportStatistics` item from the outline is implemented here as the data-model.md-approved consolidation — see the Architecture note above.

- [X] T016 Add the `ImportJob` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify)
  - **Goal**: Add `ImportJob` exactly per data-model.md — identity, `projectId`/`userId` (cascade), `targetLayerId` (**SetNull**) + `targetLayerName` snapshot, the four `file*` provenance columns, `sourceCrs` + `customCrsDefinition`, `mode`, `columnMapping` (Json), `status`, the five counters, `chunksCommitted`, `errorMessage`, `cancelRequestedAt`, `heartbeatAt`, and the timestamps.
  - **Acceptance Criteria**: `npx prisma validate` passes; `targetLayer` is `onDelete: SetNull` so a history entry outlives its layer (FR-079); the doc comment states that **no file bytes are stored** (research.md D2).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T003

- [X] T017 [P] Add the `ImportIssue` model (covers the outline's "ImportError")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `ImportIssue` per data-model.md — `importJobId` (**Cascade**), `sourcePosition`, `category`, `message`, `createdAt`. Named `ImportIssue` rather than `ImportError` because it also carries `duplicate`, `repaired`, and `sanitized_attribute`, which are reported and counted but are not failures.
  - **Acceptance Criteria**: `prisma validate` passes; the doc comment records the `IMPORT_MAX_PERSISTED_ISSUES` cap and states that `ImportJob`'s counters stay exact regardless (research.md D16, FR-057–059).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T018 [P] Extend the `ExportJob` model
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `scope String @default("layer")`, `outputCrs String?`, `layerCount Int?`. `format` is already a `String` column, so admitting `"pdf"` is a validation change only (T005), not a schema change.
  - **Acceptance Criteria**: **No existing `ExportJob` column is removed, renamed, or retyped**; existing rows need no backfill because `scope` is defaulted and the other two are nullable (FR-034, FR-035, FR-041).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T019 [P] Confirm import-history readiness (covers the outline's "ImportHistory model")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Per research.md D15, import history is a **query over `ImportJob`**, not a table. This task's concrete output is the `@@index([projectId, status, createdAt])` index that makes the status-filtered, newest-first history listing performant, plus a doc comment recording why `createdAt` is the third column.
  - **Acceptance Criteria**: **No `ImportHistory` table is created.** The doc comment reproduces the reasoning established on `AnalysisRun`: on `[projectId, status]` alone the planner prefers `[projectId, createdAt]` to satisfy the sort and then filters status row-by-row through the heap (FR-077).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T020 [P] Confirm export-history readiness (covers the outline's "ExportHistory model")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (verify only)
  - **Goal**: Verify `ExportJob`'s existing `@@index([projectId, createdAt])` already serves FR-077's newest-first paging and that `listExportsForProject` needs no new index.
  - **Acceptance Criteria**: **No `ExportHistory` table is created**; no new index is added to `ExportJob`; the verification is recorded in this task's completion note.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T018

- [X] T021 [P] Confirm file-metadata columns (covers the outline's "FileMetadata model")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (verify T016's output)
  - **Goal**: Verify `ImportJob.fileName` / `fileSizeBytes` / `mimeType` / `fileHash` fully cover FR-075's provenance requirement, and that no column anywhere holds file contents.
  - **Acceptance Criteria**: **No `FileMetadata` table is created**; no `Bytes` column exists in the schema; the doc comment states the hash is provenance-only and is never used to skip work (research.md D2).
  - **Verification**: `npx prisma validate && ! grep -q "Bytes" prisma/schema.prisma`
  - **Dependencies**: T016

- [X] T022 [P] Confirm export-statistics columns (covers the outline's "ExportStatistics model")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (verify T018's output)
  - **Goal**: Verify `ExportJob.featureCount` / `layerCount` / `status` / `errorMessage` fully cover FR-076's statistics requirement.
  - **Acceptance Criteria**: **No `ExportStatistics` table is created**; every field FR-076 enumerates resolves to a column on `ExportJob`.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T018

- [X] T023 Add `Feature.importJobId` provenance column
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `importJobId String?` with `importJob ImportJob? @relation(..., onDelete: SetNull)` per data-model.md. This is the mechanism that makes "Undo this import" exact.
  - **Acceptance Criteria**: The column is **nullable with no default**, so `createFeature`, `updateFeature`, `importFeatures`, and every analysis result-layer writer continue to work untouched; `SetNull` guarantees that deleting a history entry never deletes map data (FR-072, research.md D14).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016

- [X] T024 [P] Add the `Feature.importJobId` index
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `@@index([importJobId])` on `Feature`.
  - **Acceptance Criteria**: This index carries a hard requirement — without it, rolling back a 1 000-feature import inside a 500 000-feature layer is a sequential scan (data-model.md Indexes, FR-072).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T023

- [X] T025 [P] Add the remaining `ImportJob` indexes
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `@@index([projectId, createdAt])`, `@@index([userId])`, `@@index([targetLayerId])`. (`[projectId, status, createdAt]` lands in T019.)
  - **Acceptance Criteria**: All four `ImportJob` indexes from data-model.md's Indexes table are present.
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T016, T019

- [X] T026 [P] Add the `ImportIssue` index
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `@@index([importJobId, sourcePosition])` — serves both "list this job's issues in source order" and the cursor paging the issues endpoint uses.
  - **Acceptance Criteria**: `prisma validate` passes; the index covers both the filter and the sort in one scan (FR-058).
  - **Verification**: `npx prisma validate`
  - **Dependencies**: T017

- [X] T027 Add back-relations on `Project`, `User`, and `Layer`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/schema.prisma` (modify, same file as T016)
  - **Goal**: Add `Project.importJobs`, `User.importJobs`, and `Layer.targetOfImportJobs ImportJob[] @relation("ImportJobTargetLayer")` — the relation name matching `ExportJob`'s existing `"ExportJobSourceLayer"` convention.
  - **Acceptance Criteria**: Additive only — a Prisma back-relation generates no SQL and cannot affect any existing query; `prisma validate` passes.
  - **Verification**: `npx prisma validate && npx prisma generate`
  - **Dependencies**: T016, T023

- [X] T028 Generate the additive migration
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_add_import_jobs_and_export_scope/migration.sql` (new)
  - **Goal**: Generate one migration covering T016–T027: create `ImportJob` + `ImportIssue` with their indexes, add `Feature.importJobId` + FK + index, add the three `ExportJob` columns.
  - **Acceptance Criteria**: **No backfill statement appears** — every added column is nullable or defaulted (data-model.md Migration notes); no existing column is dropped or altered; the migration applies cleanly to a database seeded with pre-existing `Feature` and `ExportJob` rows.
  - **Verification**: `npm run test:db:up && npx prisma migrate dev --name add_import_jobs_and_export_scope`
  - **Dependencies**: T016–T027

- [X] T029 Hand-edit the `Feature` index for concurrent creation
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_add_import_jobs_and_export_scope/migration.sql` (modify)
  - **Goal**: Change the `Feature.importJobId` index statement to `CREATE INDEX CONCURRENTLY`, since Prisma Migrate does not emit it and `Feature` is the largest table in the schema.
  - **Acceptance Criteria**: The migration still applies cleanly locally; a comment in the SQL records why the statement was hand-edited (plan.md Deployment Notes). Note that `CONCURRENTLY` cannot run inside a transaction block — verify the migration is structured accordingly.
  - **Verification**: `npx prisma migrate reset --force && npx prisma migrate deploy`
  - **Dependencies**: T028

- [X] T030 [P] Assert the PostGIS EPSG catalog is populated
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `prisma/migrations/<timestamp>_add_import_jobs_and_export_scope/migration.sql` (modify)
  - **Goal**: Add a guard that fails the migration if `spatial_ref_sys` is empty, since every import's `ST_Transform` depends on it (research.md D4).
  - **Acceptance Criteria**: A misconfigured environment fails at migrate time with a clear message, not at a user's first import (data-model.md Migration notes).
  - **Verification**: `psql "$DATABASE_URL" -c 'SELECT count(*) FROM spatial_ref_sys;'` returns a count in the thousands
  - **Dependencies**: T028

- [X] T031 [P] Extend test seed and helpers for import fixtures
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/testHelpers.ts` (modify), `prisma/seed.ts` (modify if present)
  - **Goal**: Add helpers to create an `ImportJob` in a given state, attach features to it, and assert a layer's feature set — reusing the existing fixed `TEST_OWNER_ID` convention rather than introducing a second one.
  - **Acceptance Criteria**: Helpers work under `fileParallelism: false` (see `vitest.config.ts`'s comment on shared `TEST_OWNER_ID` and the process-wide rate-limit map); no existing helper's signature changes.
  - **Verification**: `npm run test -- testHelpers`
  - **Dependencies**: T028

- [X] T032 Checkpoint (Phase 2)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the schema is valid, the client is generated, and the migration applies before Phase 3 (Repository) begins.
  - **Acceptance Criteria**: T016–T031 complete; four models from the outline were deliberately **not** created and each is recorded as such (T019–T022); `git diff` shows no change to any existing model except the three additive `ExportJob` columns and the one additive `Feature` column.
  - **Verification**: `npx prisma validate && npx prisma generate && npx prisma migrate deploy && npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T016–T031

---

## Phase 3: Repository Layer

**Purpose**: `importJobRepository.ts` in full, plus the additive `exportLogRepository.ts` extension. The outline's "HistoryRepository" and "FileRepository" are implemented here as functions on the two existing/new repositories and as *nothing at all* respectively — see the Architecture note.

- [X] T033 Scaffold `importJobRepository` with its record types and role guards
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (new)
  - **Goal**: Declare `ImportJobRecord`, `ImportIssueRecord`, `ImportChunkFeature`, `ImportChunkResult`, the module constants (`IMPORT_MAX_PERSISTED_ISSUES`, `ABANDONED_JOB_THRESHOLD_MS`, `DEFAULT_LIMIT` 20, `MAX_LIMIT` 100), a private `toRecord` mapper, and a private `getJobScopedToRole(jobId, userId, minRole)` helper.
  - **Acceptance Criteria**: Follows `analysisRepository.ts`/`exportLogRepository.ts` conventions exactly — `assertProjectRole` before any read or write, shared error classes thrown (never HTTP responses), plain `*Record` returned (never a raw Prisma row). No raw Prisma row shape leaks past this file.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T028, T004
  
- [X] T034 Implement `createImportJob`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: Resolve the layer's `projectId`, `assertProjectRole(projectId, userId, "Editor")`, snapshot `layer.name` into `targetLayerName`, validate the CRS, persist up to `IMPORT_MAX_PERSISTED_ISSUES` preflight issues via one `createMany`, seed the counters from `preflightCounts`, and return the row in `status: "running"`.
  - **Acceptance Criteria**: `NotFoundError` for an unknown layer **or** a caller with no access (non-disclosure, matching `assertProjectRole`); `ValidationError` when `sourceCrs === "CUSTOM"` without a definition or when an `EPSG:` code has no `spatial_ref_sys` row; counters stay exact even when issues are capped (research.md D16; contracts/api-contracts.md §1).
  - **Verification**: `npm run test:db:up && npm run test -- importJobRepository.create`
  - **Dependencies**: T033

- [X] T035 Implement `commitImportChunk` — the set-based insert
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: Implement the core insert per contracts/repository-api.md: `INSERT … SELECT … FROM unnest($ids::text[], $geoms::text[])` with `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(v.geom), :srid), 4326)`, gated by `WHERE ST_IsValid(...)`, `RETURNING id`. Uses `ST_Transform(geom, :proj4Text)` instead when `customCrsDefinition` is set.
  - **Acceptance Criteria**: **Four statements per 1 000-feature chunk, not three per feature** — 100 000 features cost ~400 statements, not ~300 000 (research.md D5, SC-002). All SQL is a parameterized `Prisma.sql`/`$queryRaw` tagged template with **zero string concatenation** (Constitution Principle III). `featureRepository.importFeatures` is **not touched**.
  - **Verification**: `npm run test -- importJobRepository.chunk`
  - **Dependencies**: T034

- [X] T036 Add the existing-layer duplicate probe
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: Add the `NOT EXISTS` clause to T035's insert: `&&` bbox overlap (GiST-indexed) to narrow candidates, then `ST_OrderingEquals` plus an attribute-set difference to confirm.
  - **Acceptance Criteria**: `ST_OrderingEquals` is used, **not** `ST_Equals` — the spec defines a duplicate as byte-identical, and `ST_Equals` is a far more expensive point-set test (research.md D8). **No `contentHash` column is added to `Feature`.** A duplicate is counted in `duplicateCount`, separately from `rejectedCount` (FR-055, FR-056).
  - **Verification**: `npm run test -- importJobRepository.duplicates`
  - **Dependencies**: T035

- [X] T037 Attribute rejections to their specific cause
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: Derive rejections as `inputIds − RETURNING ids`, then re-probe **only those ids** with one `ST_IsValid` + `ST_IsValidReason` query to classify each as `invalid_topology` or `duplicate_in_layer`.
  - **Acceptance Criteria**: `ST_IsValidReason` never runs over the whole chunk, only over actual failures (plan.md Performance); every rejected feature carries its `sourcePosition` and a specific reason (FR-057, SC-005).
  - **Verification**: `npm run test -- importJobRepository.rejections`
  - **Dependencies**: T036

- [X] T038 Persist attributes, counters, heartbeat, and issues per chunk
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: Inside the same `$transaction`: `featureAttribute.createMany` for the ids that came back, one `importJob.update` for counters + `chunksCommitted` + `heartbeatAt`, and one capped `importIssue.createMany`. Reuse `propertiesToAttributes` from `src/shared/contracts/geoJsonImport.schema.ts` for the flattening rule.
  - **Acceptance Criteria**: The chunk is atomic — it lands whole or not at all; duplicate attribute keys are resolved **before** insert so `@@unique([featureId, key])` cannot fail the chunk (research.md D20); `importedCount + rejectedCount + duplicateCount` never exceeds `totalFeatures` (SC-006).
  - **Verification**: `npm run test -- importJobRepository.chunk`
  - **Dependencies**: T035, T037

- [X] T039 Make chunk commits idempotent and cancel-aware
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: Guard in order — `assertProjectRole` → `ConflictError` if `cancelRequestedAt !== null` → `ConflictError` if `status !== "running"` → return the recorded result without re-inserting when `chunkIndex <= chunksCommitted`.
  - **Acceptance Criteria**: A replayed chunk after a network blip commits **nothing new** (research.md D3); the post-cancel rejection is the *server-side* half of cancellation, so a stale or hostile client cannot keep writing (research.md D13).
  - **Verification**: `npm run test -- importJobRepository.idempotency`
  - **Dependencies**: T038

- [X] T040 [P] Implement `completeImportJob`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: `Editor`; set `completedAt`, `status` (`succeeded`|`failed`), and `errorMessage`; freeze counters.
  - **Acceptance Criteria**: `ConflictError` if already terminal (contracts/api-contracts.md §3); the `running → succeeded|failed` transition matches data-model.md's state diagram.
  - **Verification**: `npm run test -- importJobRepository.complete`
  - **Dependencies**: T039

- [X] T041 [P] Implement `cancelImportJob`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: `Editor`; set `cancelRequestedAt` and `status: "cancelled"`. **Chunks already committed remain** — the confirmed design decision (spec Assumptions).
  - **Acceptance Criteria**: A cancel on an already-terminal job is a **no-op success, not an error**, deliberately mirroring `analysisRepository.cancelRun`'s first guard. **No `pg_cancel_backend`** — the longest statement here is one chunk insert, so a chunk-boundary check meets SC-004's 2-second target (research.md D13).
  - **Verification**: `npm run test -- importJobRepository.cancel`
  - **Dependencies**: T039

- [X] T042 Implement `rollbackImportJob`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: `Editor`; in one transaction run `DELETE FROM "Feature" WHERE "importJobId" = :id` (index-backed) and set `status: "rolled_back"`; return the deleted count.
  - **Acceptance Criteria**: Reachable from `succeeded`, `failed`, **and** `cancelled`; `ConflictError` on a second rollback; `FeatureAttribute`/`FeatureStyle` cascade via existing FKs; **a feature added concurrently by another user to the same layer survives** — the predicate is row-level provenance, not a time window (FR-072, SC-011, research.md D14).
  - **Verification**: `npm run test -- importJobRepository.rollback`
  - **Dependencies**: T039

- [X] T043 Implement `getImportJobById` and the abandoned-job sweep
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: `Viewer` read. Add module-private `sweepAbandonedJobs(projectId)` — one `updateMany` setting `status: "failed"` where `status = "running"` and `heartbeatAt < now − ABANDONED_JOB_THRESHOLD_MS` — and call it before returning.
  - **Acceptance Criteria**: A job whose tab closed reaches a terminal state rather than showing "running" forever (FR-074); **no cron, scheduler, or background process is introduced** — reading history is the only moment a stale job can be observed, so it is the moment it is resolved (research.md D17); rollback stays available on the swept job.
  - **Verification**: `npm run test -- importJobRepository.sweep`
  - **Dependencies**: T039

- [X] T044 [P] Implement `listImportsForProject` (covers the outline's "HistoryRepository")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: `Viewer`; cursor-paginated, newest first, optional `status` filter, `DEFAULT_LIMIT` 20 / `MAX_LIMIT` 100 — matching `listExportsForProject` exactly. Runs the sweep first.
  - **Acceptance Criteria**: **No separate history repository file is created.** Paging neither skips nor duplicates entries (FR-077); a view-only member can read (FR-080); an entry whose layer was deleted returns `targetLayerId: null` with `targetLayerName` intact (FR-079).
  - **Verification**: `npm run test -- importJobRepository.list`
  - **Dependencies**: T043

- [X] T045 [P] Implement `listIssuesForJob`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify)
  - **Goal**: `Viewer`; ordered by `sourcePosition` via the `[importJobId, sourcePosition]` index; returns `totalPersisted` and `truncated` (`totalPersisted >= IMPORT_MAX_PERSISTED_ISSUES`).
  - **Acceptance Criteria**: `truncated: true` is how the UI honestly states that history holds the first 1 000 of a larger set (research.md D16, FR-058); default limit 100 matches FR-058's inline count.
  - **Verification**: `npm run test -- importJobRepository.issues`
  - **Dependencies**: T043

- [X] T046 Extend `exportLogRepository` additively (covers the outline's "ExportRepository")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/exportLogRepository.ts` (modify)
  - **Goal**: Widen `ExportFormat` with `"pdf"`, add `ExportScope`, and add `scope` / `outputCrs` / `layerCount` to `LogExportInput`. Keep the existing `ValidationError` for "at most one of `sourceAnalysisRunId`/`sourceLayerId`" and add one rule: `scope === "project"` must carry neither.
  - **Acceptance Criteria**: `logExport` and `listExportsForProject` keep their **signatures**; every existing caller (007's `useExportResult`) compiles and behaves unchanged; **no `FileRepository` is created** — there is no file storage (research.md D2).
  - **Verification**: `npm run test -- exportLogRepository`
  - **Dependencies**: T018, T005

- [X] T047 Repository test suite for Phases 2–3
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (new), `src/server/repositories/__tests__/exportLogRepository.test.ts` (modify)
  - **Goal**: Implement the full matrix in contracts/repository-api.md against the real ephemeral PostGIS database, skip-if-unavailable.
  - **Acceptance Criteria**: The two bolded cases are covered explicitly — **idempotent chunk replay** and **rollback isolation under a concurrent insert**; every role gate has a `Viewer → Forbidden` case; `ST_Transform` correctness is asserted against a known EPSG:27700 coordinate; the existing `exportLogRepository` tests pass **unmodified** except for added cases.
  - **Verification**: `npm run test:db:up && npm run test -- importJobRepository exportLogRepository`
  - **Dependencies**: T034–T046

- [X] T048 Checkpoint (Phase 3)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the repository layer is complete and green before Phase 4 (Route Handlers).
  - **Acceptance Criteria**: T033–T047 complete; `git diff --exit-code src/server/repositories/featureRepository.ts` shows **no change** (research.md D5).
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && git diff --exit-code src/server/repositories/featureRepository.ts`
  - **Dependencies**: T033–T047

---

## Phase 4: Route Handlers

**Purpose**: The eight new endpoints from contracts/api-contracts.md. Because all five formats are parsed in the browser and arrive as identical normalized chunks, there is **one format-agnostic endpoint pair**, not five import routes; and because export runs entirely client-side, there are **no export execution routes** — only the existing log route, whose schema T005 widened. T057–T067 implement the outline's per-format items as **API contract tests** proving each format traverses the shared path correctly.

Every handler follows the established shape: `getCurrentUser` → `assertWriteRateLimit` (writes only) → Zod `safeParse` → repository → local `respond()` with `logger.request` → `catch` → `handleRouteError`.

- [X] T049 `POST /api/layers/[layerId]/imports` — create job
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/layers/[layerId]/imports/route.ts` (new)
  - **Goal**: Validate with `createImportJobSchema`, rate-bucket `import:write`, delegate to `createImportJob`, return `201 { importJob }`.
  - **Acceptance Criteria**: Matches contracts/api-contracts.md §1 exactly; `totalFeatures` is trusted as a display denominator only — authoritative counts accumulate from what chunks actually commit.
  - **Verification**: `npm run test -- api/layers.imports`
  - **Dependencies**: T034, T004

- [X] T050 `POST /api/imports/[importJobId]/chunks` — commit chunk
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/imports/[importJobId]/chunks/route.ts` (new)
  - **Goal**: Validate with `commitImportChunkSchema`, rate-bucket `import:write`, delegate to `commitImportChunk`, return `200 { chunkIndex, committed, rejected, job }`.
  - **Acceptance Criteria**: This is the **security boundary** — because parsing is client-side, the handler assumes a hostile caller and re-validates geometry with `geometrySchema` and enforces `features.length <= 1000` and body `<= 8 MB` (research.md D18, Constitution Principle II). Returns `409 CONFLICT` after cancel or on a terminal job.
  - **Verification**: `npm run test -- api/imports.chunks`
  - **Dependencies**: T039, T004

- [X] T051 [P] `POST /api/imports/[importJobId]/complete`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/imports/[importJobId]/complete/route.ts` (new)
  - **Goal**: Validate with `completeImportJobSchema`, delegate to `completeImportJob`, return `200 { importJob }`.
  - **Acceptance Criteria**: `409 CONFLICT` if already terminal (contracts/api-contracts.md §3).
  - **Verification**: `npm run test -- api/imports.complete`
  - **Dependencies**: T040

- [X] T052 [P] `POST /api/imports/[importJobId]/cancel`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/imports/[importJobId]/cancel/route.ts` (new)
  - **Goal**: No request body; delegate to `cancelImportJob`; return `200 { importJob }` including the `importedCount` that FR-070 requires the summary to state.
  - **Acceptance Criteria**: Cancel on an already-terminal job is a **no-op success**, matching `POST /api/analysis/:runId/cancel`'s documented behavior.
  - **Verification**: `npm run test -- api/imports.cancel`
  - **Dependencies**: T041

- [X] T053 [P] `POST /api/imports/[importJobId]/rollback`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/imports/[importJobId]/rollback/route.ts` (new)
  - **Goal**: No request body; delegate to `rollbackImportJob`; return `200 { importJob, deletedFeatureCount }`.
  - **Acceptance Criteria**: `409 CONFLICT` on a second rollback (contracts/api-contracts.md §5); available from every terminal state including `succeeded` (FR-072).
  - **Verification**: `npm run test -- api/imports.rollback`
  - **Dependencies**: T042

- [X] T054 [P] `GET /api/imports/[importJobId]` — progress endpoint
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/imports/[importJobId]/route.ts` (new)
  - **Goal**: `Viewer`, unthrottled; delegate to `getImportJobById`; return `200 { importJob }`, applying the abandoned-job sweep on read.
  - **Acceptance Criteria**: A stale `running` job is returned as `failed` (FR-074); `404 NOT_FOUND` for an unknown job or a caller with no access.
  - **Verification**: `npm run test -- api/imports.get`
  - **Dependencies**: T043

- [X] T055 [P] `GET /api/imports/[importJobId]/issues`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/imports/[importJobId]/issues/route.ts` (new)
  - **Goal**: `Viewer`, unthrottled; `cursor`/`limit` (default 100, max 500); return `{ issues, nextCursor, totalPersisted, truncated }`.
  - **Acceptance Criteria**: A non-numeric or non-positive `limit` returns `400 INVALID_INPUT`, matching the existing exports route's validation of the same parameter (FR-058).
  - **Verification**: `npm run test -- api/imports.issues`
  - **Dependencies**: T045

- [X] T056 [P] `GET /api/projects/[projectId]/imports` — import history
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/imports/route.ts` (new)
  - **Goal**: `Viewer`, unthrottled; `cursor`/`limit`/`status`; return `{ imports, nextCursor }` newest first.
  - **Acceptance Criteria**: Mirrors `GET /api/projects/[projectId]/exports` structurally, including its `limit` validation branch (FR-077, FR-080).
  - **Verification**: `npm run test -- api/projects.imports`
  - **Dependencies**: T044

- [X] T057 [P] API contract test — GeoJSON import traverses the shared path
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/import.geojson.contract.test.ts` (new)
  - **Goal**: Post a GeoJSON-derived chunk set through create → chunks → complete and assert features land with attributes.
  - **Acceptance Criteria**: **No `Import GeoJSON` route exists or is created** — this test proves the format-agnostic endpoint handles it (research.md D2/D3, FR-001, FR-014).
  - **Verification**: `npm run test -- import.geojson.contract`
  - **Dependencies**: T049–T051

- [X] T058 [P] API contract test — Shapefile import traverses the shared path
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/import.shapefile.contract.test.ts` (new)
  - **Goal**: Post chunks carrying **untransformed EPSG:27700 coordinates** with `sourceCrs: "EPSG:27700"` and assert the stored geometry is EPSG:4326 at the correct position.
  - **Acceptance Criteria**: Proves server-side `ST_Transform` on the persisted path (research.md D4, FR-012, FR-019, SC-009).
  - **Verification**: `npm run test -- import.shapefile.contract`
  - **Dependencies**: T049–T051

- [X] T059 [P] API contract test — KML import traverses the shared path
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/import.kml.contract.test.ts` (new)
  - **Goal**: Post KML-derived chunks (name/description/folder-path attributes) and assert attribute preservation.
  - **Acceptance Criteria**: **No `Import KML` route exists** (FR-022–025).
  - **Verification**: `npm run test -- import.kml.contract`
  - **Dependencies**: T049–T051

- [X] T060 [P] API contract test — KMZ import traverses the shared path
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/import.kmz.contract.test.ts` (new)
  - **Goal**: Assert a KMZ-derived chunk set is byte-equivalent at the API boundary to its `.kml` equivalent — the archive is opened client-side, so the server sees no difference.
  - **Acceptance Criteria**: **No `Import KMZ` route exists** (FR-022).
  - **Verification**: `npm run test -- import.kmz.contract`
  - **Dependencies**: T059

- [X] T061 [P] API contract test — CSV import traverses the shared path
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/import.csv.contract.test.ts` (new)
  - **Goal**: Post CSV-derived point chunks with `columnMapping` set on the job and assert one point feature per row with non-coordinate columns as attributes.
  - **Acceptance Criteria**: **No `Import CSV` route exists**; `columnMapping` round-trips on the job record so a past import's interpretation is reproducible (FR-032, spec Key Entities).
  - **Verification**: `npm run test -- import.csv.contract`
  - **Dependencies**: T049–T051

- [X] T062 [P] Verify GeoJSON export needs no route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/export.log.contract.test.ts` (new)
  - **Goal**: Assert `POST /api/projects/:id/exports` accepts `format: "geojson"` with each `scope` and records `outputCrs`/`layerCount`.
  - **Acceptance Criteria**: **No export execution endpoint is created.** The route logs a finished attempt and never drives one — 007's research D10 preserved verbatim (FR-043).
  - **Verification**: `npm run test -- export.log.contract`
  - **Dependencies**: T046, T005

- [X] T063 [P] Verify Shapefile export needs no route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/export.log.contract.test.ts` (modify)
  - **Goal**: Add the `format: "shapefile"` case to T062's suite.
  - **Acceptance Criteria**: Accepted with every scope; `scope: "project"` with a source id is rejected as `INVALID_INPUT`.
  - **Verification**: `npm run test -- export.log.contract`
  - **Dependencies**: T062

- [X] T064 [P] Verify KML export needs no route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/export.log.contract.test.ts` (modify)
  - **Goal**: Add the `format: "kml"` case.
  - **Acceptance Criteria**: Accepted; the pre-existing 007 call shape (no `scope`) still succeeds and defaults to `"layer"`.
  - **Verification**: `npm run test -- export.log.contract`
  - **Dependencies**: T062

- [X] T065 [P] Verify CSV export needs no route
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/export.log.contract.test.ts` (modify)
  - **Goal**: Add the `format: "csv"` case.
  - **Acceptance Criteria**: Accepted with every scope.
  - **Verification**: `npm run test -- export.log.contract`
  - **Dependencies**: T062

- [X] T066 [P] Verify PDF export logging
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/export.log.contract.test.ts` (modify)
  - **Goal**: Add the `format: "pdf"` case — the one genuinely new value in the widened enum.
  - **Acceptance Criteria**: `"pdf"` is accepted and persisted; **no PDF is generated server-side** (research.md D11, FR-034).
  - **Verification**: `npm run test -- export.log.contract`
  - **Dependencies**: T062

- [X] T067 [P] Verify the existing export history route is unchanged
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/projects/[projectId]/exports/route.ts` (verify only)
  - **Goal**: Confirm `GET`/`POST` need **no code change** — only their Zod schema was widened (T005).
  - **Acceptance Criteria**: `git diff --exit-code src/app/api/projects/[projectId]/exports/route.ts` shows no change (contracts/api-contracts.md §9).
  - **Verification**: `git diff --exit-code src/app/api/projects/\[projectId\]/exports/route.ts && npm run test -- api/projects.exports`
  - **Dependencies**: T005, T046

- [X] T068 Zod validation audit across the eight new handlers
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All eight files from T049–T056 (verify)
  - **Goal**: Confirm every handler `safeParse`s its body/query **before** the value is used for anything, including a database call.
  - **Acceptance Criteria**: No handler passes `await request.json()` output to a repository unvalidated (Constitution Principle II, VI); every write handler calls `assertWriteRateLimit` before any repository access; every `GET` is unthrottled.
  - **Verification**: `npm run lint && npm run test -- api/imports api/layers.imports api/projects.imports`
  - **Dependencies**: T049–T056

- [X] T069 Error mapping audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All eight files from T049–T056 (verify), `src/shared/errors/apiError.ts` (verify unchanged)
  - **Goal**: Confirm every handler funnels its catch block through `handleRouteError` and that the situation → code table in contracts/api-contracts.md holds.
  - **Acceptance Criteria**: **`src/shared/errors/apiError.ts` is unmodified** — no new `ApiErrorCode` (research.md D19); no raw stack trace or driver string reaches a response body (FR-086).
  - **Verification**: `git diff --exit-code src/shared/errors/apiError.ts && npm run test -- api/imports`
  - **Dependencies**: T068

- [X] T070 Checkpoint (Phase 4)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the API surface is complete and green before Phase 5 (Client Services).
  - **Acceptance Criteria**: T049–T069 complete; exactly **eight** new route files exist under `src/app/api/`; `POST /api/layers/[layerId]/features/import` and `GET /api/layers/[layerId]/features` are unmodified.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && git diff --exit-code src/app/api/layers/\[layerId\]/features/`
  - **Dependencies**: T049–T069

---

## Phase 5: Client Services

**Purpose**: The service layer — the only code in this feature permitted to call `fetch` or run a format writer. The outline's "HistoryService" and "ProgressService" are functions on `importService`, not separate modules (see the Architecture note).

- [X] T071 Implement `importService`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/importService.ts` (new)
  - **Goal**: Thin wrappers over the eight endpoints — `create`, `commitChunk`, `complete`, `cancel`, `rollback`, `get`, `listIssues`, `listForProject` — using the re-exported `apiFetch`. Request/response types come from the `z.infer`s of T004's schemas.
  - **Acceptance Criteria**: **No business logic** (Constitution Principle I) — no retry, no sequencing, no validation beyond request shaping. `listForProject` covers the outline's "HistoryService" and `get` covers "ProgressService"; **neither is a separate file**.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T013, T049–T056

- [X] T072 Move the format writers out of the analysis feature
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/exportWriters.ts` (new), `src/features/analysis/services/exportService.ts` (modify)
  - **Goal**: Move `buildCsv`, `buildKml`, `buildShapefile`, `forEachFeaturePage`, `toCsvField`, `escapeXml`, and the KML geometry serializers into `exportWriters.ts`, preserving their behavior exactly — including the page-streamed reads, the honest `(pagesLoaded, pagesLoaded + 1)` progress heuristic, and the buffered-CSV rationale (a CSV header must list every column before the first row, and the full key set is only known after the last page).
  - **Acceptance Criteria**: **Zero duplication** — no writer exists in two places (research.md D21); imports of `featureService` remain deep (`@/features/database/services/featureService`), never through the barrel.
  - **Verification**: `npx tsc --noEmit && npm run test -- exportService`
  - **Dependencies**: T013

- [X] T073 Add the re-export shim so 007 keeps working
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/services/exportService.ts` (modify)
  - **Goal**: Re-export the moved writers and keep `exportAnalysisResult` resolving to the same function, so 007's `useExportResult` and Result Panel compile and behave identically with **no edit**.
  - **Acceptance Criteria**: `git diff --exit-code src/features/analysis/hooks/useExportHistory.ts` shows no change; 007's existing export tests pass **unmodified** (plan.md Testing Strategy regression guard).
  - **Verification**: `npm run test -- exportService useExportHistory`
  - **Dependencies**: T072

- [X] T074 Implement `importPipeline` orchestration
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/importPipeline.ts` (modify — completes T009)
  - **Goal**: Implement `runPreflight(file, options)` — spawn the worker, route to the right parser, collect `PreflightResult` (`totalFeatures`, exact `rejected`/`duplicate`/`repaired` counts, the **full uncapped** issue list, detected CRS, transformed bbox).
  - **Acceptance Criteria**: The full issue list is held in memory and is the source of FR-058's in-session download; the transformed bbox feeds FR-064's preview; **no network call happens during preflight** so abandoning at the gate writes nothing (FR-005, FR-011).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T009, T075

- [X] T075 Implement the parser Web Worker
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/importParser.worker.ts` (new)
  - **Goal**: A module worker that `await import()`s exactly one parser per format, runs the preflight checks, and posts normalized chunks of `IMPORT_CHUNK_SIZE` back — **never retaining the full feature array**.
  - **Acceptance Criteria**: Constructed as `new Worker(new URL("./importParser.worker.ts", import.meta.url), { type: "module" })`. **A `blob:` worker must not be used and no worker-helper library may be introduced**: `next.config.ts` sets `script-src 'self' 'unsafe-inline'` with no `worker-src`, so `worker-src` falls back through `child-src` to `script-src`, and `blob:` is absent — `URL.createObjectURL` workers are blocked at runtime in production (research.md D7). **The CSP must not be modified to accommodate one.**
  - **Verification**: `npx tsc --noEmit && npm run build`
  - **Dependencies**: T013, T001

- [X] T076 [P] Implement `geoJsonParser`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/parsers/geoJsonParser.ts` (new)
  - **Goal**: Parse a GeoJSON file to `ParsedImport`. Root must be `FeatureCollection`; non-scalar `properties` values flatten to compact JSON text (FR-016).
  - **Acceptance Criteria**: A non-`FeatureCollection` root is rejected with a message stating the expected structure (FR-014); null properties are omitted, not stringified as `"null"` (FR-015); no new dependency — this parser uses `JSON.parse` only.
  - **Verification**: `npm run test -- geoJsonParser`
  - **Dependencies**: T003

- [X] T077 [P] Implement `shapefileParser` scaffold
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (new)
  - **Goal**: Declare the `ParseFile` signature and the `shpjs` dynamic-import boundary. Full behavior lands in Phase 9.
  - **Acceptance Criteria**: Signature identical to the other three parsers so the pipeline stays format-agnostic downstream (contracts/client-api.md).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T078 [P] Implement `kmlParser` scaffold
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (new)
  - **Goal**: Declare the signature and the `@tmcw/togeojson` + `jszip` dynamic-import boundary. Full behavior lands in Phase 10.
  - **Acceptance Criteria**: Signature identical to the other parsers.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T079 [P] Implement `csvParser` scaffold
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/parsers/csvParser.ts` (new)
  - **Goal**: Declare the signature and the `papaparse` dynamic-import boundary. Full behavior lands in Phase 11.
  - **Acceptance Criteria**: Signature identical to the other parsers.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T080 [P] Implement `downloadBlob`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/downloadBlob.ts` (new)
  - **Goal**: Centralize the anchor-click + `URL.revokeObjectURL` pattern currently inline in `useExportLayer`.
  - **Acceptance Criteria**: **`file-saver` is deliberately not added** — a six-line utility covers it and Principle V's dependency budget is spent on the six packages that do work nothing in the codebase can already do (research.md D10, plan.md Complexity Tracking). The object URL is always revoked.
  - **Verification**: `npx tsc --noEmit && npm run test -- downloadBlob`
  - **Dependencies**: T013

- [X] T081 [P] Implement the `pdfExport` service scaffold
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/pdfExport.ts` (new)
  - **Goal**: Declare `PrintLayout`, `exportMapAsPdf`, `canRasterize`, and the `jspdf` + `html2canvas` dynamic-import boundary. Full behavior lands in Phase 13.
  - **Acceptance Criteria**: Both libraries are behind `await import()` (Constitution Principle V).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T082 Implement chunk retry handling
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/importPipeline.ts` (modify)
  - **Goal**: Retry a failed `commitChunk` with bounded exponential backoff (3 attempts), relying on the server's `(importJobId, chunkIndex)` idempotency so a retry after a partially-applied request cannot double-insert.
  - **Acceptance Criteria**: A `409 CONFLICT` (cancelled/terminal) is **not** retried; a `429 RATE_LIMITED` is retried after a delay; a retried chunk commits nothing new (research.md D3; quickstart.md "Network drop mid-import").
  - **Verification**: `npm run test -- importPipeline.retry`
  - **Dependencies**: T071, T039

- [X] T083 [P] Implement attribute sanitization
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/utils/sanitizeAttributes.ts` (new)
  - **Goal**: Strip control characters, resolve empty and duplicate keys deterministically, truncate over-length values, and return the list of transformations applied. Composes with — does not modify — `propertiesToAttributes` from `geoJsonImport.schema.ts`.
  - **Acceptance Criteria**: `src/shared/contracts/geoJsonImport.schema.ts` is **not modified**, so Map Editing's existing import path is untouched (research.md D20); every transformation is reported as a `sanitized_attribute` or `truncated_value` issue (FR-054).
  - **Verification**: `npm run test -- sanitizeAttributes`
  - **Dependencies**: T003

- [X] T084 Service unit tests for Phase 5
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/__tests__/importService.test.ts` (new), `.../importPipeline.test.ts` (new), `.../exportWriters.test.ts` (new), `.../downloadBlob.test.ts` (new)
  - **Goal**: Unit-test request shaping, chunking boundaries, retry/backoff semantics, writer output shape, and the download side effect.
  - **Acceptance Criteria**: All pass; co-located under `__tests__/` (Constitution Principle VII); no test shares mutable global state.
  - **Verification**: `npm run test -- import-export/services`
  - **Dependencies**: T071–T083

- [X] T085 Checkpoint (Phase 5)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the service layer is complete and green before Phase 6 (Hooks).
  - **Acceptance Criteria**: T071–T084 complete; no service file imports React or a Zustand store; `npm run build` emits the worker as a same-origin chunk under `/_next/static/`.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T071–T084

---

## Phase 6: React Query Hooks

**Purpose**: Orchestration — the only layer permitted to sequence mutations. The outline's "useExportHistory" is 007's existing hook, reused.

- [X] T086 Implement `useImport` — the orchestrator
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImport.ts` (new)
  - **Goal**: Expose `preflight`, `confirm`, `cancel`, `rollback`, `reset`. `confirm` calls `importService.create` then loops `commitChunk`, updating `importStore.progress` as each resolves.
  - **Acceptance Criteria**: This is the **only** place the import sequence lives (Constitution Principle I); `preflight` performs **no network call**, so abandoning at the gate writes nothing (FR-005, FR-011); progress updates at least once per chunk (FR-009, FR-069).
  - **Verification**: `npm run test -- useImport`
  - **Dependencies**: T071, T074, T101

- [X] T087 [P] Implement `useImportProgress`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImportProgress.ts` (new)
  - **Goal**: `useQuery` on `importService.get` with `refetchInterval: IMPORT_PROGRESS_POLL_MS`, **enabled only when this tab is not the driver**.
  - **Acceptance Criteria**: A tab running its own import reads progress from the store and issues **zero** polling requests — it already holds numerator and denominator (research.md D12). Polling is the baseline; the SSE endpoint 006 added is **not** used.
  - **Verification**: `npm run test -- useImportProgress`
  - **Dependencies**: T071, T012

- [X] T088 [P] Implement `useImportHistory`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImportHistory.ts` (new)
  - **Goal**: Cursor-paginated `useQuery` on `importService.listForProject`, modeled directly on the existing `useExportHistory`.
  - **Acceptance Criteria**: Uses `queryKeys.importHistory`; paging neither skips nor duplicates (FR-077).
  - **Verification**: `npm run test -- useImportHistory`
  - **Dependencies**: T071, T012

- [X] T089 [P] Implement `useImportIssues`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImportIssues.ts` (new)
  - **Goal**: Cursor-paginated `useQuery` on `importService.listIssues`, surfacing `truncated`.
  - **Acceptance Criteria**: Default limit 100 matches FR-058's inline count; `truncated` is exposed so the UI can state the 1 000-row history limit honestly.
  - **Verification**: `npm run test -- useImportIssues`
  - **Dependencies**: T071, T012

- [X] T090 Implement `useExport`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useExport.ts` (new)
  - **Goal**: Run the client-side export, call `downloadBlob`, then log the outcome via `POST /api/projects/:id/exports` on **both** success and failure — the try/catch/log shape `useExportResult` already established.
  - **Acceptance Criteria**: History never misses an attempt, successful or failed (FR-043); invalidates `queryKeys.exportHistoryList` on settle.
  - **Verification**: `npm run test -- useExport`
  - **Dependencies**: T072, T080, T005

- [X] T091 [P] Reuse the existing export-history hook
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/analysis/hooks/useExportHistory.ts` (verify only)
  - **Goal**: Confirm 007's `useExportHistory` covers FR-076 export-history reads with no change, and consume it from this feature by deep import.
  - **Acceptance Criteria**: **No duplicate export-history hook is created** (Constitution: never duplicate code); `git diff --exit-code` on that file shows no change.
  - **Verification**: `git diff --exit-code src/features/analysis/hooks/useExportHistory.ts`
  - **Dependencies**: T046

- [X] T092 [P] Implement `usePrintExport`
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/usePrintExport.ts` (new)
  - **Goal**: Own `PrintLayout` state, the live preview, `exportMapAsPdf`, and the `window.print()` fallback path.
  - **Acceptance Criteria**: Cancel leaves the map view exactly as it was and produces no download (FR-050).
  - **Verification**: `npm run test -- usePrintExport`
  - **Dependencies**: T081, T102

- [X] T093 Wire the cancel mutation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImport.ts` (modify)
  - **Goal**: On cancel, abort the in-flight chunk loop via an `AbortController` **and** call `importService.cancel` so the server refuses any request already in flight.
  - **Acceptance Criteria**: Chunk POSTs stop within 2 seconds of the user's action (SC-004); the server-side rejection is what makes this a guarantee rather than client politeness (research.md D13).
  - **Verification**: `npm run test -- useImport.cancel`
  - **Dependencies**: T086, T052

- [X] T094 Wire the rollback mutation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImport.ts` (modify)
  - **Goal**: Expose `rollback(jobId)` calling `importService.rollback`, then invalidate both the history list and the layer's feature list.
  - **Acceptance Criteria**: Available from every terminal state including `succeeded` (FR-072); the map reflects the removal without a manual refresh.
  - **Verification**: `npm run test -- useImport.rollback`
  - **Dependencies**: T086, T053

- [X] T095 Implement cache invalidation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImport.ts` (modify), `src/features/import-export/hooks/useExport.ts` (modify)
  - **Goal**: On settle, invalidate `queryKeys.importHistoryList(projectId)` **and** the existing `database` feature's `queryKeys.featuresList(layerId)` (deep import from `@/features/database/services/queryKeys`).
  - **Acceptance Criteria**: Imported features appear on the map with no manual refresh; the **prefix** key is used so every cached cursor page is invalidated, not only the no-params page — the trap documented at length on `featuresList()`.
  - **Verification**: `npm run test -- useImport.invalidation`
  - **Dependencies**: T086, T090, T012

- [X] T096 Implement Strict-mode auto-rollback
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/useImport.ts` (modify)
  - **Goal**: In Strict mode, the first chunk returning a non-empty `rejected[]` triggers an immediate `rollback` instead of `complete`.
  - **Acceptance Criteria**: The observable outcome is exactly all-or-nothing — nothing net-written, layer count unchanged, summary explaining why (FR-006, research.md D6). Lenient remains the default (FR-006).
  - **Verification**: `npm run test -- useImport.strict`
  - **Dependencies**: T094

- [X] T097 [P] Add the hooks barrel
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/index.ts` (new), `src/features/import-export/index.ts` (modify)
  - **Goal**: Export the seven hooks through the feature barrel.
  - **Acceptance Criteria**: The barrel exports no component that transitively imports Leaflet into a data-only consumer.
  - **Verification**: `npx tsc --noEmit && npm run lint`
  - **Dependencies**: T086–T092

- [X] T098 Hook tests — import lifecycle
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/__tests__/useImport.test.tsx` (new)
  - **Goal**: Cover the happy path, Strict-mode auto-rollback, cancel aborting further chunks, retry idempotency, and invalidation.
  - **Acceptance Criteria**: All pass; each test uses a fresh `QueryClient` so no cache leaks between cases.
  - **Verification**: `npm run test -- useImport`
  - **Dependencies**: T086–T096

- [X] T099 [P] Hook tests — progress, history, issues, export
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/__tests__/useImportProgress.test.tsx` (new), `.../useImportHistory.test.tsx` (new), `.../useImportIssues.test.tsx` (new), `.../useExport.test.tsx` (new)
  - **Goal**: Assert `useImportProgress` polls **only** when not the driver; history/issues paging; and that `useExport` logs on both success and failure.
  - **Acceptance Criteria**: All pass; the "polls only when not the driver" assertion checks request count, not just behavior.
  - **Verification**: `npm run test -- import-export/hooks`
  - **Dependencies**: T087–T090

- [X] T100 Checkpoint (Phase 6)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the hook layer is complete and green before Phase 7 (Stores).
  - **Acceptance Criteria**: T086–T099 complete; no hook builds a query key inline; no hook calls `fetch` directly.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T086–T099

---

## Phase 7: Zustand Stores

**Purpose**: UI/session state only. The outline's "ProgressStore" is a slice of `importStore`; "HistoryStore" does not exist because history is server state owned by React Query (see the Architecture note).

- [X] T101 Implement `importStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/importStore.ts` (new)
  - **Goal**: Hold `file`, `sourceFormat`, `step`, `preflight`, `crs`, `columnMapping`, `mode`, `progress`, `activeJobId`, `summary` per contracts/client-api.md.
  - **Acceptance Criteria**: **`ImportJobRecord`s from the server are never copied here** (Constitution: State Management — server state must not be shadowed). `preflight` is the one client-held artifact and was never server state; the doc comment says so and explains it enables FR-058's uncapped in-session download.
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T102 [P] Implement `exportStore`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/exportStore.ts` (new)
  - **Goal**: Hold `scope`, `format`, `outputCrs`, `printLayout`, `isDialogOpen`.
  - **Acceptance Criteria**: **Selection membership is read from Map Editing's existing selection store, not duplicated here** (contracts/client-api.md).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T103 Add the progress slice (covers the outline's "ProgressStore")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/importStore.ts` (modify)
  - **Goal**: Add `setProgress`, `clearProgress`, and a `progressPercent` selector.
  - **Acceptance Criteria**: **No separate progress store file is created** — progress is one concern of one import and splitting it would let the two drift (research.md D12).
  - **Verification**: `npm run test -- importStore`
  - **Dependencies**: T101

- [X] T104 Confirm history needs no store (covers the outline's "HistoryStore")
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/importStore.ts` (verify)
  - **Goal**: Verify no history array, page cache, or `ImportJobRecord` collection exists in either store.
  - **Acceptance Criteria**: **No `historyStore.ts` is created.** History is server state and lives in React Query (`useImportHistory`, `useExportHistory`) — copying it into Zustand would be exactly the shadow cache the Constitution forbids.
  - **Verification**: `! grep -rq "ImportJobRecord\[\]" src/features/import-export/store/`
  - **Dependencies**: T101, T088

- [X] T105 Implement the step-machine actions
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/importStore.ts` (modify)
  - **Goal**: Named actions for `idle → parsing → mapping → crs → confirming → running → done`, each rejecting an illegal transition.
  - **Acceptance Criteria**: No component mutates store internals directly (Constitution Principle I); `mapping` is skipped for non-CSV formats; the `confirming` step is the FR-005 gate.
  - **Verification**: `npm run test -- importStore.steps`
  - **Dependencies**: T101

- [X] T106 [P] Add narrow selectors
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/importStore.ts` (modify), `src/features/import-export/store/exportStore.ts` (modify)
  - **Goal**: Export per-field selectors so components subscribe to the minimum state they render.
  - **Acceptance Criteria**: No component subscribes to the whole store object (Constitution Principle V — avoid unnecessary re-renders); a progress tick re-renders only the progress component.
  - **Verification**: `npm run test -- importStore.selectors`
  - **Dependencies**: T103, T102

- [X] T107 Decide and document persistence
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/importStore.ts` (modify — doc comment)
  - **Goal**: Record that **neither store is persisted**. A `File` handle cannot be serialized; a persisted half-finished preflight would be stale and misleading; and cross-session recovery is already served by the `ImportJob` row plus `useImportProgress` (research.md D12, D17).
  - **Acceptance Criteria**: **No `zustand/middleware` `persist` wrapper is added**; the rationale is in the doc comment so a later contributor does not add one.
  - **Verification**: `! grep -rq "persist(" src/features/import-export/store/`
  - **Dependencies**: T101, T102

- [X] T108 [P] Implement reset semantics
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/importStore.ts` (modify)
  - **Goal**: `reset()` returns the store to `idle` and releases the `File` reference and the preflight issue list so a 100 000-issue array is garbage-collectable.
  - **Acceptance Criteria**: Closing the dialog after a large import releases the retained memory (plan.md Performance — memory).
  - **Verification**: `npm run test -- importStore.reset`
  - **Dependencies**: T105

- [X] T109 [P] Add the store barrel
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/index.ts` (modify)
  - **Goal**: Export `useImportStore` and `useExportStore` through the feature barrel.
  - **Acceptance Criteria**: Naming follows the `useXStore` in `xStore.ts` convention (Constitution: Naming Conventions).
  - **Verification**: `npx tsc --noEmit && npm run lint`
  - **Dependencies**: T101, T102

- [X] T110 `importStore` tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/__tests__/importStore.test.ts` (new)
  - **Goal**: Cover every step transition (legal and illegal), progress updates, reset, and the no-shadow-cache assertion.
  - **Acceptance Criteria**: All pass; no test shares mutable state with another (Constitution Principle VII).
  - **Verification**: `npm run test -- importStore`
  - **Dependencies**: T103–T108

- [X] T111 [P] `exportStore` tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/__tests__/exportStore.test.ts` (new)
  - **Goal**: Cover scope/format/CRS/layout changes and dialog open-close.
  - **Acceptance Criteria**: All pass; a test asserts the store holds no selection array.
  - **Verification**: `npm run test -- exportStore`
  - **Dependencies**: T102, T106

- [X] T112 Checkpoint (Phase 7)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the store layer is complete and green before the per-format phases.
  - **Acceptance Criteria**: T101–T111 complete; exactly **two** store files exist; no `persist` middleware; no server state shadowed.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T101–T111

---

## Phase 8: GeoJSON Import (Priority: P1) 🎯 MVP — User Story 1

**Goal**: A user selects a layer, chooses a `.geojson` file, reviews a validation summary, confirms, watches progress, and ends with the file's features **appended** alongside what was already there.

**Independent test**: Import a `.geojson` with mixed Point/LineString/Polygon features into a layer that already holds features; verify all new features appear, pre-existing features are untouched, attributes survive, and the summary counts are correct.

- [X] T113 [US1] Implement `FileDropZone`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/FileDropZone.tsx` (new)
  - **Goal**: Keyboard-operable file input plus drag-and-drop, running T006's size and content-type guards before any read.
  - **Acceptance Criteria**: An oversized file is rejected with the limit stated, **before** upload begins (FR-081); retains the hidden-`<input type="file">` + labelled-button pattern already used in `ImportExportControls` so keyboard activation works (FR-087).
  - **Verification**: `npm run test -- FileDropZone`
  - **Dependencies**: T006, T013

- [X] T114 [US1] Wire content-based format detection
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/FileDropZone.tsx` (modify), `src/features/import-export/services/importPipeline.ts` (modify)
  - **Goal**: Route the selected file to its parser by `detectFormat`'s **content** verdict, not its extension.
  - **Acceptance Criteria**: A `.txt` renamed `.geojson` and a `.geojson` containing XML are both rejected with a specific message, **with no network request issued** (FR-004; quickstart.md §1 "Verify rejection paths").
  - **Verification**: `npm run test -- importPipeline.formatDetect`
  - **Dependencies**: T113, T006

- [X] T115 [US1] Run the GeoJSON preflight in the worker
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/services/importParser.worker.ts` (modify), `src/features/import-export/services/parsers/geoJsonParser.ts` (modify)
  - **Goal**: Parse, validate with `geometrySchema`, repair rings, sanitize attributes, hash for in-file duplicates, and emit `PreflightResult` plus normalized chunks.
  - **Acceptance Criteria**: The whole file is validated before the confirmation gate (FR-005); counts are exact and `imported + rejected + duplicate` sums to `totalFeatures` (SC-006); the worker never retains the full feature array.
  - **Verification**: `npm run test -- geoJsonParser importPipeline`
  - **Dependencies**: T075, T076, T007, T083

- [X] T116 [US1] Map GeoJSON properties to feature attributes
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/services/parsers/geoJsonParser.ts` (modify)
  - **Goal**: Reuse `propertiesToAttributes` from `geoJsonImport.schema.ts` for the flattening rule; flatten nested/object values to compact JSON text.
  - **Acceptance Criteria**: String, numeric, and boolean properties are preserved and retrievable; **null properties are omitted, not stored as the text `"null"`** (FR-015); nested objects survive as text rather than being dropped (FR-016); `geoJsonImport.schema.ts` is **not modified**.
  - **Verification**: `npm run test -- geoJsonParser.properties`
  - **Dependencies**: T115

- [X] T117 [US1] Map and validate GeoJSON geometry
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/services/parsers/geoJsonParser.ts` (modify)
  - **Goal**: Accept only the platform's six geometry types; reject anything else by name.
  - **Acceptance Criteria**: A `GeometryCollection` is reported as an unsupported geometry type naming the type (FR-013); a `null` geometry is reported as invalid and never silently stored; coordinates at exactly ±180/±90 are **accepted** (quickstart.md "Coordinate extremes").
  - **Verification**: `npm run test -- geoJsonParser.geometry`
  - **Dependencies**: T115

- [X] T118 [US1] Implement the `ImportDialog` stepper shell
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (new)
  - **Goal**: A shadcn `Dialog` driving `importStore`'s step machine: file → format → CRS → (CSV mapping) → preview → confirm.
  - **Acceptance Criteria**: Presentational only — no fetch, no business logic inline (Constitution Principle I); reuses `src/shared/components/ui/dialog` rather than a hand-rolled modal.
  - **Verification**: `npm run test -- ImportDialog`
  - **Dependencies**: T105, T113

- [X] T119 [US1] Implement the confirmation gate and summary preview
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (modify)
  - **Goal**: Show total read / to-import / rejected / duplicate / repaired before anything is written, with Confirm and Cancel.
  - **Acceptance Criteria**: Abandoning here writes **nothing** and issues no network request (FR-011); the counts shown are the preflight's exact counts (FR-005, FR-010).
  - **Verification**: `npm run test -- ImportDialog.gate`
  - **Dependencies**: T118, T115

- [X] T120 [US1] Wire the chunked commit
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (modify), `src/features/import-export/hooks/useImport.ts` (modify)
  - **Goal**: On confirm, create the job and stream chunks through `useImport.confirm`.
  - **Acceptance Criteria**: Features are **appended** — the pre-existing features in the target layer are unmodified and none is deleted (FR-003, the spec's central invariant); the layer's count increases by exactly the imported count.
  - **Verification**: `npm run test -- useImport.append`
  - **Dependencies**: T086, T119

- [X] T121 [US1] Implement `ImportProgress`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/ImportProgress.tsx` (new)
  - **Goal**: A native `<progress>` with `aria-valuenow`/`aria-valuemax`, a percentage **and** a features-processed-of-total readout, a polite live region, and a Cancel button.
  - **Acceptance Criteria**: Advances at least once per chunk (FR-069) and at least once every 3 s for any import over 3 s (SC-003); progress is never conveyed by width or colour alone (FR-089).
  - **Verification**: `npm run test -- ImportProgress`
  - **Dependencies**: T103, T118

- [X] T122 [US1] Implement `ImportSummaryPanel`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/ImportSummaryPanel.tsx` (new)
  - **Goal**: Final counts — total read, imported, rejected, skipped-as-duplicate, repaired — plus elapsed time and an "Undo this import" action.
  - **Acceptance Criteria**: The three outcome counts always sum to the total read, so no source feature is silently unaccounted for (FR-010, SC-006).
  - **Verification**: `npm run test -- ImportSummaryPanel`
  - **Dependencies**: T120, T094

- [X] T123 [US1] Assert the append-only invariant
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/__tests__/appendOnly.integration.test.ts` (new)
  - **Goal**: Import into a layer holding 10 features and assert the layer holds 35 afterwards with the original 10 byte-identical.
  - **Acceptance Criteria**: **No import path deletes, overwrites, replaces, or truncates existing features** (FR-003); the test also asserts no `DELETE` is issued during a normal import.
  - **Verification**: `npm run test:db:up && npm run test -- appendOnly`
  - **Dependencies**: T120

- [X] T124 [US1] Rewrite `ImportExportControls` as a dialog launcher
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/database/components/ImportExportControls.tsx` (modify)
  - **Goal**: Replace the inline GeoJSON and loose-file Shapefile handlers with buttons that open `ImportDialog` / `ExportDialog`.
  - **Acceptance Criteria**: Sanctioned by the spec — the existing Map Editing import/export controls are "replaced with the fuller interchange interface rather than duplicated." **No import/export logic remains in this file.** Its existing ARIA labels and the large-import confirmation affordance are preserved.
  - **Verification**: `npm run test -- ImportExportControls`
  - **Dependencies**: T118

- [X] T125 [P] [US1] GeoJSON unit tests
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/__tests__/fixtures/parcels.geojson` (new), `src/features/import-export/services/parsers/__tests__/geoJsonParser.test.ts` (new)
  - **Goal**: Fixture per quickstart.md — 25 features, mixed geometry, string/numeric/null properties — plus parser unit tests.
  - **Acceptance Criteria**: All pass; the fixture is committed and reused by T127.
  - **Verification**: `npm run test -- geoJsonParser`
  - **Dependencies**: T116, T117

- [X] T126 [P] [US1] GeoJSON component tests
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/__tests__/ImportDialog.test.tsx` (new), `.../FileDropZone.test.tsx` (new), `.../ImportProgress.test.tsx` (new), `.../ImportSummaryPanel.test.tsx` (new)
  - **Goal**: Cover conditional rendering, the confirmation gate, ARIA state, and the cancel affordance.
  - **Acceptance Criteria**: All pass; each component with conditional rendering or ARIA state has a test (Constitution Principle VII).
  - **Verification**: `npm run test -- import-export/components`
  - **Dependencies**: T118–T122

- [X] T127 [US1] GeoJSON integration test
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/__tests__/geoJsonImport.integration.test.ts` (new)
  - **Goal**: End-to-end against the real test database — file → preflight → confirm → chunks → complete → features queryable.
  - **Acceptance Criteria**: A 1 000-feature import completes well within SC-001's 30-second budget including validation and confirmation.
  - **Verification**: `npm run test:db:up && npm run test -- geoJsonImport.integration`
  - **Dependencies**: T120, T125

- [X] T128 [US1] Checkpoint (Phase 8) — MVP import gate
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US1 is independently demonstrable end-to-end.
  - **Acceptance Criteria**: quickstart.md §1 passes by hand in a browser; T113–T127 complete; Map Editing's existing import path still works via its untouched endpoint.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T113–T127

---

## Phase 9: Shapefile Import (Priority: P2) — User Story 2

**Goal**: A single ZIP uploads, its components are found automatically, attributes and projection are honoured, and features import.

**Independent test**: Upload one `.zip` containing `.shp`/`.shx`/`.dbf`/`.prj` and verify features import with attributes and correct positioning without selecting individual component files.

- [X] T129 [US2] Add the `shpjs` dependency
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `package.json` (modify)
  - **Goal**: Add `shpjs` and its types.
  - **Acceptance Criteria**: Imported only via `await import()` inside the worker (Constitution Principle V); recorded for the Phase 17 bundle-analyzer gate; `@mapbox/shp-write` (the **writer**) is left untouched.
  - **Verification**: `npm install && npx tsc --noEmit`
  - **Dependencies**: T077

- [X] T130 [US2] Implement ZIP-based Shapefile parsing
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Accept the ZIP `ArrayBuffer` whole and let `shpjs` resolve the component set internally.
  - **Acceptance Criteria**: The user selects **one** file and is never asked to multi-select components (FR-017) — the workflow the current loose-file path exists to eliminate.
  - **Verification**: `npm run test -- shapefileParser`
  - **Dependencies**: T129

- [X] T131 [P] [US2] Resolve components inside nested directories
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Locate the component set when it sits inside a folder within the archive.
  - **Acceptance Criteria**: quickstart.md §5 step 1's nested-folder fixture imports successfully (FR-017 acceptance scenario 2).
  - **Verification**: `npm run test -- shapefileParser.nested`
  - **Dependencies**: T130

- [X] T132 [P] [US2] Map DBF attributes to feature attributes
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Route DBF records through the same `propertiesToAttributes` + `sanitizeAttributes` path every other format uses.
  - **Acceptance Criteria**: Attribute names that collide after DBF's 10-character truncation are de-duplicated **deterministically** and the mapping is reported in the summary (FR-008, FR-021 acceptance scenario 6).
  - **Verification**: `npm run test -- shapefileParser.attributes`
  - **Dependencies**: T130, T083

- [X] T133 [P] [US2] Honour the `.cpg` text encoding
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify), `src/features/import-export/components/ImportDialog.tsx` (modify)
  - **Goal**: Apply the archive's declared encoding when present; offer an encoding selector when absent.
  - **Acceptance Criteria**: The `parcels_latin1.zip` fixture's accented values are **not** mojibake (FR-020, quickstart.md §5 step 3).
  - **Verification**: `npm run test -- shapefileParser.encoding`
  - **Dependencies**: T130

- [X] T134 [US2] Detect the source CRS from `.prj`
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Parse the `.prj` WKT and set `detectedCrs` on `ParsedImport`, so the job is created with the right `sourceCrs` and **no manual selection is required**.
  - **Acceptance Criteria**: The detected system is displayed to the user (FR-019, FR-061). The coordinates themselves are sent **untransformed** — the persisted transform is `ST_Transform`, server-side (research.md D4). `src/features/database/utils/reprojection.ts`'s client-side-then-persist behavior is **not** reproduced.
  - **Verification**: `npm run test -- shapefileParser.prj`
  - **Dependencies**: T130, T008

- [X] T135 [P] [US2] Reject an incomplete component set
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Detect a missing required component and reject the archive naming it.
  - **Acceptance Criteria**: A ZIP with the `.dbf` removed is rejected with a message naming the missing component (FR-018).
  - **Verification**: `npm run test -- shapefileParser.missing`
  - **Dependencies**: T130

- [X] T136 [US2] Handle archives containing multiple shapefiles
  - **Priority**: Should-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (modify), `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Present the discovered shapefiles and let the user pick one, or import each into its own layer.
  - **Acceptance Criteria**: The chooser is keyboard-operable and labelled (FR-021, FR-087).
  - **Verification**: `npm run test -- shapefileParser.multi`
  - **Dependencies**: T131

- [X] T137 [P] [US2] Enforce the zip-slip guard
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Run `assertArchiveEntryPath` over every entry name **before any entry is read**.
  - **Acceptance Criteria**: An archive containing `../../evil.shp` or an absolute path is rejected before extraction (FR-082).
  - **Verification**: `npm run test -- fileGuards.zipslip`
  - **Dependencies**: T130, T006

- [X] T138 [P] [US2] Enforce the zip-bomb guard
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/shapefileParser.ts` (modify)
  - **Goal**: Enforce `ARCHIVE_MAX_EXPANSION_RATIO` and `ARCHIVE_MAX_UNCOMPRESSED_BYTES` during extraction.
  - **Acceptance Criteria**: An archive exceeding either limit is rejected (FR-083); worker isolation means a pathological archive costs a worker, not the tab.
  - **Verification**: `npm run test -- fileGuards.zipbomb`
  - **Dependencies**: T130, T006

- [X] T139 [US2] Retire the superseded Shapefile path
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/database/services/shapefileImport.ts` (delete), `src/features/database/services/__tests__/shapefileImport.test.ts` (delete if present), `src/features/database/index.ts` (modify), `package.json` (modify — remove `shapefile`, `@types/shapefile`)
  - **Goal**: Remove the loose-file reader and its dependency once T140's parity tests pass.
  - **Acceptance Criteria**: **Do not start this task before T140 is green.** `convertShapefileToFeatures` is removed from the `database` barrel; no import of `shapefile` remains anywhere; `npm run build` succeeds.
  - **Verification**: `! grep -rq "from \"shapefile\"" src/ && npx tsc --noEmit && npm run build`
  - **Dependencies**: T140

- [X] T140 [US2] Parity fixture tests against the old reader
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/__tests__/shapefileParser.parity.test.ts` (new), `src/features/import-export/__tests__/fixtures/parcels_osgb.zip` (new), `.../parcels_latin1.zip` (new)
  - **Goal**: Assert `shpjs` produces the same feature count, geometry, and attribute values as the outgoing `shapefile`-based path for the same archives.
  - **Acceptance Criteria**: Parity holds on both fixtures before T139 deletes anything (plan.md Risks: "`shpjs` behaves differently from `shapefile`").
  - **Verification**: `npm run test -- shapefileParser.parity`
  - **Dependencies**: T130–T135

- [X] T141 [US2] Wire progress and summary for Shapefile
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/importPipeline.ts` (modify)
  - **Goal**: Route Shapefile preflight output through the same progress and summary path as GeoJSON.
  - **Acceptance Criteria**: **No format-specific progress or summary component exists** — the pipeline is format-agnostic downstream of the parser (contracts/client-api.md).
  - **Verification**: `npm run test -- importPipeline.shapefile`
  - **Dependencies**: T130, T121, T122

- [X] T142 [P] [US2] Shapefile unit tests
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/services/parsers/__tests__/shapefileParser.test.ts` (new)
  - **Goal**: Cover ZIP handling, nested directories, DBF attributes, `.cpg` encoding, `.prj` detection, missing components, and multi-shapefile archives.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm run test -- shapefileParser`
  - **Dependencies**: T130–T138

- [X] T143 [US2] Shapefile integration test
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: `src/features/import-export/__tests__/shapefileImport.integration.test.ts` (new)
  - **Goal**: End-to-end with `parcels_osgb.zip` against the real database, asserting stored SRID 4326 and correct real-world position.
  - **Acceptance Criteria**: Features land within 1 metre of true position (SC-009); `SELECT DISTINCT ST_SRID(geometry) FROM "Feature"` returns only 4326 (FR-012).
  - **Verification**: `npm run test:db:up && npm run test -- shapefileImport.integration`
  - **Dependencies**: T141, T140

- [X] T144 [US2] Checkpoint (Phase 9)
  - **Priority**: Must-have
  - **User Story**: US2
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US2 is independently demonstrable.
  - **Acceptance Criteria**: quickstart.md §5 passes by hand; T129–T143 complete; `shapefile` no longer appears in `package.json`.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T129–T143

---

## Phase 10: KML / KMZ Import (Priority: P3) — User Story 3

**Goal**: `.kml` and `.kmz` import with placemarks, paths, and polygons preserved along with their names, descriptions, and extended data.

**Independent test**: Import a `.kml` and its equivalent `.kmz`; verify both produce identical features with names and descriptions as attributes.

- [X] T145 [US3] Add the `@tmcw/togeojson` and `jszip` dependencies
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `package.json` (modify)
  - **Goal**: Add both packages (JSZip also serves the project-export archive in Phase 12).
  - **Acceptance Criteria**: Both behind `await import()`; recorded for the Phase 17 analyzer gate.
  - **Verification**: `npm install && npx tsc --noEmit`
  - **Dependencies**: T078

- [X] T146 [US3] Implement the KML parser
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (modify)
  - **Goal**: Parse `.kml` via `DOMParser` + `@tmcw/togeojson` to `ParsedImport`.
  - **Acceptance Criteria**: Returns the same `ParsedImport` shape as every other parser (FR-022).
  - **Verification**: `npm run test -- kmlParser`
  - **Dependencies**: T145

- [X] T147 [US3] Implement KMZ extraction
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (modify)
  - **Goal**: Unzip the KMZ with `jszip`, locate the enclosed document, and feed it to the KML path — applying T137/T138's zip-slip and expansion guards.
  - **Acceptance Criteria**: A `.kmz` produces the **same result** as its equivalent `.kml` (FR-022, quickstart.md §8 step 1).
  - **Verification**: `npm run test -- kmlParser.kmz`
  - **Dependencies**: T146, T137, T138

- [X] T148 [P] [US3] Preserve name, description, and extended data
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (modify)
  - **Goal**: Map `<name>`, `<description>`, and `<ExtendedData>` fields to feature attributes.
  - **Acceptance Criteria**: All three survive as retrievable attributes (FR-024).
  - **Verification**: `npm run test -- kmlParser.attributes`
  - **Dependencies**: T146

- [X] T149 [P] [US3] Preserve the KML folder path
  - **Priority**: Should-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (modify)
  - **Goal**: Record each feature's nested folder path as an attribute.
  - **Acceptance Criteria**: Features inside nested folders import successfully with the path present (FR-025).
  - **Verification**: `npm run test -- kmlParser.folders`
  - **Dependencies**: T146

- [X] T150 [P] [US3] Drop altitude from 3D coordinates
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (modify)
  - **Goal**: Discard the third ordinate and store 2D geometry, reporting the drop as an issue.
  - **Acceptance Criteria**: The geometry stores without error and the drop is reported (FR-026) — `geometrySchema`'s `position` tuple accepts exactly two ordinates, so an undropped altitude would fail validation.
  - **Verification**: `npm run test -- kmlParser.altitude`
  - **Dependencies**: T146

- [X] T151 [P] [US3] Report unsupported KML content as skipped
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (modify)
  - **Goal**: Detect image overlays, 3D models, and network links; report each as `unsupported_content` and continue.
  - **Acceptance Criteria**: Supported vector placemarks still import — **unsupported content must not fail the whole import** (FR-027).
  - **Verification**: `npm run test -- kmlParser.unsupported`
  - **Dependencies**: T146

- [X] T152 [US3] Map KML geometry types
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/kmlParser.ts` (modify)
  - **Goal**: Convert placemarks → Point, paths → LineString, polygons → Polygon, and `<MultiGeometry>` → the corresponding `Multi*` type.
  - **Acceptance Criteria**: Each becomes the corresponding platform geometry type (FR-023); anything outside the six supported types is rejected by name (FR-013).
  - **Verification**: `npm run test -- kmlParser.geometry`
  - **Dependencies**: T146

- [X] T153 [US3] Wire KML validation into the shared preflight
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/importParser.worker.ts` (modify)
  - **Goal**: Route KML/KMZ output through the same `geometrySchema` + repair + sanitize + duplicate-hash preflight as every other format.
  - **Acceptance Criteria**: **No KML-specific validation path exists** (research.md D6).
  - **Verification**: `npm run test -- importParser.worker`
  - **Dependencies**: T152

- [X] T154 [US3] Wire KML import end-to-end
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/importPipeline.ts` (modify)
  - **Goal**: Register `.kml`/`.kmz` in format detection and route to the parser.
  - **Acceptance Criteria**: The same dialog, progress, and summary components serve KML with no format-specific branch in the UI.
  - **Verification**: `npm run test -- importPipeline.kml`
  - **Dependencies**: T153

- [X] T155 [P] [US3] KML unit tests
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/__tests__/kmlParser.test.ts` (new), `src/features/import-export/__tests__/fixtures/sites.kml` (new), `.../sites.kmz` (new)
  - **Goal**: Fixtures per quickstart.md — placemarks, a path, a polygon, nested folders, 3D coordinates, one image overlay — plus unit tests.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm run test -- kmlParser`
  - **Dependencies**: T146–T152

- [X] T156 [P] [US3] KML integration test
  - **Priority**: Should-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/__tests__/kmlImport.integration.test.ts` (new)
  - **Goal**: End-to-end KML import against the real database.
  - **Acceptance Criteria**: Attributes and geometry types are correct in the stored rows.
  - **Verification**: `npm run test:db:up && npm run test -- kmlImport.integration`
  - **Dependencies**: T154, T155

- [X] T157 [US3] KML/KMZ equivalence test
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: `src/features/import-export/services/parsers/__tests__/kmlParser.parity.test.ts` (new)
  - **Goal**: Assert `sites.kml` and `sites.kmz` produce byte-identical `ParsedImport` output.
  - **Acceptance Criteria**: Identical feature count, geometry, and attributes (FR-022, quickstart.md §8 step 1).
  - **Verification**: `npm run test -- kmlParser.parity`
  - **Dependencies**: T155

- [X] T158 [US3] Checkpoint (Phase 10)
  - **Priority**: Must-have
  - **User Story**: US3
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US3 is independently demonstrable.
  - **Acceptance Criteria**: quickstart.md §8 passes by hand; T145–T157 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T145–T157

---

## Phase 11: CSV Import (Priority: P2) — User Story 4

**Goal**: A CSV uploads, the user maps latitude/longitude columns, reviews a preview, and imports point features with the remaining columns as attributes.

**Independent test**: Upload a CSV with headers, map the coordinate columns, confirm the preview, import, and verify each row became a point feature with the non-coordinate columns as attributes.

- [X] T159 [US4] Add the `papaparse` dependency
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `package.json` (modify)
  - **Goal**: Add `papaparse` and `@types/papaparse`.
  - **Acceptance Criteria**: Behind `await import()`; recorded for the Phase 17 analyzer gate.
  - **Verification**: `npm install && npx tsc --noEmit`
  - **Dependencies**: T079

- [X] T160 [US4] Implement CSV parsing with delimiter detection
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/services/parsers/csvParser.ts` (modify)
  - **Goal**: Parse with PapaParse's streaming mode, auto-detecting the delimiter and accepting an override.
  - **Acceptance Criteria**: A semicolon-delimited file parses correctly (FR-028, quickstart.md §6 step 4); BOM, `CRLF` endings, and trailing blank lines parse without spurious errors (spec Edge Cases).
  - **Verification**: `npm run test -- csvParser`
  - **Dependencies**: T159

- [X] T161 [P] [US4] Support headerless files
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/services/parsers/csvParser.ts` (modify)
  - **Goal**: When the user indicates no header row, address columns by position.
  - **Acceptance Criteria**: A headerless file imports successfully with positional column references (FR-030).
  - **Verification**: `npm run test -- csvParser.headerless`
  - **Dependencies**: T160

- [X] T162 [US4] Implement `CsvColumnMapper`
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/components/CsvColumnMapper.tsx` (new)
  - **Goal**: List the file's columns and require the user to designate latitude and longitude, plus delimiter and header-row controls.
  - **Acceptance Criteria**: All controls are labelled comboboxes with `aria-describedby` pointing at the preview, so a screen-reader user can complete the mapping unaided (FR-029, FR-091, SC-014).
  - **Verification**: `npm run test -- CsvColumnMapper`
  - **Dependencies**: T160, T118

- [X] T163 [P] [US4] Suggest coordinate columns
  - **Priority**: Should-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/utils/suggestCoordinateColumns.ts` (new)
  - **Goal**: Pre-select columns whose names indicate coordinates (`lat`, `latitude`, `y`, `lon`, `lng`, `longitude`, `x`), case-insensitively.
  - **Acceptance Criteria**: The suggestion is **overridable** — it pre-selects, never forces (FR-029 acceptance scenario 2).
  - **Verification**: `npm run test -- suggestCoordinateColumns`
  - **Dependencies**: T160

- [X] T164 [US4] Validate coordinates by line number
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/services/parsers/csvParser.ts` (modify)
  - **Goal**: Report a row with a missing, non-numeric, or out-of-range coordinate as an issue carrying its **1-based line number** in the source file.
  - **Acceptance Criteria**: The reported position is the line number the user can find in their own file (FR-033, data-model.md `sourcePosition`); range checks respect the selected source CRS, so projected coordinates are not falsely flagged.
  - **Verification**: `npm run test -- csvParser.validation`
  - **Dependencies**: T160

- [X] T165 [US4] Implement `ImportPreviewTable`
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/components/ImportPreviewTable.tsx` (new)
  - **Goal**: Show the first rows as a table alongside the coordinates the mapping will produce.
  - **Acceptance Criteria**: Rendered **before** any feature is written (FR-031); the table scrolls inside its own container rather than forcing horizontal page scroll (Constitution: Responsive Design).
  - **Verification**: `npm run test -- ImportPreviewTable`
  - **Dependencies**: T162

- [X] T166 [P] [US4] Create one point feature per row
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/services/parsers/csvParser.ts` (modify)
  - **Goal**: Emit a `Point` `NormalizedFeature` per valid data row.
  - **Acceptance Criteria**: CSV import produces **point features only** — WKT geometry columns are out of scope (spec Assumptions, FR-032).
  - **Verification**: `npm run test -- csvParser.features`
  - **Dependencies**: T164

- [X] T167 [P] [US4] Map non-coordinate columns to attributes
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/services/parsers/csvParser.ts` (modify)
  - **Goal**: Route every non-coordinate column through `sanitizeAttributes` into the shared attribute shape.
  - **Acceptance Criteria**: Every non-coordinate column becomes a retrievable attribute (FR-032); the `columnMapping` is persisted on the job so the interpretation is reproducible (spec Key Entities).
  - **Verification**: `npm run test -- csvParser.attributes`
  - **Dependencies**: T166, T083

- [X] T168 [US4] Wire CSV import end-to-end
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/services/importPipeline.ts` (modify), `src/features/import-export/components/ImportDialog.tsx` (modify)
  - **Goal**: Register `.csv` in format detection and insert the `mapping` step into the dialog's step machine for CSV only.
  - **Acceptance Criteria**: The `mapping` step is skipped for the other four formats (T105); `columnMapping` reaches `createImportJob` (contracts/api-contracts.md §1).
  - **Verification**: `npm run test -- importPipeline.csv`
  - **Dependencies**: T165, T167

- [X] T169 [P] [US4] CSV unit tests
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/services/parsers/__tests__/csvParser.test.ts` (new), `src/features/import-export/__tests__/fixtures/sites.csv` (new), `.../sites-semicolon.csv` (new), `.../sites-headerless.csv` (new)
  - **Goal**: Fixtures per quickstart.md — header row, `lat`/`lon`, two bad rows — plus parser unit tests.
  - **Acceptance Criteria**: All pass; bad rows are reported by line number.
  - **Verification**: `npm run test -- csvParser`
  - **Dependencies**: T160–T167

- [X] T170 [P] [US4] CSV component tests
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/components/__tests__/CsvColumnMapper.test.tsx` (new), `.../ImportPreviewTable.test.tsx` (new)
  - **Goal**: Cover column listing, suggestion override, delimiter/header controls, and preview rendering.
  - **Acceptance Criteria**: All pass; ARIA labelling is asserted.
  - **Verification**: `npm run test -- CsvColumnMapper ImportPreviewTable`
  - **Dependencies**: T162, T165

- [X] T171 [US4] CSV integration test
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: `src/features/import-export/__tests__/csvImport.integration.test.ts` (new)
  - **Goal**: End-to-end CSV import against the real database.
  - **Acceptance Criteria**: One point feature per valid row; bad rows reported by line number; `columnMapping` round-trips on the job record.
  - **Verification**: `npm run test:db:up && npm run test -- csvImport.integration`
  - **Dependencies**: T168, T169

- [X] T172 [US4] Checkpoint (Phase 11)
  - **Priority**: Must-have
  - **User Story**: US4
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US4 is independently demonstrable.
  - **Acceptance Criteria**: quickstart.md §6 passes by hand; T159–T171 complete; all five import formats now traverse the same chunked pipeline.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T159–T171

---

## Phase 12: Export Engine (Priority: P1) — User Story 5

**Goal**: The user chooses what to export (selection, layer, or project), a format, and an output CRS, and receives a file that opens correctly in standard desktop GIS software.

**Independent test**: With a mixed-geometry layer, export to each of GeoJSON, Shapefile, KML, and CSV and verify each opens in QGIS with the same feature count, geometry, and attributes.

- [X] T173 [US5] Verify the writers moved without behavior change
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (verify T072's output)
  - **Goal**: Confirm the moved writers preserve page-streamed reads, the `(pagesLoaded, pagesLoaded + 1)` progress heuristic, buffered CSV rows, and KML `MultiGeometry` handling.
  - **Acceptance Criteria**: 007's existing export tests pass **unmodified** (research.md D21; plan.md regression guard).
  - **Verification**: `npm run test -- exportService exportWriters`
  - **Dependencies**: T072, T073

- [X] T174 [US5] Verify the analysis re-export shim
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/analysis/services/exportService.ts` (verify), `src/features/analysis/hooks/useExportHistory.ts` (verify)
  - **Goal**: Confirm `exportAnalysisResult` still resolves to the same function and 007's Result Panel is unchanged.
  - **Acceptance Criteria**: `git diff --exit-code src/features/analysis/hooks/` shows no change; 007's Result Panel export still works in the browser.
  - **Verification**: `git diff --exit-code src/features/analysis/hooks/ && npm run test -- analysis`
  - **Dependencies**: T173

- [X] T175 [US5] Implement the `ExportSource` abstraction
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Introduce `{ kind: "layer", layerId } | { kind: "selection", featureIds } | { kind: "project", projectId }` and route every writer through one page-supplier that resolves it.
  - **Acceptance Criteria**: Each writer is written **once** and serves all three scopes — no per-scope duplication (FR-035, Constitution: never duplicate code).
  - **Verification**: `npx tsc --noEmit && npm run test -- exportWriters.source`
  - **Dependencies**: T173

- [X] T176 [P] [US5] GeoJSON writer with scope support
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Emit a valid `FeatureCollection` for any `ExportSource`, delegating to the existing `exportLayerAsGeoJson` for the layer case.
  - **Acceptance Criteria**: 500 features round-trip with every attribute under `properties` (FR-034, FR-036, quickstart.md §2 step 1).
  - **Verification**: `npm run test -- exportWriters.geojson`
  - **Dependencies**: T175

- [X] T177 [US5] CSV writer with formula neutralization
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Keep the existing one-row-per-feature, one-column-per-key, `geometry` column behavior, and add neutralization: a leading `=`, `+`, `-`, or `@` is prefixed with `'`.
  - **Acceptance Criteria**: The value is **preserved**, its executability is not — an attribute of `=1+1` shows as literal text in a spreadsheet (FR-040, quickstart.md §2). A feature missing an attribute gets an **empty cell**, never a shifted row (FR-039). This closes a genuine gap in the current writer.
  - **Verification**: `npm run test -- exportWriters.csv`
  - **Dependencies**: T175

- [X] T178 [P] [US5] KML writer with scope support
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Route the existing streamed KML writer through `ExportSource`.
  - **Acceptance Criteria**: Multi-part geometry still becomes one `<MultiGeometry>` placemark rather than several (the existing writer's documented behavior, preserved); attributes still carried as `<ExtendedData>`.
  - **Verification**: `npm run test -- exportWriters.kml`
  - **Dependencies**: T175

- [X] T179 [P] [US5] Shapefile writer with scope support
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Route the existing `@mapbox/shp-write` writer through `ExportSource`, keeping its lazy import.
  - **Acceptance Criteria**: Buffering is retained and its reason documented — a shapefile header records the geometry type and bounding box of the entire file, so it cannot be assembled progressively.
  - **Verification**: `npm run test -- exportWriters.shapefile`
  - **Dependencies**: T175

- [X] T180 [US5] Partition mixed geometry for Shapefile export
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify), `src/features/import-export/components/ExportDialog.tsx` (modify)
  - **Goal**: Group features by geometry type and emit one component set per type inside the archive, warning the user first.
  - **Acceptance Criteria**: The warning appears **before** the download begins, not after (FR-038); the archive contains one component set per geometry type present.
  - **Verification**: `npm run test -- exportWriters.mixedGeometry`
  - **Dependencies**: T179, T189

- [X] T181 [P] [US5] Implement selection scope
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Resolve `{ kind: "selection" }` by reading the ids from Map Editing's existing selection store.
  - **Acceptance Criteria**: The file contains **exactly** the selected features and no others (FR-035, quickstart.md §2 step 3); a selection spanning multiple layers produces one coherent file with the source layer recorded as an attribute (spec Edge Cases).
  - **Verification**: `npm run test -- exportWriters.selection`
  - **Dependencies**: T175

- [X] T182 [P] [US5] Implement layer scope
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Resolve `{ kind: "layer" }` via the existing cursor-paged `featureService.list`.
  - **Acceptance Criteria**: `GET /api/layers/:layerId/features` is used **unmodified** — no `srid` query parameter is added (contracts/api-contracts.md §10).
  - **Verification**: `npm run test -- exportWriters.layer && git diff --exit-code src/app/api/layers/\[layerId\]/features/route.ts`
  - **Dependencies**: T175

- [X] T183 [US5] Implement project scope with a ZIP archive
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Iterate the project's layers, write one file per layer named after the layer, and assemble a `jszip` archive.
  - **Acceptance Criteria**: A layer that fails to serialize is reported as failed while the others are still delivered (spec Edge Cases); layer names are sanitized for filesystem safety without colliding.
  - **Verification**: `npm run test -- exportWriters.project`
  - **Dependencies**: T175, T145

- [X] T184 [P] [US5] Emit the project-export manifest
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Add `manifest.json` listing layer names, feature counts, and the export timestamp.
  - **Acceptance Criteria**: Present in every project archive (FR-037, quickstart.md §2 step 4).
  - **Verification**: `npm run test -- exportWriters.manifest`
  - **Dependencies**: T183

- [X] T185 [P] [US5] Handle an empty export scope
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify), `src/features/import-export/utils/exportErrors.ts` (modify)
  - **Goal**: Detect a zero-feature scope and surface "nothing to export".
  - **Acceptance Criteria**: **No empty or malformed file is produced** (FR-042, quickstart.md "Empty export").
  - **Verification**: `npm run test -- exportWriters.empty`
  - **Dependencies**: T175, T011

- [X] T186 [US5] Apply the output-CRS transform
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Transform each page's coordinates to the chosen output CRS with proj4 as the page streams.
  - **Acceptance Criteria**: Constitution Principle IV compliant — an exported file is neither persisted platform state nor an authoritative server query result, so client-side transformation is permitted here (research.md D4). Transformation is applied per page, never by buffering the whole layer.
  - **Verification**: `npm run test -- exportWriters.crs`
  - **Dependencies**: T175, T008

- [X] T187 [P] [US5] Emit projection metadata where the format supports it
  - **Priority**: Should-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/exportWriters.ts` (modify)
  - **Goal**: Write a matching `.prj` into the Shapefile archive and a `crs` member into GeoJSON where the output CRS is not WGS84.
  - **Acceptance Criteria**: The Shapefile archive carries a `.prj` matching the selected output CRS (FR-041, quickstart.md §4 step 6).
  - **Verification**: `npm run test -- exportWriters.prj`
  - **Dependencies**: T186

- [X] T188 [US5] Log every export with its scope and CRS
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/hooks/useExport.ts` (modify)
  - **Goal**: Send `scope`, `outputCrs`, `layerCount`, and `featureCount` to `POST /api/projects/:id/exports` on both success and failure.
  - **Acceptance Criteria**: **Every** attempt is recorded, successful or failed (FR-043, SC-012); the existing route handler needs no change (T067).
  - **Verification**: `npm run test -- useExport.logging`
  - **Dependencies**: T090, T005

- [X] T189 [US5] Implement `ExportDialog`
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/components/ExportDialog.tsx` (new)
  - **Goal**: Scope selector, format selector, output-CRS selector, and the mixed-geometry warning.
  - **Acceptance Criteria**: Presentational only; reuses shadcn `Dialog`/`Select`; all controls keyboard-operable and labelled (FR-087).
  - **Verification**: `npm run test -- ExportDialog`
  - **Dependencies**: T102, T186

- [X] T190 [P] [US5] Wire the download side effect
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/hooks/useExport.ts` (modify)
  - **Goal**: Hand the produced `Blob` to `downloadBlob` with a format-appropriate filename and extension.
  - **Acceptance Criteria**: Filename derives from the layer/project name; the extension matches `EXPORT_FILE_EXTENSIONS`; the object URL is revoked.
  - **Verification**: `npm run test -- useExport.download`
  - **Dependencies**: T080, T090

- [X] T191 [P] [US5] Writer unit tests
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/services/__tests__/exportWriters.test.ts` (modify)
  - **Goal**: Cover all five formats × all three scopes, formula neutralization, mixed-geometry partitioning, manifest contents, empty scope, and CRS transformation.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm run test -- exportWriters`
  - **Dependencies**: T176–T187

- [X] T192 [US5] Export → import round-trip test
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/__tests__/roundTrip.integration.test.ts` (new)
  - **Goal**: Export a layer in each of the four vector formats, re-import each into a fresh layer, and compare.
  - **Acceptance Criteria**: **A round trip loses nothing** — identical feature count, geometry, and attribute values for all four formats (SC-007). This is the strongest single correctness signal in the feature.
  - **Verification**: `npm run test:db:up && npm run test -- roundTrip.integration`
  - **Dependencies**: T191, T127

- [ ] T193 [US5] External-tool verification checklist
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `specs/005-import-export/quickstart.md` (verify §2)
  - **Goal**: Open one exported file per vector format in QGIS and confirm geometry, attributes, and positioning.
  - **Acceptance Criteria**: Each opens successfully **with no manual correction** (SC-008). Manual task — record the QGIS version used.
  - **Verification**: Manual, per quickstart.md §2 "Verify externally"
  - **Dependencies**: T192

- [X] T194 [US5] Checkpoint (Phase 12)
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US5 is independently demonstrable — completing the P1 MVP alongside Phase 8.
  - **Acceptance Criteria**: quickstart.md §2 passes; T173–T193 complete; 007's analysis export still works unchanged.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T173–T193

---

## Phase 13: Print & PDF (Priority: P3) — User Story 6

**Goal**: A shareable map document — page size, orientation, title, north arrow, scale bar, legend, exact preview, printed or downloaded as PDF.

**Independent test**: Open the print dialog on a map with two visible layers, select A4 landscape with all elements enabled, and verify the downloaded PDF matches the preview.

- [X] T195 [US6] Add the `jspdf` and `html2canvas` dependencies
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `package.json` (modify)
  - **Goal**: Add both packages.
  - **Acceptance Criteria**: Both behind `await import()` so a user who never prints downloads neither; recorded for the Phase 17 analyzer gate.
  - **Verification**: `npm install && npx tsc --noEmit`
  - **Dependencies**: T081

- [X] T196 [US6] Add `crossOrigin` to the tile layer
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/map/components/MapContainer.tsx` (modify — **one line**)
  - **Goal**: Set `crossOrigin="anonymous"` on the `TileLayer`.
  - **Acceptance Criteria**: **This is the plan's only change to an already-implemented feature** (plan.md Complexity Tracking). Without it a canvas that has drawn OSM/Esri tiles is *tainted* and `toDataURL()` throws `SecurityError` — both providers send `Access-Control-Allow-Origin: *`, but the browser only records that if the request carried the attribute (research.md D11). No other prop or behavior in this file changes; the map renders identically.
  - **Verification**: `npm run test -- MapContainer && npm run build`
  - **Dependencies**: None

- [X] T197 [P] [US6] Define the `PrintLayout` type and defaults
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/types/importExport.types.ts` (modify), `src/features/import-export/types/exportConstants.ts` (modify)
  - **Goal**: `pageSize` (A4/A3/Letter), `orientation`, `title`, and the three element toggles, with page dimensions in millimetres.
  - **Acceptance Criteria**: Matches contracts/client-api.md; custom page dimensions and atlas output are **out of scope** (spec Out of Scope).
  - **Verification**: `npx tsc --noEmit`
  - **Dependencies**: T003

- [X] T198 [US6] Implement `PrintDialog`
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/components/PrintDialog.tsx` (new)
  - **Goal**: Page size and orientation controls, element toggles, title field, and the Print/Download actions.
  - **Acceptance Criteria**: All controls keyboard-operable and labelled (FR-087); state lives in `exportStore.printLayout`.
  - **Verification**: `npm run test -- PrintDialog`
  - **Dependencies**: T197, T102

- [X] T199 [US6] Implement `PrintPreview`
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/components/PrintPreview.tsx` (new)
  - **Goal**: Render a live preview of exactly the page area that will be produced.
  - **Acceptance Criteria**: The preview shows **exactly** the exported area — not an approximation (FR-044); it reflows immediately when page size or orientation changes (FR-045).
  - **Verification**: `npm run test -- PrintPreview`
  - **Dependencies**: T198

- [X] T200 [P] [US6] Implement page size and orientation
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/services/pdfExport.ts` (modify)
  - **Goal**: Map each page size × orientation to jsPDF's page geometry.
  - **Acceptance Criteria**: A4, A3, and Letter in both orientations produce a single page at the selected size (FR-045, FR-049).
  - **Verification**: `npm run test -- pdfExport.pageSize`
  - **Dependencies**: T195, T197

- [X] T201 [P] [US6] Render the title
  - **Priority**: Should-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/services/pdfExport.ts` (modify)
  - **Goal**: Draw the title as a jsPDF text element at its previewed position.
  - **Acceptance Criteria**: Text is **selectable** in the produced PDF, because it is a vector element rather than part of the raster (FR-046).
  - **Verification**: `npm run test -- pdfExport.title`
  - **Dependencies**: T200

- [X] T202 [P] [US6] Reuse the existing north arrow
  - **Priority**: Should-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/services/pdfExport.ts` (modify)
  - **Goal**: Draw the north arrow in the PDF from the same SVG path `src/features/database/components/NorthArrow.tsx` already renders on screen.
  - **Acceptance Criteria**: **`NorthArrow.tsx` is not modified or duplicated** — the map never rotates, so a fixed "up is north" indicator is all this needs, exactly as that component's doc comment states (FR-046).
  - **Verification**: `npm run test -- pdfExport.northArrow && git diff --exit-code src/features/database/components/NorthArrow.tsx`
  - **Dependencies**: T200

- [X] T203 [US6] Implement the `ScaleBar` component
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/components/ScaleBar.tsx` (new)
  - **Goal**: An on-screen scale bar reading the map's current scale and zoom.
  - **Acceptance Criteria**: Rendered in the preview at the position it will occupy in the PDF (FR-046).
  - **Verification**: `npm run test -- ScaleBar`
  - **Dependencies**: T199

- [X] T204 [US6] Make the scale bar ground-accurate
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/components/ScaleBar.tsx` (modify), `src/features/import-export/services/pdfExport.ts` (modify)
  - **Goal**: Compute ground distance from the exported view's scale and zoom, accounting for the Web Mercator latitude distortion, and draw it as a PDF vector.
  - **Acceptance Criteria**: Measured against a known distance on the map, the bar is accurate at the exported view's scale (FR-047, quickstart.md §10 step 4). Turf.js (already installed) may be used — this is transient display math, not persisted (Constitution Principle IV).
  - **Verification**: `npm run test -- ScaleBar.accuracy`
  - **Dependencies**: T203

- [X] T205 [US6] Implement `MapLegend`
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/components/MapLegend.tsx` (new)
  - **Goal**: List each **visible** layer with its symbology, reading visibility and style from Map Core's existing layer state.
  - **Acceptance Criteria**: Hidden layers are **omitted** (FR-048, quickstart.md §10 step 2); rendered as PDF vectors so labels stay crisp.
  - **Verification**: `npm run test -- MapLegend`
  - **Dependencies**: T199

- [X] T206 [US6] Rasterize the map pane
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/services/pdfExport.ts` (modify)
  - **Goal**: Capture the Leaflet map pane with `html2canvas` at 2× device scale.
  - **Acceptance Criteria**: The map appears at print-appropriate resolution rather than upscaled screen pixels (FR-049).
  - **Verification**: `npm run test -- pdfExport.raster`
  - **Dependencies**: T195, T196

- [X] T207 [US6] Compose raster and vector overlays
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/services/pdfExport.ts` (modify)
  - **Goal**: Place the raster on the page, then draw title, north arrow, scale bar, and legend as vectors on top at their previewed positions.
  - **Acceptance Criteria**: Overlay text is selectable and crisp at print resolution; positions match the preview exactly (FR-046, SC-013).
  - **Verification**: `npm run test -- pdfExport.compose`
  - **Dependencies**: T201–T206

- [X] T208 [US6] Implement `canRasterize` and the print fallback
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/services/pdfExport.ts` (modify), `src/app/globals.css` or the equivalent print stylesheet (modify)
  - **Goal**: Probe for a tainted canvas; on `SecurityError`, fall back to `window.print()` against a print stylesheet that hides application chrome.
  - **Acceptance Criteria**: The user still gets a correct page via the browser's own "Save as PDF" when rasterization fails — e.g. tiles cached before T196 (research.md D11, plan.md Risks). The failure is surfaced, never silent.
  - **Verification**: `npm run test -- pdfExport.fallback`
  - **Dependencies**: T207

- [X] T209 [US6] Implement the cancel path and PDF tests
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: `src/features/import-export/hooks/usePrintExport.ts` (modify), `src/features/import-export/components/__tests__/PrintDialog.test.tsx` (new), `.../PrintPreview.test.tsx` (new), `.../ScaleBar.test.tsx` (new), `.../MapLegend.test.tsx` (new)
  - **Goal**: Cancelling produces no download and leaves the map view untouched; component tests cover the dialog, preview, scale bar, and legend.
  - **Acceptance Criteria**: FR-050 satisfied; all tests pass; a PDF is produced within 15 s of confirmation (SC-013).
  - **Verification**: `npm run test -- PrintDialog PrintPreview ScaleBar MapLegend usePrintExport`
  - **Dependencies**: T208, T092

- [X] T210 [US6] Checkpoint (Phase 13)
  - **Priority**: Must-have
  - **User Story**: US6
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US6 is independently demonstrable.
  - **Acceptance Criteria**: quickstart.md §10 passes by hand including the tainted-canvas check; T195–T209 complete; `git diff src/features/map/` shows **exactly one** changed line.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T195–T209

---

## Phase 14: Coordinate Systems (Priority: P2) — User Story 8

**Goal**: Data in a projected or national CRS imports to the right real-world position, with a preview that catches a wrong CRS before anything is written.

**Independent test**: Import the same dataset as WGS84 and as Web Mercator with the correct source CRS selected; verify both land at the same real-world location.

- [X] T211 [US8] Build the CRS catalog
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/services/crsCatalog.ts` (modify — completes T008)
  - **Goal**: Populate `CRS_CATALOG` with WGS84, Web Mercator, and ~15 common national grids, each with authority code, display name, and proj4 string.
  - **Acceptance Criteria**: Every entry is a **bundled literal** — no runtime fetch, because `connect-src 'self'` blocks epsg.io and spatialreference.org (research.md D4, FR-060).
  - **Verification**: `npm run test -- crsCatalog`
  - **Dependencies**: T008

- [X] T212 [P] [US8] Implement `findCrs` and `parseCustomCrs`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/services/crsCatalog.ts` (modify)
  - **Goal**: Look up by authority code; parse a user-supplied proj4 or WKT definition using the already-installed `proj4` and `wkt-parser`.
  - **Acceptance Criteria**: An unparseable definition returns `null` and is **never partially applied** (FR-063).
  - **Verification**: `npm run test -- crsCatalog.parse`
  - **Dependencies**: T211

- [X] T213 [US8] Implement `CrsSelector`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/components/CrsSelector.tsx` (new)
  - **Goal**: A searchable combobox over the catalog, plus a custom-definition field.
  - **Acceptance Criteria**: Labelled with `aria-describedby` pointing at the preview so a screen-reader user can select a CRS unaided (FR-091, SC-014).
  - **Verification**: `npm run test -- CrsSelector`
  - **Dependencies**: T211, T118

- [X] T214 [P] [US8] Display the detected CRS
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/components/CrsSelector.tsx` (modify)
  - **Goal**: When `ParsedImport.detectedCrs` is set (e.g. from a Shapefile `.prj`), show it and pre-select it.
  - **Acceptance Criteria**: A Shapefile with a `.prj` requires **no manual selection** (FR-019, FR-061, quickstart.md §4 step 1).
  - **Verification**: `npm run test -- CrsSelector.detected`
  - **Dependencies**: T213, T134

- [X] T215 [P] [US8] Default to WGS84 when nothing is detected
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/components/CrsSelector.tsx` (modify)
  - **Goal**: Prompt for selection with WGS84 offered as the default when `detectedCrs` is null.
  - **Acceptance Criteria**: The user is asked rather than silently assumed-into (FR-062).
  - **Verification**: `npm run test -- CrsSelector.default`
  - **Dependencies**: T213

- [X] T216 [P] [US8] Verify Web Mercator support end-to-end
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/__tests__/crsWebMercator.integration.test.ts` (new)
  - **Goal**: Import an EPSG:3857 dataset and assert the features land at their correct geographic position.
  - **Acceptance Criteria**: Position is correct after server-side `ST_Transform` (FR-060, quickstart.md §4 step 3).
  - **Verification**: `npm run test:db:up && npm run test -- crsWebMercator`
  - **Dependencies**: T211, T035

- [X] T217 [US8] Wire custom-CRS input through to the job
  - **Priority**: Should-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/components/CrsSelector.tsx` (modify), `src/features/import-export/hooks/useImport.ts` (modify)
  - **Goal**: Send `sourceCrs: "CUSTOM"` plus `customCrsDefinition`; the server passes the proj4 text directly to `ST_Transform`.
  - **Acceptance Criteria**: Accepted if parseable, rejected with a clear message if not, **never partially applied** (FR-063); no `spatial_ref_sys` entry is required because PostGIS accepts a proj4 text target (research.md D4).
  - **Verification**: `npm run test -- CrsSelector.custom && npm run test -- importJobRepository.customCrs`
  - **Dependencies**: T212, T034

- [X] T218 [P] [US8] Implement `previewTransform`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/services/crsCatalog.ts` (modify)
  - **Goal**: Transform a sample of coordinates client-side with proj4 and compute the resulting bounding box.
  - **Acceptance Criteria**: Constitution Principle IV compliant — this is **transient UI feedback**, never persisted; the persisted transform is `ST_Transform` (research.md D4). Responds fast enough to update as the user changes the dropdown.
  - **Verification**: `npm run test -- crsCatalog.preview`
  - **Dependencies**: T211

- [X] T219 [US8] Implement `CrsPreview`
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/components/CrsPreview.tsx` (new)
  - **Goal**: Show sample transformed coordinates and the resulting bounding box.
  - **Acceptance Criteria**: Rendered **before any data is written** (FR-064, quickstart.md §4 step 2).
  - **Verification**: `npm run test -- CrsPreview`
  - **Dependencies**: T218, T213

- [X] T220 [US8] Implement the wrong-CRS warning
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/services/crsCatalog.ts` (modify), `src/features/import-export/components/CrsPreview.tsx` (modify)
  - **Goal**: `isBboxPlausible` flags a transformed bbox outside valid geographic bounds; the preview warns and requires **explicit confirmation** to proceed.
  - **Acceptance Criteria**: Catches the classic GIS disaster — projected coordinates imported as degrees — **before** any write (FR-065, SC-010). Also catches reversed lat/lng ordering (spec Edge Cases). The import cannot proceed on the warning path without a second, deliberate confirmation.
  - **Verification**: `npm run test -- crsCatalog.plausible CrsPreview.warning`
  - **Dependencies**: T219

- [X] T221 [US8] Validate the CRS server-side at job creation
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/server/repositories/importJobRepository.ts` (modify — completes T034)
  - **Goal**: Reject an `EPSG:` code with no `spatial_ref_sys` row, and an unparseable custom definition, at job creation rather than at the first chunk.
  - **Acceptance Criteria**: `ValidationError` → `400 INVALID_INPUT`; the import fails early with a clear message rather than late and partially (plan.md Risks: "Coordinate transformation failure").
  - **Verification**: `npm run test -- importJobRepository.crsValidation`
  - **Dependencies**: T034, T030

- [X] T222 [P] [US8] Add the export output-CRS selector
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/components/ExportDialog.tsx` (modify)
  - **Goal**: Let the user choose the output CRS for an export, defaulting to WGS84.
  - **Acceptance Criteria**: Feeds T186's transform and T188's `outputCrs` log field (FR-041).
  - **Verification**: `npm run test -- ExportDialog.crs`
  - **Dependencies**: T189, T186

- [X] T223 [US8] CRS unit and integration tests
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: `src/features/import-export/services/__tests__/crsCatalog.test.ts` (new), `src/features/import-export/__tests__/crsTransform.integration.test.ts` (new)
  - **Goal**: Assert transform accuracy against known control points, bbox-plausibility behavior, custom-CRS parsing, and the storage invariant.
  - **Acceptance Criteria**: Correctly-specified source CRS lands within **1 metre** of true position (SC-009); `SELECT DISTINCT ST_SRID(geometry) FROM "Feature"` returns **only 4326** regardless of source CRS (FR-012).
  - **Verification**: `npm run test:db:up && npm run test -- crsCatalog crsTransform`
  - **Dependencies**: T211–T222

- [X] T224 [US8] Checkpoint (Phase 14)
  - **Priority**: Must-have
  - **User Story**: US8
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US8 is independently demonstrable.
  - **Acceptance Criteria**: quickstart.md §4 passes by hand including the deliberately-wrong-CRS case; T211–T223 complete; `src/features/database/utils/reprojection.ts` is superseded and either deleted or reduced to a re-export of `crsCatalog`.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T211–T223

---

## Phase 15: Progress & History (Priority: P2/P3) — User Stories 9 and 10

**Goal**: Large imports report progress, cancel promptly, survive a closed tab, and can be undone exactly; every import and export is auditable.

**Independent test (US9)**: Import 100 000 features, cancel at ~40%, verify the committed count is stated, then Undo and verify the layer returns to its pre-import state while a concurrently-added feature survives.
**Independent test (US10)**: Perform one successful import, one failed import, and one export; verify all three appear in history with correct attribution.

- [X] T225 [US9] Wire client-owned progress tracking
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/import-export/hooks/useImport.ts` (modify), `src/features/import-export/store/importStore.ts` (modify)
  - **Goal**: Update `importStore.progress` as each chunk resolves; the driving tab issues **no** progress requests.
  - **Acceptance Criteria**: Zero network round trips for progress in the common case — the tab already holds numerator and denominator (research.md D12); advances at least once per chunk (FR-069).
  - **Verification**: `npm run test -- useImport.progress`
  - **Dependencies**: T086, T103

- [X] T226 [US9] Verify server-side counters and heartbeat
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/server/repositories/importJobRepository.ts` (verify T038)
  - **Goal**: Confirm every chunk commit updates `importedCount`, `rejectedCount`, `duplicateCount`, `chunksCommitted`, and `heartbeatAt` in the same transaction as the insert.
  - **Acceptance Criteria**: The counters are what make an import visible after a reload and what the abandoned-job sweep reads (FR-074, research.md D12/D17); they are never updated outside the chunk transaction.
  - **Verification**: `npm run test -- importJobRepository.counters`
  - **Dependencies**: T038

- [X] T227 [US9] Wire cancellation in the UI and measure latency
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/import-export/components/ImportProgress.tsx` (modify), `src/features/import-export/__tests__/cancelLatency.test.ts` (new)
  - **Goal**: Cancel button aborts the chunk loop and calls the cancel endpoint; measure the time to the last committed chunk.
  - **Acceptance Criteria**: Further commits stop **within 2 seconds** (SC-004); the summary states exactly how many features were committed before cancellation (FR-070).
  - **Verification**: `npm run test -- cancelLatency`
  - **Dependencies**: T093, T121

- [X] T228 [US9] Implement cross-session resume
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/import-export/hooks/useImportProgress.ts` (modify), `src/features/import-export/components/ImportHistoryPanel.tsx` (modify)
  - **Goal**: Opening a `running` job without an in-memory driver starts polling `GET /api/imports/:id`.
  - **Acceptance Criteria**: A user returning after a reload sees the job's real state; a tab that **is** the driver never starts polling (research.md D12).
  - **Verification**: `npm run test -- useImportProgress.resume`
  - **Dependencies**: T087, T232

- [X] T229 [US9] Verify abandoned-job resolution
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: Assert a `running` job with a stale `heartbeatAt` is returned as `failed` on the next history or detail read, with rollback still offered.
  - **Acceptance Criteria**: **No job is ever left permanently "running"** (FR-074, quickstart.md §9 step 6); **no cron or scheduler exists** in the codebase to do this (research.md D17).
  - **Verification**: `npm run test -- importJobRepository.sweep`
  - **Dependencies**: T043

- [X] T230 [US9] Implement the "Undo this import" affordance
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/import-export/components/ImportSummaryPanel.tsx` (modify), `src/features/import-export/components/ImportHistoryPanel.tsx` (modify)
  - **Goal**: Offer Undo on any cancelled, failed, or completed import, from both the summary and the history entry, behind an `AlertDialog` confirmation.
  - **Acceptance Criteria**: Available from **every** terminal state including `succeeded` (FR-072); after undo the history entry reads `rolled_back` and the undo itself is recorded (FR-073).
  - **Verification**: `npm run test -- ImportSummaryPanel.undo ImportHistoryPanel.undo`
  - **Dependencies**: T094, T122

- [X] T231 [US9] Rollback isolation test under concurrency
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/import-export/__tests__/rollbackIsolation.integration.test.ts` (new)
  - **Goal**: Import, then insert a feature into the same layer through a **different** path (simulating another user), then roll back.
  - **Acceptance Criteria**: The import's features are gone and **the independently-added feature survives** (SC-011, FR-072, quickstart.md §9 step 5). This is the feature's headline correctness promise and must be asserted directly, not inferred.
  - **Verification**: `npm run test:db:up && npm run test -- rollbackIsolation`
  - **Dependencies**: T042, T230

- [X] T232 [US10] Implement `ImportHistoryPanel`
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (new)
  - **Goal**: Cursor-paginated, newest-first list showing acting user, timestamp, source format, file name, target layer, mode, source CRS, outcome, and the four counts.
  - **Acceptance Criteria**: Every field FR-075 enumerates is displayed; paging neither duplicates nor skips (FR-077).
  - **Verification**: `npm run test -- ImportHistoryPanel`
  - **Dependencies**: T088

- [X] T233 [P] [US10] Integrate export history into the same view
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (modify)
  - **Goal**: Render export entries from the existing `useExportHistory` alongside imports, showing user, timestamp, format, scope, output CRS, feature count, and outcome.
  - **Acceptance Criteria**: **007's hook is consumed, not re-implemented** (FR-076, Constitution: never duplicate code).
  - **Verification**: `npm run test -- ImportHistoryPanel.exports`
  - **Dependencies**: T232, T091

- [X] T234 [US10] Implement issue drill-in from a history entry
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (modify), `src/features/import-export/components/ValidationReport.tsx` (modify)
  - **Goal**: Open a past run's validation report and failure reason from its entry.
  - **Acceptance Criteria**: The failure reason and the retained report are retrievable (FR-078, FR-059); when `truncated` is true the UI **states that history holds the first 1 000 issues**, not all of them (research.md D16) — an honest disclosure, not a silent omission.
  - **Verification**: `npm run test -- ImportHistoryPanel.issues`
  - **Dependencies**: T232, T089, T245

- [X] T235 [P] [US10] Display import and export statistics
  - **Priority**: Should-have
  - **User Story**: US10
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (modify)
  - **Goal**: Show the imported/rejected/duplicate/repaired counts per import and feature/layer counts per export, sourced from the job columns.
  - **Acceptance Criteria**: **No `ExportStatistics` or aggregate table is queried** — the statistics are columns on the job rows (research.md D15).
  - **Verification**: `npm run test -- ImportHistoryPanel.stats`
  - **Dependencies**: T232, T233

- [X] T236 [P] [US10] Handle a history entry whose layer was deleted
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (modify)
  - **Goal**: Render `targetLayerName` with an explicit "layer no longer exists" indicator when `targetLayerId` is null.
  - **Acceptance Criteria**: The entry **survives** the layer's deletion and says so (FR-079) — enabled by the `SetNull` relation and the name snapshot (T016).
  - **Verification**: `npm run test -- ImportHistoryPanel.deletedLayer`
  - **Dependencies**: T232

- [X] T237 [US10] Enforce Viewer read-only in the UI
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (modify), `.../ImportDialog.tsx` (modify), `.../ExportDialog.tsx` (modify)
  - **Goal**: Hide or disable import, export, and rollback controls for a project `Viewer`.
  - **Acceptance Criteria**: History remains readable (FR-080). The UI is a **convenience, not the boundary** — `assertProjectRole` on every write endpoint is the enforcement (T068, research.md D18), and the API tests in T296 assert that directly.
  - **Verification**: `npm run test -- ImportHistoryPanel.viewer`
  - **Dependencies**: T232

- [X] T238 Checkpoint (Phase 15)
  - **Priority**: Must-have
  - **User Story**: US9, US10
  - **Files**: None (verification-only task)
  - **Goal**: Confirm US9 and US10 are independently demonstrable.
  - **Acceptance Criteria**: quickstart.md §7 and §9 pass by hand, including the closed-tab and concurrent-undo cases; T225–T237 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T225–T237

---

## Phase 16: UI Components (Priority: P1/P2) — completes User Story 7 (+ US1/US5 polish)

**Purpose**: The validation-report surface US7 depends on, plus loading/empty/error states and responsive/theme polish across all three dialogs.

- [X] T239 [US1] Polish `ImportDialog`
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (modify)
  - **Goal**: Finalize step transitions, back-navigation between steps, and the Strict/Lenient mode control's placement.
  - **Acceptance Criteria**: Every step is reachable and reversible before the confirmation gate; no step is skippable in a way that leaves `importStore` inconsistent.
  - **Verification**: `npm run test -- ImportDialog`
  - **Dependencies**: T118, T168

- [X] T240 [P] [US5] Polish `ExportDialog`
  - **Priority**: Must-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/components/ExportDialog.tsx` (modify)
  - **Goal**: Finalize scope/format/CRS layout and the format-capability hints (e.g. Shapefile cannot hold mixed geometry).
  - **Acceptance Criteria**: The mixed-geometry warning appears before download (FR-038); an unavailable scope (empty selection) is disabled with an explanation.
  - **Verification**: `npm run test -- ExportDialog`
  - **Dependencies**: T189, T222

- [X] T241 [P] [US9] Finalize the progress dialog
  - **Priority**: Must-have
  - **User Story**: US9
  - **Files**: `src/features/import-export/components/ImportProgress.tsx` (modify)
  - **Goal**: Percentage, features-processed-of-total, elapsed time, and Cancel in one coherent surface.
  - **Acceptance Criteria**: Progress never appears frozen for more than 3 s during an import over 3 s (SC-003).
  - **Verification**: `npm run test -- ImportProgress`
  - **Dependencies**: T121, T227

- [X] T242 [P] [US10] Finalize the history surface
  - **Priority**: Must-have
  - **User Story**: US10
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (modify)
  - **Goal**: Mount the panel in the existing right sidebar / project explorer surface rather than adding a new route.
  - **Acceptance Criteria**: Reuses `src/features/database/components/RightSidebar.tsx`'s existing composition; **no new top-level route is added**.
  - **Verification**: `npm run test -- ImportHistoryPanel`
  - **Dependencies**: T232

- [X] T243 [P] [US1] Finalize the import summary
  - **Priority**: Must-have
  - **User Story**: US1
  - **Files**: `src/features/import-export/components/ImportSummaryPanel.tsx` (modify)
  - **Goal**: Counts, elapsed time, per-category breakdown, and the Undo action in one panel.
  - **Acceptance Criteria**: Counts sum to the total read (SC-006); Undo is present on every terminal state (FR-072).
  - **Verification**: `npm run test -- ImportSummaryPanel`
  - **Dependencies**: T122, T230

- [X] T244 [P] [US5] Add an export summary
  - **Priority**: Should-have
  - **User Story**: US5
  - **Files**: `src/features/import-export/components/ExportDialog.tsx` (modify)
  - **Goal**: After download, show format, scope, feature count, output CRS, and — for project exports — the layer count.
  - **Acceptance Criteria**: Mirrors what was logged to history so the two never disagree (FR-076).
  - **Verification**: `npm run test -- ExportDialog.summary`
  - **Dependencies**: T188

- [X] T245 [US7] Implement `ValidationReport`
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/import-export/components/ValidationReport.tsx` (new)
  - **Goal**: List the first 100 issues inline with source position and reason, show the exact total, and offer a downloadable full report.
  - **Acceptance Criteria**: 100 inline with an **accurate** total (FR-058); every rejection carries its position in the source file and a specific reason (FR-057, SC-005); the in-session download comes from `importStore.preflight`'s uncapped list, and from history it is the first 1 000 with `truncated` stated (research.md D16).
  - **Verification**: `npm run test -- ValidationReport`
  - **Dependencies**: T101, T089

- [X] T246 [P] Add loading states
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all three dialogs + history panel)
  - **Goal**: Skeletons or spinners for parsing, chunk-committing, history fetching, and PDF rendering.
  - **Acceptance Criteria**: No surface renders blank while work is in flight; long operations announce via a polite live region (FR-088).
  - **Verification**: `npm run test -- import-export/components`
  - **Dependencies**: T239–T245

- [X] T247 [P] Add empty states
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/ImportHistoryPanel.tsx` (modify), `.../ValidationReport.tsx` (modify), `.../ExportDialog.tsx` (modify)
  - **Goal**: "No imports yet", "No issues found", "Nothing to export".
  - **Acceptance Criteria**: An empty export scope gives a clear message and **no file** (FR-042); an empty file gives "nothing to import" and **creates no job** (spec Edge Cases).
  - **Verification**: `npm run test -- import-export/components.empty`
  - **Dependencies**: T239–T245

- [X] T248 [P] Add error states
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all), `src/features/import-export/utils/importErrors.ts` (modify)
  - **Goal**: Render every failure path with a recovery action where one exists, and wrap the feature in a React error boundary.
  - **Acceptance Criteria**: Every user-visible failure has an explicit error state (Constitution: Error Handling); messages are user-safe with no internal detail (FR-086); `role="alert"` when the error blocks the next action (FR-090).
  - **Verification**: `npm run test -- import-export/components.errors`
  - **Dependencies**: T010, T011

- [X] T249 [P] [US9] Retain the large-import confirmation
  - **Priority**: Should-have
  - **User Story**: US9
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (modify)
  - **Goal**: Keep an `AlertDialog` confirmation above a large-feature threshold, as the outgoing `ImportExportControls` already did.
  - **Acceptance Criteria**: The existing affordance is **preserved, not lost** in the rewrite (T124); its wording is updated since Undo now exists and the old "cannot be reversed" note no longer applies.
  - **Verification**: `npm run test -- ImportDialog.largeImport`
  - **Dependencies**: T239

- [X] T250 [P] [US7] Add the duplicate opt-in control
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (modify)
  - **Goal**: Skip duplicates by default with an "import them anyway" toggle.
  - **Acceptance Criteria**: Duplicates are skipped by default and counted separately from rejections (FR-056); the toggle is keyboard-operable and labelled.
  - **Verification**: `npm run test -- ImportDialog.duplicates`
  - **Dependencies**: T239, T036

- [X] T251 [P] [US7] Add the Strict/Lenient mode control
  - **Priority**: Must-have
  - **User Story**: US7
  - **Files**: `src/features/import-export/components/ImportDialog.tsx` (modify)
  - **Goal**: A labelled toggle with **Lenient preselected**, explaining each mode's consequence in one line.
  - **Acceptance Criteria**: Lenient is the default (FR-006); the Strict description states that any invalid feature rejects the whole file.
  - **Verification**: `npm run test -- ImportDialog.mode`
  - **Dependencies**: T239, T096

- [X] T252 [P] Verify responsive behavior
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all)
  - **Goal**: Confirm every surface is functional at 320 px with no horizontal page scroll.
  - **Acceptance Criteria**: Mobile-first authoring; the preview table and validation report scroll inside their own `overflow-x` containers rather than forcing page scroll; touch targets ≥ 44×44 px (Constitution: Responsive Design).
  - **Verification**: `npm run test -- import-export/components && npm run build`
  - **Dependencies**: T239–T248

- [X] T253 [P] Verify theme support
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all)
  - **Goal**: Confirm every surface renders correctly in light and dark themes.
  - **Acceptance Criteria**: Only Tailwind design tokens are used — no hardcoded colour that breaks in one theme; contrast meets WCAG 2.2 AA in both (Constitution: Accessibility).
  - **Verification**: `npm run test -- import-export/components.theme`
  - **Dependencies**: T252

- [X] T254 Audit shadcn primitive reuse
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all)
  - **Goal**: Confirm every interactive control uses a `src/shared/components/ui/` primitive rather than hand-rolled HTML.
  - **Acceptance Criteria**: Radix primitives are used in preference to hand-rolled controls (Constitution: Accessibility); **no new shadcn primitive is added unless genuinely absent**, and any addition is recorded.
  - **Verification**: `npm run lint && npm run test -- import-export/components`
  - **Dependencies**: T239–T253

- [X] T255 [P] Finalize the feature barrel
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/index.ts` (modify)
  - **Goal**: Export the public component, hook, service, and store surface.
  - **Acceptance Criteria**: The barrel does not re-export anything that transitively imports Leaflet into a data-only consumer — the hazard `analysis/services/exportService.ts` documents.
  - **Verification**: `npx tsc --noEmit && npm run lint`
  - **Dependencies**: T254

- [X] T256 Finalize `ImportExportControls`
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/database/components/ImportExportControls.tsx` (modify)
  - **Goal**: Confirm it is a pure launcher — buttons that open the dialogs and nothing else.
  - **Acceptance Criteria**: No parsing, validation, network call, or format knowledge remains in this file; its existing ARIA labels are preserved.
  - **Verification**: `npm run test -- ImportExportControls`
  - **Dependencies**: T124, T255

- [X] T257 [P] Component tests — import surfaces
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/__tests__/` (modify/new)
  - **Goal**: Cover `ImportDialog`, `FileDropZone`, `ImportProgress`, `ImportSummaryPanel`, `ValidationReport`.
  - **Acceptance Criteria**: All pass; every conditional-render and ARIA-state branch is exercised.
  - **Verification**: `npm run test -- import-export/components`
  - **Dependencies**: T245–T251

- [X] T258 [P] Component tests — export and print surfaces
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/__tests__/` (modify/new)
  - **Goal**: Cover `ExportDialog`, `PrintDialog`, `PrintPreview`, `ScaleBar`, `MapLegend`.
  - **Acceptance Criteria**: All pass.
  - **Verification**: `npm run test -- ExportDialog PrintDialog PrintPreview ScaleBar MapLegend`
  - **Dependencies**: T240, T244, T209

- [X] T259 [P] Component tests — CRS and history surfaces
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/__tests__/` (modify/new)
  - **Goal**: Cover `CrsSelector`, `CrsPreview`, `CsvColumnMapper`, `ImportPreviewTable`, `ImportHistoryPanel`.
  - **Acceptance Criteria**: All pass; the wrong-CRS warning branch is exercised.
  - **Verification**: `npm run test -- CrsSelector CrsPreview CsvColumnMapper ImportPreviewTable ImportHistoryPanel`
  - **Dependencies**: T242, T220, T170

- [X] T260 Checkpoint (Phase 16)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the UI layer is complete and green, and that US7 is independently demonstrable.
  - **Acceptance Criteria**: quickstart.md §3 passes by hand in both Strict and Lenient modes; T239–T259 complete.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T239–T259

---

## Phase 17: Performance

**Purpose**: Meet SC-002, SC-003, and SC-004 at 100 000 features, and pass Constitution Principle V's bundle gate.

- [X] T261 Tune and validate the chunk size
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/types/importExport.constants.ts` (modify)
  - **Goal**: Measure commit latency at 500 / 1 000 / 2 000 features per chunk and fix the constant on evidence.
  - **Acceptance Criteria**: The chosen size keeps a single chunk under ~2 s so the chunk-boundary cancellation check meets SC-004, and keeps the request body under `IMPORT_CHUNK_MAX_BYTES`. The measurement is recorded in the task's completion note.
  - **Verification**: `npm run test:db:up && npm run test -- performance.chunkSize`
  - **Dependencies**: T035

- [X] T262 Verify worker chunk streaming
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/importParser.worker.ts` (modify)
  - **Goal**: Confirm the worker emits chunks and releases them rather than accumulating the full feature array.
  - **Acceptance Criteria**: Peak worker memory is bounded by chunk size, not file size (plan.md Performance — memory).
  - **Verification**: `npm run test -- performance.workerMemory`
  - **Dependencies**: T075

- [X] T263 Establish the memory ceiling
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/performance/memory.test.ts` (new)
  - **Goal**: Assert peak heap during a 100 000-feature import stays under a fixed ceiling.
  - **Acceptance Criteria**: The tab does not crash on a 50 MB file (plan.md Risks: "Memory exhaustion"); the ceiling is a named constant, not a magic number.
  - **Verification**: `npm run test -- performance/memory`
  - **Dependencies**: T262

- [X] T264 100 000-feature import test
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/performance/largeImport.test.ts` (new), `scripts/generate-large-geojson.mjs` (new)
  - **Goal**: Generate the fixture and run a full import against the real database.
  - **Acceptance Criteria**: Completes successfully (SC-002); the fixture is **generated, not committed**; total statement count is ~400, not ~300 000 (research.md D5).
  - **Verification**: `npm run test:db:up && npm run test -- performance/largeImport`
  - **Dependencies**: T261

- [X] T265 [P] Verify progress cadence
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/performance/progressCadence.test.ts` (new)
  - **Goal**: Assert progress advances at least once every 3 s during a long import.
  - **Acceptance Criteria**: SC-003 — no import ever appears frozen.
  - **Verification**: `npm run test -- performance/progressCadence`
  - **Dependencies**: T264

- [X] T266 [P] Verify cancellation latency
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/performance/cancelLatency.test.ts` (modify T227's file)
  - **Goal**: Assert further commits stop within 2 s of the cancel action during a 100 000-feature import.
  - **Acceptance Criteria**: SC-004 at full scale, not just on a small fixture.
  - **Verification**: `npm run test -- performance/cancelLatency`
  - **Dependencies**: T264, T227

- [X] T267 Audit dynamic imports
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All files importing `shpjs`, `@tmcw/togeojson`, `jszip`, `papaparse`, `jspdf`, `html2canvas`
  - **Goal**: Confirm every one of the six is reached only through `await import()`.
  - **Acceptance Criteria**: No static top-level import of any of the six exists anywhere (Constitution Principle V, research.md D10).
  - **Verification**: `! grep -rE "^import .* from \"(shpjs|@tmcw/togeojson|jszip|papaparse|jspdf|html2canvas)\"" src/`
  - **Dependencies**: T129, T145, T159, T195

- [X] T268 Run the bundle analyzer gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification task); record findings in the PR description
  - **Goal**: Run the analyzer and confirm none of the six packages appears in the initial route bundle.
  - **Acceptance Criteria**: **Mandatory gate** — Constitution Principle V requires the analyzer before merging any PR adding a dependency over 20 KB gzipped, and all six clear that. A user who never opens the import dialog downloads none of them.
  - **Verification**: `ANALYZE=true npm run build`
  - **Dependencies**: T267

- [X] T269 [P] `EXPLAIN` the duplicate probe
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.explain.test.ts` (new)
  - **Goal**: Confirm the probe uses the GiST bbox index to narrow candidates before `ST_OrderingEquals`.
  - **Acceptance Criteria**: The plan shows an index scan, not a sequential scan, against a large target layer (research.md D8, plan.md Risks: "Duplicate probe too slow"). If it is pathological, the plan permits making the probe skippable per job — record the decision here.
  - **Verification**: `npm run test -- importJobRepository.explain`
  - **Dependencies**: T036

- [X] T270 [P] `EXPLAIN` the rollback delete
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.explain.test.ts` (modify)
  - **Goal**: Confirm `DELETE FROM "Feature" WHERE "importJobId" = ?` uses the T024 index.
  - **Acceptance Criteria**: An index scan, not a sequential scan of a 500 000-row layer (data-model.md Indexes).
  - **Verification**: `npm run test -- importJobRepository.explain`
  - **Dependencies**: T024, T042

- [X] T271 [P] Verify export paging
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/performance/largeExport.test.ts` (new)
  - **Goal**: Export a very large layer and confirm reads stay cursor-paged with progress reported.
  - **Acceptance Criteria**: Memory stays bounded for the streaming formats (GeoJSON, KML); the buffered formats (CSV, Shapefile) stay within their documented and justified limits.
  - **Verification**: `npm run test -- performance/largeExport`
  - **Dependencies**: T175

- [X] T272 Audit React re-renders
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all)
  - **Goal**: Confirm a progress tick re-renders only the progress component, not the whole dialog or the map.
  - **Acceptance Criteria**: Narrow Zustand selectors throughout; no component subscribes to more store state than it renders (Constitution Principle V) — this is what keeps the map interactive during a 100 000-feature import (SC-002).
  - **Verification**: `npm run test -- import-export/components.rerender`
  - **Dependencies**: T106, T241

- [X] T273 [P] Warn before a very large export
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/ExportDialog.tsx` (modify)
  - **Goal**: Warn above `LARGE_EXPORT_FEATURE_THRESHOLD` before attempting a single-file export.
  - **Acceptance Criteria**: Reuses the existing threshold constant from 007's export service rather than introducing a second one.
  - **Verification**: `npm run test -- ExportDialog.largeExport`
  - **Dependencies**: T240, T002

- [X] T274 Assemble the performance test suite
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/performance/` (all)
  - **Goal**: Group the performance tier so it can be run as a unit, documenting its runtime.
  - **Acceptance Criteria**: The suite runs green and its wall-clock cost is recorded; it respects `fileParallelism: false` (see `vitest.config.ts`).
  - **Verification**: `npm run test:db:up && npm run test -- performance`
  - **Dependencies**: T261–T273

- [X] T275 Checkpoint (Phase 17)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm every performance target is met.
  - **Acceptance Criteria**: SC-002, SC-003, and SC-004 all verified by an automated test, not by inspection; the analyzer gate passes.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build && ANALYZE=true npm run build`
  - **Dependencies**: T261–T274

---

## Phase 18: Accessibility

**Purpose**: WCAG 2.2 AA across every import, export, and print surface; SC-014 and SC-016.

- [X] T276 Verify keyboard navigation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all)
  - **Goal**: Every control reachable and operable by keyboard alone with a visible focus indicator.
  - **Acceptance Criteria**: FR-087; the hidden-file-input pattern remains keyboard-activatable via its labelled button; no keyboard trap in any dialog.
  - **Verification**: `npm run test -- import-export/components.keyboard`
  - **Dependencies**: T254

- [X] T277 [P] Verify ARIA labelling
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all)
  - **Goal**: Every control carries a label reflecting its **action**, not its icon.
  - **Acceptance Criteria**: Constitution: Accessibility — map and toolbar controls must be labelled by action; icon-only buttons carry `aria-label`.
  - **Verification**: `npm run test -- import-export/components.aria`
  - **Dependencies**: T276

- [X] T278 [P] Verify focus management
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all three dialogs)
  - **Goal**: Focus enters the dialog on open, is trapped inside, and returns to the trigger on close.
  - **Acceptance Criteria**: Handled by Radix `Dialog` — verify rather than reimplement; progress and completion announcements **must not steal focus** (FR-088).
  - **Verification**: `npm run test -- import-export/components.focus`
  - **Dependencies**: T276

- [X] T279 [P] Verify live-region announcements
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/ImportProgress.tsx` (modify), `.../ImportSummaryPanel.tsx` (modify)
  - **Goal**: Progress and completion announce via `role="status"` `aria-live="polite"`; blocking errors announce assertively.
  - **Acceptance Criteria**: FR-088, FR-090; polite regions do not interrupt the user mid-task.
  - **Verification**: `npm run test -- ImportProgress.aria ImportSummaryPanel.aria`
  - **Dependencies**: T277

- [X] T280 [P] Verify progress semantics
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/ImportProgress.tsx` (modify)
  - **Goal**: Native `<progress>` with `aria-valuenow`/`aria-valuemax` and a text alternative.
  - **Acceptance Criteria**: Progress is never conveyed by visual position, width, or colour alone (FR-089).
  - **Verification**: `npm run test -- ImportProgress.semantics`
  - **Dependencies**: T279

- [X] T281 [P] Verify error association
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/` (all)
  - **Goal**: Each validation error is associated with its control or file via `aria-describedby`, and announced assertively when it blocks the next action.
  - **Acceptance Criteria**: FR-090.
  - **Verification**: `npm run test -- import-export/components.errorAria`
  - **Dependencies**: T248, T277

- [X] T282 Screen-reader CSV walkthrough
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/a11y/csvKeyboardFlow.test.tsx` (new)
  - **Goal**: Complete upload → column mapping → CRS selection → preview → confirm using keyboard and accessible-name queries only.
  - **Acceptance Criteria**: **SC-014** — the entire CSV import is completable unaided; the test uses `getByRole`/`getByLabelText` exclusively, never a test id, so it fails if accessible names regress.
  - **Verification**: `npm run test -- a11y/csvKeyboardFlow`
  - **Dependencies**: T276–T281, T162

- [X] T283 axe assertions on all dialogs
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/a11y/axe.test.tsx` (new)
  - **Goal**: Run axe against `ImportDialog`, `ExportDialog`, and `PrintDialog` in their key states.
  - **Acceptance Criteria**: Zero violations at the WCAG 2.2 AA baseline (Constitution Principle VII).
  - **Verification**: `npm run test -- a11y/axe`
  - **Dependencies**: T282

- [X] T284 Lighthouse accessibility verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (manual verification); record the score in the PR description
  - **Goal**: Score every route the import/export UI mounts on.
  - **Acceptance Criteria**: **≥ 90** on each (Constitution Principle X, SC-016).
  - **Verification**: Manual Lighthouse run against `npm run build && npm run start`
  - **Dependencies**: T283

- [X] T285 Checkpoint (Phase 18)
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Confirm the accessibility bar is met.
  - **Acceptance Criteria**: T276–T284 complete; SC-014 and SC-016 verified.
  - **Verification**: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T276–T284

---

## Phase 19: Testing

**Purpose**: Complete every tier Constitution Principle VII requires and close the gaps the per-phase tests did not reach. Tasks here **extend** the suites created earlier rather than duplicating them.

- [X] T286 [P] Repository tests — creation and role gates
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: Editor succeeds; Viewer → `Forbidden`; unknown layer → `NotFound`; layer in another project → `NotFound`; CRS validation failures.
  - **Acceptance Criteria**: The non-disclosure rule holds — a caller with no access cannot distinguish "doesn't exist" from "exists but isn't yours".
  - **Verification**: `npm run test -- importJobRepository.create`
  - **Dependencies**: T047

- [X] T287 [P] Repository tests — chunk commit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: Happy path inserts features and attributes; over-1 000 features → `Validation`; counters update correctly.
  - **Acceptance Criteria**: `importedCount + rejectedCount + duplicateCount` never exceeds `totalFeatures` (SC-006).
  - **Verification**: `npm run test -- importJobRepository.chunk`
  - **Dependencies**: T047

- [X] T288 [P] Repository tests — transform correctness
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: Assert an EPSG:27700 input lands at a known EPSG:4326 coordinate, and that a custom proj4 target transforms correctly.
  - **Acceptance Criteria**: Within 1 metre of the control point (SC-009); stored SRID is always 4326 (FR-012).
  - **Verification**: `npm run test -- importJobRepository.transform`
  - **Dependencies**: T047

- [X] T289 [P] Repository tests — duplicate exclusion
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: An existing-layer duplicate is excluded and counted; a geometry-only match is **not** treated as a duplicate.
  - **Acceptance Criteria**: Matches the spec's definition — geometry **and** the complete attribute set must both be identical (spec Assumptions, FR-055).
  - **Verification**: `npm run test -- importJobRepository.duplicates`
  - **Dependencies**: T047

- [X] T290 Repository tests — idempotent chunk replay
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: Replay the same `chunkIndex` and assert **nothing new** is committed and counters do not move.
  - **Acceptance Criteria**: One of the two highest-value repository cases — network retries are routine across 100 chunks (research.md D3, contracts/repository-api.md).
  - **Verification**: `npm run test -- importJobRepository.idempotency`
  - **Dependencies**: T047

- [X] T291 Repository tests — rollback isolation
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: Assert rollback removes exactly the job's features while a concurrently-inserted feature in the same layer survives; attributes cascade; double-rollback → `Conflict`.
  - **Acceptance Criteria**: The feature's headline correctness promise (SC-011, FR-072) — asserted at the repository level here and at the integration level in T231.
  - **Verification**: `npm run test -- importJobRepository.rollback`
  - **Dependencies**: T047, T231

- [X] T292 [P] Repository tests — sweep and issue cap
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/server/repositories/__tests__/importJobRepository.test.ts` (modify)
  - **Goal**: A stale `running` job is swept to `failed`; 1 500 preflight issues persist 1 000 with `truncated: true` and exact counters.
  - **Acceptance Criteria**: FR-074 and FR-058 with research.md D16's stated limitation verified rather than assumed.
  - **Verification**: `npm run test -- importJobRepository.sweep importJobRepository.issues`
  - **Dependencies**: T047

- [X] T293 [P] API tests — create and chunks
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/imports.create.test.ts` (new), `.../imports.chunks.test.ts` (new)
  - **Goal**: Validation failure, success, and each error path for the two highest-traffic endpoints.
  - **Acceptance Criteria**: A chunk with a malformed geometry that never passed preflight is rejected with `INVALID_INPUT` — proving the server, not the client, is the security boundary (research.md D18).
  - **Verification**: `npm run test:db:up && npm run test -- imports.create imports.chunks`
  - **Dependencies**: T049, T050

- [X] T294 [P] API tests — complete, cancel, rollback
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/imports.lifecycle.test.ts` (new)
  - **Goal**: Terminal transitions, no-op cancel on a terminal job, and `deletedFeatureCount` on rollback.
  - **Acceptance Criteria**: Every transition in data-model.md's state diagram is exercised.
  - **Verification**: `npm run test -- imports.lifecycle`
  - **Dependencies**: T051–T053

- [X] T295 [P] API tests — get, issues, history
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/imports.read.test.ts` (new)
  - **Goal**: Cursor paging, `status` filter, `limit` validation, and the abandoned-job sweep on read.
  - **Acceptance Criteria**: Paging neither skips nor duplicates (FR-077); an invalid `limit` returns `400`.
  - **Verification**: `npm run test -- imports.read`
  - **Dependencies**: T054–T056

- [X] T296 API tests — Viewer forbidden on every write
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/imports.authorization.test.ts` (new)
  - **Goal**: Assert a project `Viewer` receives `403 FORBIDDEN` on all five write endpoints and `200` on all three reads.
  - **Acceptance Criteria**: **FR-080 enforced at the API, not just hidden in the UI** — T237's UI hiding is convenience; this is the boundary.
  - **Verification**: `npm run test -- imports.authorization`
  - **Dependencies**: T293–T295

- [X] T297 [P] API tests — CONFLICT paths
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/app/api/__tests__/imports.conflict.test.ts` (new)
  - **Goal**: Chunk POST after cancel; `complete`/`chunks` on a terminal job; double rollback.
  - **Acceptance Criteria**: Each returns `409 CONFLICT` with a user-safe message; the post-cancel case proves a stale client cannot keep writing (research.md D13).
  - **Verification**: `npm run test -- imports.conflict`
  - **Dependencies**: T293–T295

- [X] T298 [P] Service tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/__tests__/` (modify)
  - **Goal**: Extend T084's suite with retry/backoff behavior, `ExportSource` resolution, and `pdfExport` fallback selection.
  - **Acceptance Criteria**: A `409` is not retried; a `429` is retried after a delay (T082).
  - **Verification**: `npm run test -- import-export/services`
  - **Dependencies**: T084, T082, T175, T208

- [X] T299 [P] Parser tests across all five formats
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/services/parsers/__tests__/` (modify)
  - **Goal**: Consolidate the per-phase parser suites and add the shared edge cases: BOM, `CRLF`, trailing blank lines, ±180/±90 coordinates, antimeridian crossing, null geometry, `GeometryCollection`.
  - **Acceptance Criteria**: Every "Geometry and coordinates" and "File and format handling" edge case in spec.md has a test.
  - **Verification**: `npm run test -- parsers`
  - **Dependencies**: T125, T142, T155, T169

- [X] T300 [P] Hook tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/hooks/__tests__/` (modify)
  - **Goal**: Extend T098/T099 with the cross-session resume path and the `usePrintExport` cancel path.
  - **Acceptance Criteria**: All pass; each uses a fresh `QueryClient`.
  - **Verification**: `npm run test -- import-export/hooks`
  - **Dependencies**: T098, T099

- [X] T301 [P] Store tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/store/__tests__/` (modify)
  - **Goal**: Extend T110/T111 with the reset-releases-memory assertion and the no-shadow-cache assertion.
  - **Acceptance Criteria**: A test fails if an `ImportJobRecord[]` is ever introduced into a store (T104).
  - **Verification**: `npm run test -- import-export/store`
  - **Dependencies**: T110, T111

- [X] T302 [P] Component tests
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/components/__tests__/` (modify)
  - **Goal**: Confirm every component with conditional rendering, interaction, or ARIA state has coverage; fill any gap T257–T259 left.
  - **Acceptance Criteria**: Constitution Principle VII's component tier is complete.
  - **Verification**: `npm run test -- import-export/components`
  - **Dependencies**: T257–T259

- [X] T303 [P] Integration — GeoJSON journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/geoJsonImport.integration.test.ts` (modify)
  - **Goal**: Extend T127 with the Strict-mode and duplicate-skip branches.
  - **Acceptance Criteria**: Strict mode leaves the layer unchanged; Lenient imports the valid subset.
  - **Verification**: `npm run test -- geoJsonImport.integration`
  - **Dependencies**: T127, T096

- [X] T304 [P] Integration — Shapefile journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/shapefileImport.integration.test.ts` (modify)
  - **Goal**: Extend T143 with the encoding and multi-shapefile branches.
  - **Acceptance Criteria**: Accented values survive; the multi-shapefile chooser routes to the selected one.
  - **Verification**: `npm run test -- shapefileImport.integration`
  - **Dependencies**: T143

- [X] T305 [P] Integration — KML/KMZ and CSV journeys
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/kmlImport.integration.test.ts` (modify), `.../csvImport.integration.test.ts` (modify)
  - **Goal**: Extend T156 and T171 with the unsupported-content and bad-row branches.
  - **Acceptance Criteria**: Unsupported KML content is skipped without failing the import (FR-027); bad CSV rows are reported by line number (FR-033).
  - **Verification**: `npm run test -- kmlImport.integration csvImport.integration`
  - **Dependencies**: T156, T171

- [X] T306 Integration — export round trip
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/roundTrip.integration.test.ts` (modify)
  - **Goal**: Extend T192 with the non-WGS84 output-CRS case — export as EPSG:3857, re-import declaring that source CRS, and compare against the original.
  - **Acceptance Criteria**: A round trip loses nothing even through a projection change (SC-007, FR-041).
  - **Verification**: `npm run test:db:up && npm run test -- roundTrip.integration`
  - **Dependencies**: T192, T222

- [X] T307 Integration — cancel → undo journey
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/cancelUndo.integration.test.ts` (new)
  - **Goal**: Import a large fixture, cancel mid-way, assert the committed count is reported, then undo and assert the pre-import state is restored.
  - **Acceptance Criteria**: The full US9 journey end-to-end (FR-070–073, SC-011), including that the history entry reads `rolled_back` and the undo itself is recorded.
  - **Verification**: `npm run test:db:up && npm run test -- cancelUndo.integration`
  - **Dependencies**: T231, T264

- [X] T308 [P] Performance test suite verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/performance/` (verify)
  - **Goal**: Confirm T274's suite runs green in CI conditions.
  - **Acceptance Criteria**: SC-002, SC-003, SC-004 all green.
  - **Verification**: `npm run test:db:up && npm run test -- performance`
  - **Dependencies**: T274

- [X] T309 [P] Accessibility test suite verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/__tests__/a11y/` (verify)
  - **Goal**: Confirm the axe and keyboard-flow suites run green.
  - **Acceptance Criteria**: Zero axe violations; SC-014 green.
  - **Verification**: `npm run test -- a11y`
  - **Dependencies**: T283

- [X] T310 Checkpoint (Phase 19) — regression guard
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Run the whole suite and confirm **no pre-existing test file required modification**.
  - **Acceptance Criteria**: The suites for `featureRepository`, `exportLogRepository`, 007's `exportService`, and Map Editing's import path pass **unmodified**. **If any of them needed editing, this plan's non-invasiveness claim is broken and the change must be re-examined before merge** (plan.md Testing Strategy).
  - **Verification**: `npm run test:db:up && npx tsc --noEmit && npm run lint && npm run test && npm run build`
  - **Dependencies**: T286–T309

---

## Phase 20: Documentation & Final Quality Gate

- [X] T311 Write the feature README
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `src/features/import-export/README.md` (new)
  - **Goal**: Document purpose, public API (barrel exports), a usage example, and known limitations.
  - **Acceptance Criteria**: Required by Constitution Principle VIII. Limitations stated explicitly: **history holds the first 1 000 validation issues, not all** (research.md D16); CSV import produces point features only; PDF depends on a non-tainted canvas.
  - **Verification**: Manual review against Principle VIII's four required sections
  - **Dependencies**: T310

- [X] T312 [P] Document the API surface
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/` (new or modify), cross-referencing `specs/005-import-export/contracts/api-contracts.md`
  - **Goal**: Document the eight endpoints, their auth and rate buckets, and the error mapping.
  - **Acceptance Criteria**: States clearly that **there is no upload endpoint and no export execution endpoint**, and why (research.md D2, 007 D10) — the single most likely misunderstanding for a new contributor.
  - **Verification**: Manual review; links resolve
  - **Dependencies**: T311

- [X] T313 [P] Document the architecture
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `docs/` (new or modify)
  - **Goal**: Document the import pipeline, export pipeline, two-tier validation, transformation split, client-driven job model, and the no-file-storage decision.
  - **Acceptance Criteria**: Records the three constraints a future contributor could unknowingly break: **the worker must be same-origin, not `blob:`** (CSP); **the persisted transform must stay in PostGIS** (Principle IV); **`featureRepository.importFeatures` must stay untouched** (Map Editing's contract).
  - **Verification**: Manual review
  - **Dependencies**: T312

- [X] T314 [P] Write the import user guide
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/` (new)
  - **Goal**: Per-format guidance, CRS selection, Strict vs Lenient, reading the validation report, and undoing an import.
  - **Acceptance Criteria**: Written for a GIS end user, not a developer; covers all five formats.
  - **Verification**: Manual review
  - **Dependencies**: T311

- [X] T315 [P] Write the export user guide
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/` (new)
  - **Goal**: Scopes, formats, output CRS, the mixed-geometry Shapefile caveat, and print/PDF layout.
  - **Acceptance Criteria**: States each format's structural limits so a user is not surprised by them.
  - **Verification**: Manual review
  - **Dependencies**: T311

- [X] T316 [P] Write the developer guide
  - **Priority**: Should-have
  - **User Story**: None
  - **Files**: `docs/` (new)
  - **Goal**: How to add a new import format — implement `ParseFile`, register in format detection, add a fixture and tests. Nothing downstream of the parser should need to change.
  - **Acceptance Criteria**: The format-agnostic pipeline claim is demonstrated by the shortness of this procedure.
  - **Verification**: Manual review
  - **Dependencies**: T313

- [X] T317 JSDoc audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All new and modified source files
  - **Goal**: Every exported function, hook, service, and store action carries a single-line JSDoc summary stating what it does and any non-obvious constraint.
  - **Acceptance Criteria**: Constitution Principle VIII — **units, coordinate reference system, and side effects must be stated**, since undocumented coordinate assumptions are the most common source of silent GIS bugs. Every function touching coordinates says which CRS it expects and returns.
  - **Verification**: `npm run lint`
  - **Dependencies**: T310

- [ ] T318 Quickstart verification — US1 and US5
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/005-import-export/quickstart.md` (verify §1, §2)
  - **Goal**: Walk both P1 scenarios by hand in a browser, including the external-tool and round-trip checks.
  - **Acceptance Criteria**: Every expectation in §1 and §2 holds; any deviation is fixed, not documented away.
  - **Verification**: Manual, per quickstart.md
  - **Dependencies**: T310

- [ ] T319 [P] Quickstart verification — US7, US8, US2, US4
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/005-import-export/quickstart.md` (verify §3–§6)
  - **Goal**: Walk the four P2 scenarios by hand, including the deliberately-wrong-CRS case.
  - **Acceptance Criteria**: Every expectation holds; SC-010's wrong-CRS warning fires before any write.
  - **Verification**: Manual, per quickstart.md
  - **Dependencies**: T310

- [ ] T320 [P] Quickstart verification — US10, US3, US9, US6
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/005-import-export/quickstart.md` (verify §7–§10)
  - **Goal**: Walk the remaining scenarios, including the closed-tab abandoned-job case (requires a 5-minute wait) and the tainted-canvas check.
  - **Acceptance Criteria**: Every expectation holds.
  - **Verification**: Manual, per quickstart.md
  - **Dependencies**: T310

- [ ] T321 Quickstart failure-matrix verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `specs/005-import-export/quickstart.md` (verify "Failure & recovery scenarios")
  - **Goal**: Reproduce all twelve failure scenarios by hand — oversized file, zip slip, zip bomb, extension lie, network drop, layer deleted mid-import, access revoked mid-import, concurrent imports, empty file, empty export, antimeridian, coordinate extremes.
  - **Acceptance Criteria**: Each behaves as documented; **the network-drop case must produce no duplicated features**, proving idempotency in a real browser rather than only in a test.
  - **Verification**: Manual, per quickstart.md
  - **Dependencies**: T318–T320

- [X] T322 Security header and CSP verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: `next.config.ts` (verify **unchanged**)
  - **Goal**: Confirm all six security headers are present on the deployed response and the CSP is byte-identical to `main`.
  - **Acceptance Criteria**: **A CSP diff in this PR is a review failure.** In particular, a `worker-src blob:` entry means the worker was built the wrong way (research.md D7) and must be fixed rather than accommodated. `'unsafe-eval'` must remain absent in production (Constitution Principle VI).
  - **Verification**: `git diff --exit-code next.config.ts && curl -I http://localhost:3000` against a production build
  - **Dependencies**: T310

- [X] T323 Untouched-file regression verification
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: Verification only
  - **Goal**: Confirm the files this plan promised not to change are unchanged.
  - **Acceptance Criteria**: `git diff --exit-code` is clean for `src/server/repositories/featureRepository.ts`, `src/app/api/layers/[layerId]/features/`, `src/shared/errors/apiError.ts`, `src/shared/contracts/geometry.schema.ts`, `src/shared/contracts/geoJsonImport.schema.ts`, `src/features/database/components/NorthArrow.tsx`, and `next.config.ts`. `src/features/map/` shows **exactly one** changed line (T196).
  - **Verification**: `git diff --exit-code src/server/repositories/featureRepository.ts src/shared/errors/apiError.ts src/shared/contracts/geometry.schema.ts src/shared/contracts/geoJsonImport.schema.ts next.config.ts`
  - **Dependencies**: T310

- [X] T324 TODO, console, and dependency audit
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: All new and modified source files
  - **Goal**: No `TODO` marking unfinished error handling or a stubbed Route Handler; no raw `console.*`; no unused dependency left behind.
  - **Acceptance Criteria**: Constitution Principle X forbids the first; the Logging standard forbids the second (use `src/shared/lib/logger.ts`); `shapefile` and `@types/shapefile` are gone from `package.json` (T139) and `file-saver` was never added (T080).
  - **Verification**: `! grep -rn "TODO" src/features/import-export src/server/repositories/importJobRepository.ts && ! grep -rn "console\." src/features/import-export --include=*.ts --include=*.tsx | grep -v __tests__ && npm run lint`
  - **Dependencies**: T317

- [X] T325 Final quality gate
  - **Priority**: Must-have
  - **User Story**: None
  - **Files**: None (verification-only task)
  - **Goal**: Run every gate Constitution Principle X requires before merge.
  - **Acceptance Criteria**: All green — `tsc --noEmit` zero errors; `eslint src --max-warnings 0`; every test tier passing; production build clean; bundle analyzer showing none of the six new packages in the initial route bundle; Lighthouse Accessibility ≥ 90 on every affected route; all six security headers present with an unchanged CSP; no `TODO` standing in for real error handling. **On a `005-import-export` branch with Conventional Commits and a reviewed PR — never a direct commit to `main`** (Constitution Principle IX; plan.md Constitution Check "ACTION REQUIRED").
  - **Verification**: `npx prisma validate && npx prisma generate && npx prisma migrate deploy && npx tsc --noEmit && npm run lint && npm run test && npm run build && ANALYZE=true npm run build`
  - **Dependencies**: T311–T324

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1  Foundation ──────────────────────► blocks everything
Phase 2  Database ────────────────────────► blocks Phase 3
Phase 3  Repository ──────────────────────► blocks Phase 4
Phase 4  Route Handlers ──────────────────► blocks Phase 5
Phase 5  Client Services ─────────────────► blocks Phase 6
Phase 6  Hooks ───────────────────┐
Phase 7  Stores ──────────────────┴───────► blocks Phases 8–15
         (Phase 7 may run in parallel with Phase 6; T086 needs T101)

Phase 8  GeoJSON Import   (US1, P1) ─┐
Phase 12 Export Engine    (US5, P1) ─┴────► MVP complete
Phase 9  Shapefile Import (US2, P2)
Phase 11 CSV Import       (US4, P2)
Phase 14 Coordinate Sys.  (US8, P2) ──────► strengthens Phases 9 and 11
Phase 15 Progress/History (US9/US10)
Phase 10 KML/KMZ Import   (US3, P3)
Phase 13 Print & PDF      (US6, P3)
Phase 16 UI Components    (US7 + polish)
Phase 17 Performance ─────────────────────► needs Phases 8–15
Phase 18 Accessibility ───────────────────► needs Phase 16
Phase 19 Testing ─────────────────────────► needs all implementation
Phase 20 Documentation & Final Gate ──────► last
```

### User story dependencies

Every story is independently testable once Phases 1–7 are complete. Real coupling:

- **US8 (CRS)** strengthens **US2** and **US4** but does not block them — both work with an explicitly-selected CRS before Phase 14 lands.
- **US7 (Validation)** is delivered incrementally: the two-tier engine lands in Phases 3 and 8; its dedicated UI (`ValidationReport`, T245) lands in Phase 16.
- **US9 (Bulk)** hardens US1–US4 rather than adding user-facing capability.
- **US10 (History)** depends on nothing beyond Phase 3's repository.
- **US6 (Print)** is fully independent of every import story.

### Within each phase

Tasks marked **[P]** touch different files and have no unresolved dependency — run them together. Sequential tasks share a file (most commonly `prisma/schema.prisma` in Phase 2 and `importJobRepository.ts` in Phase 3) or build directly on the previous task's output.

### Parallel opportunities

- **Phase 1**: T002–T012 are almost entirely parallel — eleven independent files.
- **Phase 2**: T017–T027 after T016 lands (same file, so coordinate edits).
- **Phase 4**: T051–T056 in parallel; T057–T067 all parallel.
- **Phases 9, 10, 11**: fully parallel with each other once Phase 8 establishes the pipeline — three formats, three parser files, no shared state.
- **Phase 12**: T176–T187 largely parallel within `exportWriters.ts` if edits are coordinated.
- **Phase 19**: T286–T309 almost entirely parallel.

---

## Parallel Example: Phase 1 (Foundation)

```bash
# After T001 lands, launch eleven independent tasks together:
T002  export constants          T008  projection helpers
T003  shared GIS types          T009  progress helpers
T004  import Zod schemas        T010  import error mapping
T005  export schema widening    T011  export error mapping
T006  file utilities            T012  query keys
T007  geometry utilities
```

## Parallel Example: Phases 9–11 (US2, US3, US4)

```bash
# Three formats, three parser files, zero shared state —
# each already has its pipeline, dialog, progress, and summary from Phase 8.
Team A → Phase 9  (T129–T144)  Shapefile   — shpjs
Team B → Phase 10 (T145–T158)  KML/KMZ     — togeojson + jszip
Team C → Phase 11 (T159–T172)  CSV         — papaparse
```

---

## Implementation Strategy

### MVP first (Phases 1–8 + 12)

Deliver **US1 (GeoJSON import)** and **US5 (multi-format export)** — the two P1 stories. That is a coherent, shippable interchange capability: data in, data out, with validation, progress, history, and rollback all working. Stop and demo here.

### Incremental delivery

1. **MVP** — Phases 1–8, 12 → US1 + US5
2. **Trust** — Phases 14, 16 → US8 + US7: correct coordinates and a real validation report
3. **Reach** — Phases 9, 11 → US2 + US4: the two formats professional and non-specialist users actually have
4. **Audit** — Phase 15 → US9 + US10: provenance and exact rollback
5. **Completeness** — Phases 10, 13 → US3 + US6
6. **Hardening** — Phases 17–20

Each numbered step is independently demonstrable and independently valuable.

### Parallel team strategy

With three developers after Phase 7:

- **Dev A**: Phase 8 (US1) → Phase 14 (US8) → Phase 15 (US9/US10)
- **Dev B**: Phase 12 (US5) → Phase 13 (US6) → Phase 16 (UI)
- **Dev C**: Phase 9 (US2) → Phase 11 (US4) → Phase 10 (US3)

Phases 17–20 are shared and sequential.

---

## Notes

- **This roadmap deliberately creates fewer artifacts than its own phase outline names.** Four Prisma models, two repositories, and roughly fifteen route handlers listed in the outline are consolidations already decided in the approved research.md and data-model.md. Every such task says so explicitly and cites its authority. Creating them anyway would contradict the approved design and duplicate code the Constitution forbids duplicating.
- **The three constraints most easily broken by accident**, each guarded by a named task:
  1. The parser worker must be **same-origin**, never a `blob:` URL — the CSP has no `worker-src` (T075, T322).
  2. The **persisted** coordinate transform must stay in PostGIS; proj4 is preview and export only (T035, T186, T218).
  3. `featureRepository.importFeatures` and Map Editing's import endpoint must stay **untouched** (T048, T323).
- **Fixtures**: all committed under `src/features/import-export/__tests__/fixtures/` **except** `large.geojson`, which is generated by `scripts/generate-large-geojson.mjs` at test time.
- **Database-backed tests** require `npm run test:db:up` first and skip if unavailable. `vitest.config.ts` sets `fileParallelism: false` because API/integration files share one `TEST_OWNER_ID` and one process-wide rate-limit map — do not re-enable it.
- **`npm run test:e2e` does not exist** in this repository and no task introduces it. Browser-level coverage is the integration tier plus the manual quickstart walkthroughs in T318–T321.
- **Branch**: create `005-import-export` before the first commit. The repository is currently on `main`, and Constitution Principle IX forbids committing there directly.

