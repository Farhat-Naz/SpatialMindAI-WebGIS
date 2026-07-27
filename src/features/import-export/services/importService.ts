import type {
  CommitImportChunkInput,
  ImportChunkResult,
} from "@/shared/contracts/importChunk.schema"
import type { ImportIssuePage } from "@/shared/contracts/importIssue.schema"
import type {
  CreateImportJobInput,
  ImportHistoryPage,
  ImportJobRecordDto,
  ImportStatus,
} from "@/shared/contracts/importJob.schema"
import type { PagedParams } from "../types/importExport.types"
import { apiFetch } from "./apiFetch"

/**
 * Client access to the eight import endpoints (specs/005-import-export, T071;
 * contracts/client-api.md "Services").
 *
 * **Thin wrappers only** (Constitution Principle I): no retry, no sequencing,
 * no validation beyond request shaping. Retry and chunk ordering live in
 * `importPipeline`; mutation sequencing lives in `useImport`. Keeping this file
 * logic-free is what lets both of those be tested without a network stub of
 * their own.
 *
 * Every request and response type is the `z.infer` of a schema module in
 * `src/shared/contracts/` — the same module the corresponding Route Handler
 * imports, so the two cannot drift (Constitution Principle II).
 *
 * The outline's "HistoryService" is `listForProject` and its "ProgressService"
 * is `get`. **Neither is a separate module**: both are one call against one
 * existing endpoint, and a file per call would be indirection with no reader
 * (research.md Decisions 12, 15).
 */

/** Serializes cursor paging params, omitting absent ones so the URL stays clean. */
function toQueryString(params?: PagedParams & { status?: ImportStatus }): string {
  if (!params) return ""
  const search = new URLSearchParams()
  if (params.cursor) search.set("cursor", params.cursor)
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.status) search.set("status", params.status)
  const query = search.toString()
  return query ? `?${query}` : ""
}

export const importService = {
  /**
   * Creates the job in `running` state (contracts/api-contracts.md §1).
   *
   * Called only *after* preflight and the user's confirmation — which is
   * precisely why abandoning at the confirmation gate writes nothing (FR-011):
   * the guarantee is that this call never happened, not that something was
   * cleaned up afterwards.
   */
  create(layerId: string, input: CreateImportJobInput): Promise<{ importJob: ImportJobRecordDto }> {
    return apiFetch(`/api/layers/${layerId}/imports`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },

  /**
   * Commits one chunk of at most `IMPORT_CHUNK_SIZE` features
   * (contracts/api-contracts.md §2).
   *
   * Coordinates are sent **untransformed, in the source CRS** — `ST_Transform`
   * runs server-side inside the insert (research.md Decision 4).
   *
   * Idempotent on `chunkIndex`, which is what makes `importPipeline`'s retry
   * safe: a replay after a network blip that actually reached the server
   * commits nothing new.
   */
  commitChunk(jobId: string, input: CommitImportChunkInput): Promise<ImportChunkResult> {
    return apiFetch(`/api/imports/${jobId}/chunks`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  },

  /** Transitions `running → succeeded | failed` and freezes the counters (contracts/api-contracts.md §3). */
  complete(
    jobId: string,
    outcome: "succeeded" | "failed",
    errorMessage?: string,
  ): Promise<{ importJob: ImportJobRecordDto }> {
    return apiFetch(`/api/imports/${jobId}/complete`, {
      method: "POST",
      body: JSON.stringify(errorMessage === undefined ? { outcome } : { outcome, errorMessage }),
    })
  },

  /**
   * Requests cancellation (contracts/api-contracts.md §4). Chunks already
   * committed **remain** — the confirmed design decision (spec Assumptions).
   *
   * This is the server-side half of cancellation: after it returns, the chunk
   * endpoint refuses further writes, so a request already in flight when the
   * user clicked Cancel cannot land (research.md Decision 13).
   */
  cancel(jobId: string): Promise<{ importJob: ImportJobRecordDto }> {
    return apiFetch(`/api/imports/${jobId}/cancel`, { method: "POST" })
  },

  /**
   * "Undo this import" — deletes exactly the features this job created
   * (contracts/api-contracts.md §5).
   *
   * The predicate is row-level provenance (`Feature.importJobId`), not a time
   * window, so a feature another user added to the same layer while the import
   * was running survives (FR-072, SC-011).
   */
  rollback(jobId: string): Promise<{ importJob: ImportJobRecordDto; deletedFeatureCount: number }> {
    return apiFetch(`/api/imports/${jobId}/rollback`, { method: "POST" })
  },

  /**
   * Reads one job's current state (contracts/api-contracts.md §6).
   *
   * Polled **only** when a running job is opened without an in-memory driver —
   * after a reload, or from another device. A tab running its own import reads
   * progress from `importStore`, because it already holds both the numerator
   * and the denominator (research.md Decision 12).
   */
  get(jobId: string): Promise<{ importJob: ImportJobRecordDto }> {
    return apiFetch(`/api/imports/${jobId}`)
  },

  /**
   * One page of a job's persisted validation issues
   * (contracts/api-contracts.md §7).
   *
   * `truncated: true` in the response is how the UI honestly states that
   * history holds the first `IMPORT_MAX_PERSISTED_ISSUES` of a larger set
   * (research.md Decision 16). The *uncapped* list is available only in the
   * session that ran the import, from `PreflightResult.issues`.
   */
  listIssues(jobId: string, params?: PagedParams): Promise<ImportIssuePage> {
    return apiFetch(`/api/imports/${jobId}/issues${toQueryString(params)}`)
  },

  /** One page of a project's import history, newest first (contracts/api-contracts.md §8). */
  listForProject(
    projectId: string,
    params?: PagedParams & { status?: ImportStatus },
  ): Promise<ImportHistoryPage> {
    return apiFetch(`/api/projects/${projectId}/imports${toQueryString(params)}`)
  },
}
