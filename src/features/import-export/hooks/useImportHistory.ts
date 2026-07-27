"use client"

import { useQuery } from "@tanstack/react-query"
import type { ImportStatus } from "@/shared/contracts/importJob.schema"
import { importService } from "../services/importService"
import { queryKeys } from "../services/queryKeys"
import type { PagedParams } from "../types/importExport.types"

export interface ImportHistoryParams extends PagedParams {
  status?: ImportStatus
}

/**
 * Cursor-paginated import history for a project (specs/005-import-export, T088;
 * FR-075, FR-077), newest first.
 *
 * Modeled directly on 007's `useExportHistory` — same shape, same paging
 * convention, same `enabled` guard — because the two panels sit side by side and
 * behaving differently would be a difference the user has to learn for no reason.
 *
 * There is no `ImportHistory` table behind this: `ImportJob` rows *are* the
 * history (research.md Decision 15). The read is also where the abandoned-job
 * sweep runs server-side, so opening this panel is what gives a job whose tab
 * closed a terminal state (FR-074, research.md Decision 17).
 */
export function useImportHistory(projectId: string, params: ImportHistoryParams = {}) {
  return useQuery({
    queryKey: queryKeys.importHistory(projectId, params),
    queryFn: () => importService.listForProject(projectId, params),
    enabled: Boolean(projectId),
  })
}
