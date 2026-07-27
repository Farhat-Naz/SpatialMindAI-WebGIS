# Data Model: GIS Import & Export (005-import-export)

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-07-27

**Scope of change**: **two new models** (`ImportJob`, `ImportIssue`), **one extended model**
(`ExportJob`), **one new nullable column + index** on `Feature`, and **three back-relations** on
existing models. One additive migration. **No existing column is removed, retyped, or made
required**, so no data backfill is needed and every currently-passing test keeps passing.

Four models named in the feature brief are deliberately *not* created — see
[Rejected models](#rejected-models) and research.md Decision 15.

---

## Entity: `ImportJob` (NEW)

One user-initiated import of one file into one layer. This row **is** the import history entry
(research.md Decision 15) — there is no separate history table, and the row is never deleted as
part of normal operation.

```prisma
/// One import of one file into one layer (specs/005-import-export, US1–US4, US9, US10).
/// This row IS the import history entry (research.md Decision 15) — there is no
/// separate ImportHistory table. The browser tab executes the import; this row is
/// the job's system of record (research.md Decision 3), which is what makes progress
/// visible after a reload and what `Feature.importJobId` points at for rollback.
/// No uploaded bytes are ever stored: the file* columns are provenance metadata only
/// (research.md Decision 2).
model ImportJob {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  /// Set-null, not cascade: FR-079 requires the history entry to survive its target
  /// layer's deletion. `targetLayerName` preserves what the layer was called so the
  /// entry stays readable afterwards.
  targetLayerId   String?
  targetLayer     Layer?  @relation("ImportJobTargetLayer", fields: [targetLayerId], references: [id], onDelete: SetNull)
  targetLayerName String

  /// "geojson" | "shapefile" | "kml" | "kmz" | "csv" (FR-001).
  sourceFormat  String
  fileName      String
  fileSizeBytes Int
  mimeType      String?
  /// SHA-256 of the source file, computed client-side. Provenance/audit only —
  /// never used to skip work, and never accompanied by the bytes themselves.
  fileHash      String?

  /// Authority code of the source CRS, e.g. "EPSG:4326" (FR-060–FR-062). Applied
  /// server-side via ST_Transform at chunk-commit time (research.md Decision 4).
  sourceCrs           String
  /// Populated only when the user supplied a definition outside the catalog
  /// (FR-063); passed to ST_Transform as proj4 text instead of an SRID.
  customCrsDefinition String?

  /// "strict" | "lenient" (FR-006). Lenient is the platform default. Strict is
  /// enforced by auto-rollback on the first commit-time rejection (research.md
  /// Decision 6), so this column records intent, not a different write path.
  mode String @default("lenient")

  /// CSV only (FR-029, FR-030): { latitudeColumn, longitudeColumn, delimiter,
  /// hasHeaderRow, attributeColumns[] }. Retained so a past import's
  /// interpretation is reproducible (spec Key Entities: Column Mapping).
  columnMapping Json?

  /// "running" | "succeeded" | "failed" | "cancelled" | "rolled_back".
  /// See State transitions below. "abandoned" is a derived presentation of a
  /// stale "running" row, not a stored value (research.md Decision 17).
  status String @default("running")

  /// Total features the client's preflight found in the file. Null until preflight
  /// finishes; the denominator for every progress readout (FR-009).
  totalFeatures   Int?
  importedCount   Int  @default(0)
  rejectedCount   Int  @default(0)
  duplicateCount  Int  @default(0)
  repairedCount   Int  @default(0)
  /// Highest committed chunk index — the idempotency key for chunk retries
  /// (research.md Decision 3).
  chunksCommitted Int  @default(0)

  errorMessage      String?
  /// Set by POST /cancel. Any further chunk POST for this job is rejected with
  /// CONFLICT, so cancellation is a server guarantee, not client politeness
  /// (research.md Decision 13).
  cancelRequestedAt DateTime?
  /// Bumped on every chunk commit. A "running" row older than 5 minutes is swept
  /// to "failed" on the next history read (FR-074, research.md Decision 17).
  heartbeatAt       DateTime?

  startedAt   DateTime  @default(now())
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  issues   ImportIssue[]
  features Feature[]

  @@index([projectId, createdAt])
  /// Filter-plus-sort for "running imports in this project" without scanning
  /// completed history. `createdAt` is the third column for the reason T260
  /// established on AnalysisRun: on [projectId, status] alone the planner prefers
  /// [projectId, createdAt] to satisfy the newest-first ordering and then filters
  /// status row by row through the heap.
  @@index([projectId, status, createdAt])
  @@index([userId])
  @@index([targetLayerId])
}
```

### Validation rules

| Field | Rule | Enforced by |
|---|---|---|
| `sourceFormat` | one of the five literals | Zod (`createImportJobSchema`) + repository |
| `sourceCrs` | matches `^EPSG:\d{4,6}$`, or `"CUSTOM"` when `customCrsDefinition` is set | Zod |
| `customCrsDefinition` | required iff `sourceCrs === "CUSTOM"`; must parse as proj4/WKT | Zod `.refine` + PostGIS on first transform |
| `mode` | `"strict"` \| `"lenient"` | Zod |
| `fileSizeBytes` | `> 0` and `<= IMPORT_MAX_FILE_BYTES` (default 50 MB) | Zod + client preflight (FR-081) |
| `targetLayerName` | non-empty; snapshot of the layer's name at creation | Repository |
| counts | non-negative; `importedCount + rejectedCount + duplicateCount <= totalFeatures` | Repository (SC-006) |
| `status` | transitions restricted to the table below | Repository |

### State transitions

```
                    ┌──────────────► succeeded      (POST /complete)
                    │
  (POST /imports)   ├──────────────► failed         (POST /complete with failure, or lazy sweep)
  ──────► running ──┤
                    ├──────────────► cancelled      (POST /cancel)
                    │
                    └──────────────► rolled_back    (POST /rollback — also reachable from
                                                     succeeded / failed / cancelled)
```

- `running` is the only non-terminal state. A job is created already `running`; there is no
  `queued` state, because there is no queue (research.md Decision 3).
- `rolled_back` is reachable from **every** other state, including `succeeded` — FR-072 offers
  "Undo this import" on cancelled, failed, *and* completed imports.
- Terminal states are final except for the rollback edge. `POST /complete` or `POST /chunks` on a
  terminal job returns `CONFLICT` (409).
- A second `POST /rollback` on an already-`rolled_back` job returns `CONFLICT`, not a silent
  success — the features are gone and re-running is a client bug worth surfacing.
- **Abandoned** is derived, never stored: `status === "running" && heartbeatAt < now - 5min`. The
  history repository writes `failed` when it observes one (research.md Decision 17).

---

## Entity: `ImportIssue` (NEW)

One validation problem found in one source feature or row. Named `ImportIssue` rather than the
brief's `ImportError` because it also carries non-error outcomes — `duplicate`, `repaired`, and
`sanitized_attribute` are reported, counted, and shown, but are not failures.

```prisma
/// One validation finding against one source feature or CSV row (FR-057–FR-059).
/// Capped at IMPORT_MAX_PERSISTED_ISSUES (1,000) rows per job — a 100,000-row CSV
/// with a mis-mapped column would otherwise write more issue rows than the import
/// itself (research.md Decision 16). ImportJob's counters stay exact regardless.
model ImportIssue {
  id          String    @id @default(cuid())
  importJobId String
  importJob   ImportJob @relation(fields: [importJobId], references: [id], onDelete: Cascade)

  /// Zero-based feature index for GeoJSON/Shapefile/KML, 1-based line number for
  /// CSV — whichever the user can find in their own file (FR-033, FR-057).
  sourcePosition Int

  /// "invalid_geometry" | "out_of_range_coordinate" | "unsupported_geometry_type"
  /// | "invalid_topology" | "missing_coordinate" | "duplicate_in_file"
  /// | "duplicate_in_layer" | "sanitized_attribute" | "repaired_geometry"
  /// | "unsupported_content" | "truncated_value"
  category String

  /// User-safe text. Never a raw driver/parser error string (FR-086).
  message   String
  createdAt DateTime @default(now())

  /// Serves both "list this job's issues in source order" and the cursor paging the
  /// issues endpoint uses.
  @@index([importJobId, sourcePosition])
}
```

### Validation rules

| Field | Rule |
|---|---|
| `sourcePosition` | `>= 0` |
| `category` | one of the eleven literals above (Zod enum, shared with the client) |
| `message` | non-empty, `<= 500` chars, never contains a stack trace |
| per-job row count | `<= 1000`; further issues increment counters only |

---

## Entity: `ExportJob` (MODIFIED — additive only)

The model already exists (added by 007). Three columns are added; nothing is removed or retyped.

```prisma
model ExportJob {
  // ... all existing fields unchanged ...

  /// EXISTING — widened value set only, no type change: adds "pdf" to
  /// "geojson" | "shapefile" | "csv" | "kml" (FR-034). Already a String column,
  /// so this is a Zod/validation change, not a migration.
  format String

  // ---- specs/005-import-export additions ----

  /// "selection" | "layer" | "project" (FR-035). Defaulted so every row written by
  /// 007 remains valid — those exports were all layer- or analysis-run-scoped.
  scope String @default("layer")

  /// Authority code the file was written in, e.g. "EPSG:4326" (FR-041). Null on
  /// pre-existing rows, which were all WGS84 by construction.
  outputCrs String?

  /// Populated only for scope = "project" (FR-037) — how many layers the archive
  /// contains, so history can show "4 layers, 12,830 features" without reopening it.
  layerCount Int?
}
```

**Migration impact**: `scope` has a default, `outputCrs` and `layerCount` are nullable. Existing
rows require no backfill. `@@index([projectId, createdAt])` already exists and serves FR-077's
newest-first paging unchanged.

**Not added**: an `ExportStatistics` table. `featureCount`, `status`, `errorMessage`, and the
three columns above are the statistics, and they belong on the row they describe (research.md
Decision 15).

---

## Entity: `Feature` (MODIFIED — one nullable column + one index)

```prisma
model Feature {
  // ... all existing fields unchanged, including
  // geometry Unsupported("geometry(Geometry, 4326)") ...

  // ---- specs/005-import-export addition ----

  /// Which import created this feature (research.md Decision 14). NULL means
  /// "not created by a tracked import" — every feature that exists today, plus
  /// every feature drawn in Map Editing or produced by an analysis run.
  ///
  /// SetNull, never Cascade: deleting a history entry must never delete map data.
  /// The reverse direction — deleting the features an import created — is the
  /// explicit rollback action, which deletes by this column (FR-072).
  importJobId String?
  importJob   ImportJob? @relation(fields: [importJobId], references: [id], onDelete: SetNull)

  @@index([importJobId])
}
```

**Why a column and not a hash or a timestamp window**: FR-072 requires rollback to remove exactly
the import's features "including when other users have since added features to the same layer."
Only row-level provenance can guarantee that. A `createdAt` range would take concurrent users'
features with it — the exact failure the spec's Edge Cases call out.

**Why this does not disturb existing write paths**: the column is nullable with no default, so
`createFeature`, `updateFeature`, `importFeatures`, and every analysis result-layer writer
continue to work untouched. Only the new `commitImportChunk` sets it.

**Interaction with the PostGIS raw-SQL path**: `Feature.geometry` is
`Unsupported("geometry(Geometry, 4326)")`, so all feature writes already go through
`$executeRaw`/`$queryRaw` (`featureRepository.ts`). `importJobId` is an ordinary text column and is
supplied as a bound parameter in the new chunk-insert statement — no change to how geometry is
handled, and no string concatenation (Constitution Principle III).

---

## Back-relations added to existing models

Additive only — a Prisma back-relation generates no SQL and cannot affect existing queries.

```prisma
model Project {
  // specs/005-import-export
  importJobs ImportJob[]
}

model User {
  // specs/005-import-export
  importJobs ImportJob[]
}

model Layer {
  // specs/005-import-export — additive back-relation only, named to match
  // ExportJob's existing "ExportJobSourceLayer" convention.
  targetOfImportJobs ImportJob[] @relation("ImportJobTargetLayer")
}
```

---

## Relationship summary

```
User ──1:N──► ImportJob ──1:N──► ImportIssue          (cascade on job delete)
                  │
                  ├──1:N──► Feature.importJobId       (SetNull — history never deletes map data)
                  │
Project ──1:N─────┤
                  └──N:1──► Layer  (SetNull — FR-079: entry outlives its layer)

Project ──1:N──► ExportJob ──N:1──► Layer          (existing, unchanged)
                     └─────►N:1──► AnalysisRun     (existing, unchanged)
```

Cascade choices, and why each is what it is:

| Relation | On delete | Reason |
|---|---|---|
| `Project` → `ImportJob` | Cascade | History is project-scoped (FR-080); a deleted project takes its history with it, matching `AnalysisRun` and `ExportJob`. |
| `User` → `ImportJob` | Cascade | Matches `AnalysisRun.user` and `ExportJob.user` exactly. |
| `Layer` → `ImportJob` | **SetNull** | FR-079: the entry must survive and report that its layer is gone. |
| `ImportJob` → `ImportIssue` | Cascade | Issues have no meaning without their job. |
| `ImportJob` → `Feature` | **SetNull** | Deleting a history entry must never delete map data. |

---

## Indexes

| Index | Model | Serves |
|---|---|---|
| `[projectId, createdAt]` | `ImportJob` | FR-077 newest-first history paging |
| `[projectId, status, createdAt]` | `ImportJob` | "running imports in this project" filter + sort in one scan |
| `[userId]` | `ImportJob` | "my imports"; per-user concurrency checks |
| `[targetLayerId]` | `ImportJob` | "what was imported into this layer" |
| `[importJobId, sourcePosition]` | `ImportIssue` | Issue listing in source order + cursor paging |
| `[importJobId]` | `Feature` | **Rollback** — `DELETE ... WHERE "importJobId" = ?` (FR-072) |
| `[projectId, createdAt]` | `ExportJob` | *(existing)* FR-077 export history paging |
| GiST on `Feature.geometry` | `Feature` | *(existing)* narrows the duplicate probe (research.md Decision 8) |

The `Feature.[importJobId]` index is the one that carries a hard requirement: without it, rollback
of a 1,000-feature import inside a 500,000-feature layer is a sequential scan.

---

## Rejected models

Four of the seven models in the feature brief are not created. Each rejection and its
replacement (research.md Decision 15):

| Requested | Verdict | Replacement |
|---|---|---|
| `ImportHistory` | Rejected | `ImportJob` rows are the history — they are never deleted, and every column FR-075 lists is already on them. A parallel table would need dual writes and would drift. |
| `ExportHistory` | Rejected | `ExportJob` rows are the history, and the repository + route + hook that read them already exist. |
| `FileMetadata` | Rejected | `ImportJob.fileName` / `fileSizeBytes` / `mimeType` / `fileHash`. There is no file to describe beyond that — no bytes are ever stored server-side (research.md Decision 2). |
| `ExportStatistics` | Rejected | `ExportJob.featureCount` / `layerCount` / `status` / `errorMessage`. |

This mirrors 007's research Decision 1, which refused the same split for
`AnalysisJob`/`AnalysisHistory`/`AnalysisResult` because `AnalysisRun` already held the concern.

---

## Retention policy

| Data | Retention | Mechanism |
|---|---|---|
| `ImportJob` | Life of the project | Cascade on project delete; no TTL |
| `ImportIssue` | Life of its job | Cascade; capped at 1,000 rows per job at write time |
| `ExportJob` | Life of the project | *(existing behavior, unchanged)* |
| Uploaded file bytes | **Never stored** | research.md Decision 2 |
| In-session full issue report | Until the tab closes | Held in `importStore`; downloadable while present |

No independent TTL or pruning job is introduced. This matches 007's research Decision 11
("analysis history retention matches the project's own lifecycle; no independent TTL") and avoids
the scheduler that research.md Decision 17 already ruled out for a different reason. Should
history volume become a problem, the `[projectId, createdAt]` index makes a future pruning job
straightforward — but adding one now would be speculative.

---

## Migration notes

**One migration**, `add_import_jobs_and_export_scope`, entirely additive:

1. `CREATE TABLE "ImportJob"` + its four indexes.
2. `CREATE TABLE "ImportIssue"` + its index.
3. `ALTER TABLE "Feature" ADD COLUMN "importJobId" TEXT NULL` + FK (`ON DELETE SET NULL`) +
   `CREATE INDEX`.
4. `ALTER TABLE "ExportJob" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'layer'`,
   `ADD COLUMN "outputCrs" TEXT NULL`, `ADD COLUMN "layerCount" INTEGER NULL`.

Notes:

- **No backfill.** Every added column is nullable or defaulted. Existing `Feature` rows correctly
  read as `importJobId = NULL` ("not from a tracked import"); existing `ExportJob` rows correctly
  read as `scope = 'layer'`.
- **No `Feature` rewrite.** Adding a nullable column with no default is a metadata-only operation
  in PostgreSQL 11+ — it does not rewrite the table, which matters because `Feature` is the
  largest table in the schema.
- **Index creation** should use `CREATE INDEX CONCURRENTLY` on a populated production `Feature`
  table. Prisma Migrate does not emit `CONCURRENTLY`, so the generated SQL is hand-edited for that
  one statement — flagged in plan.md Deployment Notes.
- `ST_Transform` requires `spatial_ref_sys` to be populated, which the PostGIS extension does on
  install. No seeding is needed; the migration should assert the table is non-empty so a
  misconfigured environment fails at migrate time rather than at first import.
- Applied with `prisma migrate dev` locally and `prisma migrate deploy` in CI/production
  (Constitution Principle III). No manual DDL.
