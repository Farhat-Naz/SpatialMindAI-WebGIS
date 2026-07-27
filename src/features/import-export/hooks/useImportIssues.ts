"use client"

import { useQuery } from "@tanstack/react-query"
import { IMPORT_INLINE_ISSUE_LIMIT } from "../types/importExport.constants"
import { importService } from "../services/importService"
import { queryKeys } from "../services/queryKeys"
import type { PagedParams } from "../types/importExport.types"

/**
 * One page of a past import's persisted validation issues
 * (specs/005-import-export, T089; FR-057, FR-058).
 *
 * The default limit is `IMPORT_INLINE_ISSUE_LIMIT`, which is FR-058's inline
 * count — the number the Validation Report shows before offering a download.
 *
 * The response's `truncated` flag is deliberately surfaced rather than hidden:
 * history persists at most `IMPORT_MAX_PERSISTED_ISSUES` per job (research.md
 * Decision 16), and telling the user "the first 1,000 of a larger set" is honest
 * where silently showing 1,000 would not be. The **uncapped** list exists only
 * in the session that ran the import, in `importStore.preflight.issues`.
 */
export function useImportIssues(jobId: string | null, params: PagedParams = {}) {
  const withDefaults = { limit: IMPORT_INLINE_ISSUE_LIMIT, ...params }

  return useQuery({
    queryKey: queryKeys.importIssues(jobId ?? "", withDefaults),
    queryFn: () => importService.listIssues(jobId as string, withDefaults),
    enabled: Boolean(jobId),
  })
}
