import type { SaveVersionInput, VersionDetail, VersionMetadata } from "@/shared/contracts/version.schema"
import { apiFetch } from "./apiFetch"

export interface VersionDiff {
  addedFeatureIds: string[]
  removedFeatureIds: string[]
  changedFeatureIds: string[]
}

/** Client-side fetch wrappers for the version-history API (FR-026–FR-030). */
export const versionService = {
  listVersions(projectId: string): Promise<{ versions: VersionMetadata[] }> {
    return apiFetch(`/api/projects/${projectId}/versions`)
  },
  saveVersion(projectId: string, input: SaveVersionInput): Promise<{ version: VersionDetail }> {
    return apiFetch(`/api/projects/${projectId}/versions`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },
  getVersion(versionId: string): Promise<{ version: VersionDetail }> {
    return apiFetch(`/api/versions/${versionId}`)
  },
  restoreVersion(versionId: string): Promise<{ version: VersionDetail }> {
    return apiFetch(`/api/versions/${versionId}/restore`, { method: "POST" })
  },
  compareVersions(versionAId: string, versionBId: string): Promise<{ diff: VersionDiff }> {
    return apiFetch(`/api/versions/compare?a=${versionAId}&b=${versionBId}`)
  },
}
