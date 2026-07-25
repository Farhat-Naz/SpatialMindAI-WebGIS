/**
 * Operation categories drive both the Toolbox grouping (Phase 16) and the
 * chunk page size below — research.md Decision 5 calls for a per-operation
 * page size, and every operation in the same category shares one PostGIS
 * cost profile, so the category is the natural chunking unit rather than
 * one page size per individual `operationType`.
 */
export type AnalysisOperationCategory =
  | "buffer"
  | "query"
  | "measurement"
  | "overlay"
  | "geometry"
  | "statistics"
  | "raster"

/**
 * Feature-count chunk size per category (research.md Decision 5) — smaller
 * for categories whose PostGIS cost per feature is higher (pairwise overlay
 * ops), larger for cheap per-feature scans (single-layer statistics), so
 * the 100,000-feature target (spec Performance) stays responsive without
 * any single chunk's statement risking `statement_timeout`.
 */
export const CHUNK_PAGE_SIZE: Record<AnalysisOperationCategory, number> = {
  buffer: 500,
  query: 500,
  measurement: 500,
  overlay: 200,
  geometry: 500,
  statistics: 1000,
  raster: 500,
}

/**
 * Maximum `queued`/`running` `AnalysisRun`/`ExportJob` rows one user may
 * hold at once (research.md Decision 12) — keeps the platform-wide
 * 100-concurrent-job target (spec Performance) achievable without one
 * user's rapid-fire job creation starving everyone else.
 */
export const MAX_CONCURRENT_JOBS_PER_USER = 5

/**
 * Above this many features (the largest of an operation's input layers),
 * `createAnalysisRun` dispatches to the background `queued`/`running` path
 * instead of resolving synchronously within the request (research.md
 * Decision 5, FR-024) — small inputs keep 005's original fast, inline
 * behavior unchanged.
 */
export const BACKGROUND_EXECUTION_THRESHOLD = 500

/** Default `refetchInterval` (ms) for polling a non-terminal `AnalysisRun` (research.md Decision 5/6). */
export const DEFAULT_POLL_INTERVAL_MS = 2000

/**
 * A `running` run with no `progress` update in this long is treated as
 * stale ("did not complete") by a lazy check on read, per plan.md's Edge
 * Cases table — guards against a run stuck `running` forever if the
 * process executing it was killed mid-chunk.
 */
export const STALE_RUN_THRESHOLD_MINUTES = 10
