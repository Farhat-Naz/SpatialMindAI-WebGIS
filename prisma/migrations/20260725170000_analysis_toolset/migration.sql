-- AlterTable: widen AnalysisRun for background-job semantics
-- (specs/007-spatial-analysis, data-model.md). `userId` is added nullable
-- first, backfilled from the owning Project's ownerId (every pre-007 run
-- necessarily predates multi-member projects and was run by the owner),
-- then tightened to NOT NULL — the standard add-nullable→backfill→tighten
-- shape for a non-empty existing table (data-model.md Migration Notes).
ALTER TABLE "AnalysisRun" ADD COLUMN     "backendPid" INTEGER,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "executionTimeMs" INTEGER,
ADD COLUMN     "presetId" TEXT,
ADD COLUMN     "progress" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT;

-- Backfill (T028): every pre-existing AnalysisRun row gets its owning
-- Project's ownerId as userId.
UPDATE "AnalysisRun"
SET "userId" = "Project"."ownerId"
FROM "Project"
WHERE "Project"."id" = "AnalysisRun"."projectId"
  AND "AnalysisRun"."userId" IS NULL;

-- Tighten: fails loudly (not silently) if any row could not be backfilled,
-- e.g. an orphaned AnalysisRun whose Project no longer exists.
ALTER TABLE "AnalysisRun" ALTER COLUMN "userId" SET NOT NULL;

-- CreateTable
CREATE TABLE "AnalysisPreset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementHistory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "measurementType" TEXT NOT NULL,
    "geometry" geometry(Geometry, 4326) NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceAnalysisRunId" TEXT,
    "sourceLayerId" TEXT,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "featureCount" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisPreset_projectId_operationType_idx" ON "AnalysisPreset"("projectId", "operationType");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisPreset_projectId_name_key" ON "AnalysisPreset"("projectId", "name");

-- CreateIndex
CREATE INDEX "MeasurementHistory_projectId_createdAt_idx" ON "MeasurementHistory"("projectId", "createdAt");

-- CreateIndex (hand-added — Constitution Principle III: every geometry
-- column MUST have a spatial index; matches Feature.geometry's original
-- migration's exact approach, T024).
CREATE INDEX "MeasurementHistory_geometry_gist_idx" ON "MeasurementHistory" USING GIST ("geometry");

-- CreateIndex
CREATE INDEX "ExportJob_projectId_createdAt_idx" ON "ExportJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_projectId_status_idx" ON "AnalysisRun"("projectId", "status");

-- CreateIndex
CREATE INDEX "AnalysisRun_userId_idx" ON "AnalysisRun"("userId");

-- CreateIndex
CREATE INDEX "AnalysisRun_presetId_idx" ON "AnalysisRun"("presetId");

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "AnalysisPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisPreset" ADD CONSTRAINT "AnalysisPreset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisPreset" ADD CONSTRAINT "AnalysisPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementHistory" ADD CONSTRAINT "MeasurementHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementHistory" ADD CONSTRAINT "MeasurementHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_sourceAnalysisRunId_fkey" FOREIGN KEY ("sourceAnalysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_sourceLayerId_fkey" FOREIGN KEY ("sourceLayerId") REFERENCES "Layer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint (hand-added, T026 — defense in depth beyond the
-- repository-layer check; data-model.md's validation rule: progress MUST
-- be null or 0-100).
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_progress_check" CHECK ("progress" IS NULL OR ("progress" >= 0 AND "progress" <= 100));
