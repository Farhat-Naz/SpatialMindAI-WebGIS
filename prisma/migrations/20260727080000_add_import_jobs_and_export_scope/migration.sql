-- GIS Import & Export (specs/005-import-export, T028).
--
-- Entirely additive. Two new tables, one nullable column on Feature, three
-- nullable/defaulted columns on ExportJob. **No backfill statement appears in
-- this migration** — every added column is nullable or defaulted, so:
--
--   * existing Feature rows correctly read as importJobId = NULL
--     ("not created by a tracked import"), and
--   * existing ExportJob rows correctly read as scope = 'layer', which is what
--     every export written by 007 actually was.
--
-- No existing column is dropped, renamed, or retyped, so every currently
-- passing test keeps passing (data-model.md Migration notes).

-- ---------------------------------------------------------------------------
-- Guard: ST_Transform depends on a populated spatial_ref_sys (T030).
--
-- The PostGIS extension populates this table on install. Asserting it here
-- means a misconfigured environment fails loudly at migrate time rather than
-- silently at a user's first projected-coordinate import (research.md
-- Decision 4).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "spatial_ref_sys" LIMIT 1) THEN
    RAISE EXCEPTION
      'spatial_ref_sys is empty — PostGIS is not fully installed. Import coordinate transformation (ST_Transform) requires the EPSG catalog.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- CreateTable: ImportJob
--
-- This row IS the import history entry (research.md Decision 15) — there is no
-- separate ImportHistory table. The file* columns are provenance metadata
-- only; no uploaded bytes are stored anywhere (research.md Decision 2).
-- ---------------------------------------------------------------------------
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetLayerId" TEXT,
    "targetLayerName" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT,
    "fileHash" TEXT,
    "sourceCrs" TEXT NOT NULL,
    "customCrsDefinition" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'lenient',
    "columnMapping" JSONB,
    "status" TEXT NOT NULL DEFAULT 'running',
    "totalFeatures" INTEGER,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "repairedCount" INTEGER NOT NULL DEFAULT 0,
    "chunksCommitted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CreateTable: ImportIssue
--
-- Capped at 1,000 rows per job in application code (research.md Decision 16);
-- the cap is deliberately not a database constraint, because the counters on
-- ImportJob must stay exact even when the issue list is truncated.
-- ---------------------------------------------------------------------------
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "sourcePosition" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AlterTable: Feature gains import provenance (research.md Decision 14).
--
-- Adding a nullable column with no default is a metadata-only operation in
-- PostgreSQL 11+ — it does not rewrite the table, which matters because
-- Feature is the largest table in this schema.
-- ---------------------------------------------------------------------------
ALTER TABLE "Feature" ADD COLUMN     "importJobId" TEXT;

-- ---------------------------------------------------------------------------
-- AlterTable: ExportJob gains scope, output CRS, and layer count.
--
-- `format` is unchanged: it is already a TEXT column, so admitting 'pdf' is a
-- validation change (Zod), not a schema change.
-- ---------------------------------------------------------------------------
ALTER TABLE "ExportJob" ADD COLUMN     "layerCount" INTEGER,
ADD COLUMN     "outputCrs" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'layer';

-- CreateIndex
CREATE INDEX "ImportJob_projectId_createdAt_idx" ON "ImportJob"("projectId", "createdAt");

-- CreateIndex: filter-plus-sort for "running imports in this project".
-- `createdAt` is the third column for the reason established on AnalysisRun in
-- 20260727000000: on [projectId, status] alone the planner prefers
-- [projectId, createdAt] to satisfy the newest-first ordering and then filters
-- status row by row through the heap.
CREATE INDEX "ImportJob_projectId_status_createdAt_idx" ON "ImportJob"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_userId_idx" ON "ImportJob"("userId");

-- CreateIndex
CREATE INDEX "ImportJob_targetLayerId_idx" ON "ImportJob"("targetLayerId");

-- CreateIndex
CREATE INDEX "ImportIssue_importJobId_sourcePosition_idx" ON "ImportIssue"("importJobId", "sourcePosition");

-- CreateIndex: carries the rollback delete (FR-072).
--
-- Without this index, `DELETE FROM "Feature" WHERE "importJobId" = ?` is a
-- sequential scan of the whole layer's parent table.
--
-- OPERATIONAL NOTE (T029): on a large, live production Feature table, build
-- this index with `CREATE INDEX CONCURRENTLY` as a separate manual step
-- **before** deploying this migration, then let the statement below no-op via
-- IF NOT EXISTS. It is written as a plain CREATE INDEX here because Prisma
-- Migrate executes each migration file inside a transaction, and
-- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block — putting
-- CONCURRENTLY here would make the migration fail outright rather than run
-- online.
CREATE INDEX IF NOT EXISTS "Feature_importJobId_idx" ON "Feature"("importJobId");

-- ---------------------------------------------------------------------------
-- RESTORE: the spatial GiST index on Feature.geometry.
--
-- This index was created deliberately in 20260721203400_add_feature ("Prisma
-- has no schema-level syntax for an index method, so the spatial GiST index is
-- added manually here") and then **silently dropped** by
-- 20260724193417_add_collaboration_and_ops, which contains a bare
-- `DROP INDEX "Feature_geometry_gist_idx";` amid otherwise auto-generated
-- CreateEnum/CreateTable statements. That drop is `prisma migrate dev`
-- collateral, not a decision: Prisma cannot represent an index method on an
-- `Unsupported()` column, so it saw an index in the database that was absent
-- from the schema and emitted a drop to reconcile them.
--
-- Restoring it here because three things depend on it:
--   1. Constitution Principle III — "every column storing geometry or used in
--      a spatial predicate MUST have a spatial index (GiST)".
--   2. specs/005-import-export research.md Decision 8 — the existing-layer
--      duplicate probe narrows candidates with `&&` (bbox overlap) before
--      running ST_OrderingEquals. Without GiST that probe is a sequential scan
--      of the layer on every chunk.
--   3. The pre-existing bbox filter in `featureRepository.listFeaturesForLayer`
--      (`ST_Intersects(f.geometry, ST_MakeEnvelope(...))`), which has been
--      running without index support since 006 merged.
--
-- ⚠️ RECURRENCE RISK: a future `prisma migrate dev` will try to drop this index
-- again for the same reason. If a generated migration contains
-- `DROP INDEX "Feature_geometry_gist_idx"`, delete that line before applying.
CREATE INDEX IF NOT EXISTS "Feature_geometry_gist_idx" ON "Feature" USING GIST ("geometry");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SetNull, so deleting a layer never deletes its import history (FR-079).
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_targetLayerId_fkey" FOREIGN KEY ("targetLayerId") REFERENCES "Layer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SetNull, so deleting a history entry never deletes map data.
-- The reverse direction — deleting the features one import created — is the
-- explicit "Undo this import" action, which deletes by importJobId (FR-072).
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
