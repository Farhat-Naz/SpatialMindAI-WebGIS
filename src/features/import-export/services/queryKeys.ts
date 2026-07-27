/**
 * Centralized React Query key factory for the import/export feature
 * (Constitution Principle V — no hook constructs a query key inline).
 */
export const queryKeys = {
  /** One import job's current detail/status, polled only when this tab is not the driver. */
  importJob: (jobId: string) => ["imports", jobId] as const,

  /** One job's paginated validation issues. */
  importIssues: (jobId: string, params?: unknown) => ["imports", jobId, "issues", params] as const,

  /** One page of a project's import history. */
  importHistory: (projectId: string, params?: unknown) =>
    ["projects", projectId, "imports", params] as const,

  /**
   * Prefix shared by every paginated page of a project's import history —
   * `["projects", projectId, "imports"]`, one element shorter than
   * `importHistory()`. Deliberately distinct: React Query's
   * `invalidateQueries` matches by prefix, so invalidating with
   * `importHistory(projectId)` (whose trailing element is `undefined` when no
   * params are given) would only match the exact no-params page, leaving other
   * cached cursor pages stale. Every mutation that changes import history
   * (create/chunk/complete/cancel/rollback) invalidates with this prefix.
   *
   * The same trap is documented at length on `database/services/queryKeys.ts`'s
   * `featuresList()`; this follows that precedent rather than rediscovering it.
   */
  importHistoryList: (projectId: string) => ["projects", projectId, "imports"] as const,

  /**
   * Prefix for a project's export history. Deliberately **identical** to
   * 007's `analysis/services/queryKeys.ts` `exportHistoryList` — both read
   * `GET /api/projects/:projectId/exports`, so an export logged from this
   * feature must invalidate the Analysis panel's cached history too. A
   * different key here would leave that panel showing stale history after an
   * export performed from the Export dialog.
   */
  exportHistoryList: (projectId: string) => ["projects", projectId, "exportHistory"] as const,

  /** One page of a project's export history, matching 007's parameterized key. */
  exportHistory: (projectId: string, params?: unknown) =>
    ["projects", projectId, "exportHistory", params] as const,
}
