"use client"

import { useQuery } from "@tanstack/react-query"
import { IMPORT_PROGRESS_POLL_MS } from "../types/importExport.constants"
import { importService } from "../services/importService"
import { queryKeys } from "../services/queryKeys"

/**
 * Reads a running import's progress from the server (specs/005-import-export,
 * T087; research.md Decision 12).
 *
 * **`enabled` is the whole point of this hook.** The tab that is driving an
 * import already holds both the numerator and the denominator in `importStore`,
 * updated as each chunk resolves — polling from that tab would issue ~100
 * pointless requests per import to learn something it already knows. So this
 * hook is enabled **only when this tab is not the driver**: after a reload, or
 * when the job is being watched from another device.
 *
 * Polling, not SSE. The stream endpoint 006 added is deliberately not used
 * here: this is a two-second refetch of one row, and a subscription would add a
 * connection lifecycle to manage for no gain.
 *
 * @param jobId  The import job to read. An empty string disables the query.
 * @param isDriver Whether *this* tab is running the import. When true, no request is made.
 */
export function useImportProgress(jobId: string | null, isDriver: boolean) {
  return useQuery({
    queryKey: queryKeys.importJob(jobId ?? ""),
    queryFn: () => importService.get(jobId as string),
    enabled: Boolean(jobId) && !isDriver,
    // Stops once the job reaches a terminal state: a completed job's row never
    // changes again, so continuing to poll would be pure waste.
    refetchInterval: (query) => {
      const status = query.state.data?.importJob.status
      return status && status !== "running" ? false : IMPORT_PROGRESS_POLL_MS
    },
  })
}
