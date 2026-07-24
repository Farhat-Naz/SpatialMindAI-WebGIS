import type { FeatureLock } from "@/shared/contracts/lock.schema"
import { apiFetch } from "./apiFetch"

/** Client-side fetch wrappers for the feature-lock API (US3). */
export const lockService = {
  acquireLock(featureId: string): Promise<{ lock: FeatureLock }> {
    return apiFetch(`/api/features/${featureId}/lock`, { method: "POST" })
  },
  releaseLock(featureId: string): Promise<void> {
    return apiFetch(`/api/features/${featureId}/lock`, { method: "DELETE" })
  },
}
