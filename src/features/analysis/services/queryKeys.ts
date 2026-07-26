/**
 * Per-query freshness overrides (T264).
 *
 * The app-wide default is a 5-minute `staleTime`, which suits data that
 * only changes through a mutation this client made — presets, measurement
 * history, export history all invalidate themselves on write.
 *
 * Analysis *runs* are different: a run past
 * `BACKGROUND_EXECUTION_THRESHOLD` finishes on the server with no client
 * mutation to hang an invalidation off. Under the default the History list
 * would keep serving a cached page for five minutes and a job that had
 * already completed would simply not appear — the specific failure T264
 * names. These two keys are therefore treated as always worth rechecking
 * on mount, which costs one request per panel open and nothing while idle.
 */
export const ANALYSIS_QUERY_FRESHNESS = {
  /** Run listings: a background completion must show up the next time the panel is looked at. */
  runsStaleTimeMs: 0,
  /** One run's detail: the Progress Dialog polls this anyway; a stale terminal status here would show a finished job as still running. */
  runDetailStaleTimeMs: 0,
} as const

/**
 * Centralized React Query key factory for the analysis feature (Constitution
 * Principle V) — no hook constructs a query key inline.
 */
export const queryKeys = {
  analysisRuns: (projectId: string, params?: unknown) => ["projects", projectId, "analysisRuns", params] as const,
  /** Prefix shared by every filtered/paginated listing of a project's runs — see `database/services/queryKeys.ts`'s `featuresList` for why this is a separate, params-free key every mutation invalidates with. */
  analysisRunsList: (projectId: string) => ["projects", projectId, "analysisRuns"] as const,
  analysisRun: (runId: string) => ["analysisRuns", runId] as const,
  analysisPresets: (projectId: string) => ["projects", projectId, "analysisPresets"] as const,
  measurementHistory: (projectId: string, params?: unknown) =>
    ["projects", projectId, "measurementHistory", params] as const,
  measurementHistoryList: (projectId: string) => ["projects", projectId, "measurementHistory"] as const,
  exportHistory: (projectId: string, params?: unknown) => ["projects", projectId, "exportHistory", params] as const,
  exportHistoryList: (projectId: string) => ["projects", projectId, "exportHistory"] as const,
}
