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
