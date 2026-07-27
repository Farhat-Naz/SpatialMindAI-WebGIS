/**
 * Named, typed configuration for the import pipeline (specs/005-import-export,
 * T001). Every later module imports its sizes, thresholds, and caps from here
 * — no magic numbers are scattered through the parsers, worker, hooks, or
 * repository.
 */

/**
 * Features committed per chunk (research.md Decision 3). Sized so a single
 * chunk's insert stays well under two seconds, which is what lets the
 * chunk-boundary cancellation check meet SC-004's two-second budget without
 * interrupting an in-flight statement.
 */
export const IMPORT_CHUNK_SIZE = 1000

/**
 * Above this many features the preflight runs in a Web Worker rather than on
 * the main thread (research.md Decision 7). Below it, the cost of spinning up
 * a worker outweighs the blocking it avoids.
 */
export const IMPORT_WORKER_THRESHOLD = 5000

/**
 * Client-side maximum upload size in bytes (FR-081). This is the UX mirror of
 * the server's `IMPORT_MAX_FILE_BYTES` environment value — it exists so a user
 * with a 200 MB file learns that in milliseconds instead of after a long read.
 * The server value is the configurable one; see `src/server/config/env.ts`.
 */
export const IMPORT_MAX_FILE_BYTES = 50 * 1024 * 1024

/**
 * Maximum `ImportIssue` rows persisted per job (research.md Decision 16). A
 * 100,000-row CSV with a mis-mapped coordinate column would otherwise write
 * more issue rows than the import itself. `ImportJob`'s counters stay exact
 * regardless of this cap.
 */
export const IMPORT_MAX_PERSISTED_ISSUES = 1000

/** Validation issues shown inline before the "download the full report" affordance (FR-058). */
export const IMPORT_INLINE_ISSUE_LIMIT = 100

/**
 * Maximum uncompressed-to-compressed ratio tolerated when extracting an
 * archive (FR-083) — the primary zip-bomb defence.
 */
export const ARCHIVE_MAX_EXPANSION_RATIO = 100

/** Maximum total uncompressed bytes tolerated from one archive (FR-083). */
export const ARCHIVE_MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024

/**
 * A `running` import whose `heartbeatAt` is older than this is treated as
 * abandoned and swept to a terminal state on the next history read (FR-074,
 * research.md Decision 17). Well beyond the worst realistic gap between chunk
 * commits, so a live-but-slow import cannot be swept out from under itself.
 */
export const ABANDONED_JOB_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Poll interval for `GET /api/imports/:id`, used **only** when a running job is
 * viewed by a tab that is not driving it — after a reload, or from another
 * device (research.md Decision 12). The driving tab reads progress from
 * `importStore` and polls not at all.
 */
export const IMPORT_PROGRESS_POLL_MS = 2000

/** Default page size for the import-history listing, matching `listExportsForProject`. */
export const IMPORT_HISTORY_DEFAULT_LIMIT = 20

/** Maximum page size for the import-history listing, matching `listExportsForProject`. */
export const IMPORT_HISTORY_MAX_LIMIT = 100
