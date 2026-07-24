/**
 * Centralized React Query key factory for the collaboration feature
 * (Constitution Principle V) — no hook constructs a query key inline.
 */
export const queryKeys = {
  members: (projectId: string) => ["projects", projectId, "members"] as const,
  invitations: (projectId: string) => ["projects", projectId, "invitations"] as const,
  comments: (featureId: string) => ["features", featureId, "comments"] as const,
  activity: (projectId: string, params?: unknown) =>
    ["projects", projectId, "activity", params] as const,
  versions: (projectId: string) => ["projects", projectId, "versions"] as const,
  version: (versionId: string) => ["versions", versionId] as const,
  notifications: (params?: unknown) => ["notifications", params] as const,
  presence: (projectId: string) => ["projects", projectId, "presence"] as const,
}
