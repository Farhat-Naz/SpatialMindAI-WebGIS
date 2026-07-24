/**
 * Centralized React Query key factory for the database feature (Constitution
 * Principle V) — no hook constructs a query key inline.
 */
export const queryKeys = {
  projects: () => ["projects"] as const,
  project: (projectId: string) => ["projects", projectId] as const,
  layers: (projectId: string) => ["projects", projectId, "layers"] as const,
  features: (layerId: string, params?: unknown) =>
    ["layers", layerId, "features", params] as const,
  /**
   * Prefix shared by every paginated page of a layer's feature list —
   * `["layers", layerId, "features"]`, one element shorter than
   * `features()`. Deliberately distinct: React Query's `invalidateQueries`
   * matches by prefix, so invalidating with `features(layerId)` (whose
   * trailing element is `undefined` when no params are given) would only
   * match the exact no-params page, leaving other cached cursor pages
   * stale. Every mutation that invalidates a layer's feature list
   * (create/update/delete/import/bulk-delete/undo) uses this prefix.
   */
  featuresList: (layerId: string) => ["layers", layerId, "features"] as const,
  feature: (featureId: string) => ["features", featureId] as const,
}
