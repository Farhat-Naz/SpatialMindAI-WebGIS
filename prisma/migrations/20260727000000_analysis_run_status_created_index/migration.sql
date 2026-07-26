-- Widen AnalysisRun's project+status index to carry the sort key
-- (specs/007-spatial-analysis, T260).
--
-- Analysis History is always ordered newest-first. On `[projectId,
-- status]` alone the planner ignored this index for a filtered history
-- query and used `[projectId, createdAt]` instead — satisfying the ORDER
-- BY but re-checking `status` row by row through the heap (EXPLAIN ANALYZE
-- over a seeded 100,000-row table: an Index Scan Backward returning 0 rows
-- after 5.1ms). With `createdAt` as the third column one index scan
-- serves the filter and the ordering together.
--
-- Index count is unchanged: this replaces the two-column index rather
-- than adding a third one alongside it.
DROP INDEX IF EXISTS "AnalysisRun_projectId_status_idx";

CREATE INDEX "AnalysisRun_projectId_status_createdAt_idx"
  ON "AnalysisRun" ("projectId", "status", "createdAt");
