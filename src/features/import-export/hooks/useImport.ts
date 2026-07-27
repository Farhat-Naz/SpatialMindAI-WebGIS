"use client"

import { useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { queryKeys as databaseQueryKeys } from "@/features/database/services/queryKeys"
import { CUSTOM_CRS_CODE } from "@/shared/contracts/crs.schema"
import { IMPORT_MAX_PERSISTED_ISSUES } from "../types/importExport.constants"
import {
  chunkFeatures,
  commitChunkWithRetry,
  runPreflight,
  toPersistableIssues,
  type PreflightOptions,
} from "../services/importPipeline"
import { isAbortError } from "../utils/abortError"
import { importService } from "../services/importService"
import { queryKeys } from "../services/queryKeys"
import { isBboxPlausible } from "../services/crsCatalog"
import { useImportStore } from "../store/importStore"

/**
 * The import orchestrator (specs/005-import-export, T086, T093–T096).
 *
 * **This is the only place the import sequence lives** (Constitution Principle
 * I). Services are thin wrappers, components are presentational, the store holds
 * session state — the ordering of preflight → gate → create → chunks → complete
 * is expressed here and nowhere else.
 *
 * The lifecycle:
 *
 * 1. `preflight` parses and validates the whole file in a worker and writes the
 *    result into `importStore`, opening the confirmation gate (FR-005).
 *    **No network call happens**, which is what makes FR-011's "abandoning
 *    writes nothing" guarantee trivially true rather than something to clean up.
 * 2. `confirm` creates the job, then commits chunks in order, updating
 *    `importStore.progress` as each resolves (FR-009, FR-069).
 * 3. **Strict mode**: the first chunk returning a non-empty `rejected[]` triggers
 *    an immediate rollback instead of a completion, so the observable outcome is
 *    exactly all-or-nothing (FR-006, research.md Decision 6).
 * 4. `cancel` aborts the local loop *and* tells the server, so a request already
 *    in flight is refused rather than merely unawaited (research.md Decision 13).
 * 5. `rollback` deletes exactly this import's features (FR-072).
 */
export function useImport(layerId: string, projectId: string) {
  const queryClient = useQueryClient()

  /**
   * Aborts the in-flight preflight or chunk loop. A ref rather than state
   * because aborting must not re-render, and because the loop needs to read the
   * *current* controller rather than one captured at render time.
   */
  const abortRef = useRef<AbortController | null>(null)

  /**
   * Invalidates everything an import changes.
   *
   * Both keys are **list prefixes**, one element shorter than their
   * parameterized counterparts, so `invalidateQueries` matches every cached
   * cursor page rather than only the no-params page — the trap documented at
   * length on `database/services/queryKeys.ts`'s `featuresList()`.
   *
   * `featuresList` is invalidated as well as the history, because imported
   * features must appear on the map without a manual refresh.
   */
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.importHistoryList(projectId) })
    void queryClient.invalidateQueries({ queryKey: databaseQueryKeys.featuresList(layerId) })
  }, [queryClient, projectId, layerId])

  // -------------------------------------------------------------------------
  // 1. Preflight — no network call
  // -------------------------------------------------------------------------

  const preflight = useCallback(
    async (file: File, options: Omit<PreflightOptions, "signal" | "onProgress">) => {
      const store = useImportStore.getState()
      const controller = new AbortController()
      abortRef.current = controller

      store.setFile(file, options.format)
      store.setStep("parsing")
      store.setError(null)

      try {
        const result = await runPreflight(file, {
          ...options,
          signal: controller.signal,
          // Progress during the parse itself: a 50 MB file takes long enough
          // that silence reads as a hang (SC-003).
          onProgress: (processed) => {
            useImportStore.getState().setProgress({ processed, total: 0 })
          },
        })

        const current = useImportStore.getState()
        current.setPreflight(result)
        current.clearProgress()

        // Seed the CRS selection from what the parser detected, with the
        // plausibility verdict already computed so the gate can warn (FR-065).
        // `detectedCrsDefinition` has already been validated by `runPreflight`;
        // it may be proj4 or WKT, and PostGIS's three-argument `ST_Transform`
        // accepts both.
        if (result.detectedCrs) {
          current.setCrs({
            code: result.detectedCrs,
            custom: result.detectedCrsDefinition,
            bboxPlausible: isBboxPlausible(result.previewBbox),
          })
        }

        // Where the flow lands: CSV needs its columns mapped, an undetected CRS
        // needs choosing, otherwise straight to the gate.
        if (options.format === "csv" && !options.columnMapping) {
          current.setStep("mapping")
        } else if (!result.detectedCrs) {
          current.setStep("crs")
        } else {
          current.setStep("confirming")
        }

        return result
      } catch (error) {
        const store2 = useImportStore.getState()
        store2.clearProgress()
        if (isAbortError(error)) {
          store2.setStep("idle")
          return null
        }
        store2.setError(error instanceof Error ? error.message : "The file could not be read.")
        store2.setStep("idle")
        throw error
      } finally {
        abortRef.current = null
      }
    },
    [],
  )

  // -------------------------------------------------------------------------
  // 2. Confirm — create the job, then commit chunks
  // -------------------------------------------------------------------------

  const confirm = useCallback(async () => {
    const store = useImportStore.getState()
    const { file, sourceFormat, preflight: result, crs, columnMapping, mode, importDuplicates } = store

    if (!file || !sourceFormat || !result || !crs) {
      throw new Error("An import cannot be confirmed before its file has been validated.")
    }

    const controller = new AbortController()
    abortRef.current = controller
    const startedAt = Date.now()

    store.setStep("running")
    store.setProgress({ processed: 0, total: result.totalFeatures })
    store.setError(null)

    // The file hash is provenance only and must never block an import, so a
    // browser without WebCrypto simply omits it (research.md Decision 2).
    const { hashFile } = await import("../utils/fileGuards")
    const fileHash = await hashFile(file)

    let jobId: string | null = null

    try {
      const { importJob } = await importService.create(layerId, {
        sourceFormat,
        fileName: file.name,
        fileSizeBytes: file.size,
        mimeType: file.type || undefined,
        fileHash,
        sourceCrs: crs.code,
        customCrsDefinition: crs.code === CUSTOM_CRS_CODE ? crs.custom : undefined,
        mode,
        totalFeatures: result.totalFeatures,
        columnMapping: columnMapping ?? undefined,
        // Only the first IMPORT_MAX_PERSISTED_ISSUES are sent; the full list
        // stays in the store for the in-session download (research.md D16).
        preflightIssues: toPersistableIssues(result.issues, IMPORT_MAX_PERSISTED_ISSUES),
        // When duplicates are being imported anyway (FR-056), they are no
        // longer "skipped as duplicate" — zeroing the count here is what keeps
        // imported + rejected + duplicate summing to total read (SC-006).
        preflightCounts: importDuplicates ? { ...result.counts, duplicate: 0 } : result.counts,
      })

      jobId = importJob.id
      useImportStore.getState().setActiveJobId(jobId)

      // FR-056: in-file duplicates are skipped by default; the gate's opt-in
      // imports them instead. The features are all still in `result.features` —
      // the worker only *identified* the duplicates, precisely so this decision
      // could wait until the user made it.
      //
      // When importing anyway, the preflight duplicate count was reported as 0
      // on the job (see the create call above), keeping SC-006's balance:
      // imported + rejected + duplicate = total read, with the duplicates now
      // landing in `imported`. Known limitation: a duplicate committed in a
      // *later* chunk than its original is still caught by the server's
      // in-layer probe — same-chunk copies import cleanly.
      const duplicateSet = new Set(result.duplicatePositions)
      const featuresToCommit = importDuplicates
        ? result.features
        : result.features.filter((feature) => !duplicateSet.has(feature.sourcePosition))

      const chunks = chunkFeatures(featuresToCommit)
      let committed = 0
      let processed = 0
      let rejectedTotal = 0
      let duplicateTotal = 0
      let strictFailure = false

      for (let index = 0; index < chunks.length; index += 1) {
        controller.signal.throwIfAborted()

        const chunkResult = await commitChunkWithRetry(jobId, index, chunks[index], {
          signal: controller.signal,
        })

        committed += chunkResult.committed
        rejectedTotal = chunkResult.job.rejectedCount
        duplicateTotal = chunkResult.job.duplicateCount

        // Progress counts every feature the chunk accounted for, not only what
        // committed, so the readout advances even through a chunk that was
        // entirely duplicates. Accumulated from each chunk's actual length
        // rather than `index * size`, because the final chunk is short.
        processed += chunks[index].length
        useImportStore.getState().setProgress({
          processed,
          total: result.totalFeatures,
        })

        // Strict mode: the first commit-time rejection ends the import as a
        // rollback rather than a completion (research.md Decision 6).
        if (mode === "strict" && chunkResult.rejected.length > 0) {
          strictFailure = true
          break
        }
      }

      if (strictFailure) {
        const { deletedFeatureCount } = await importService.rollback(jobId)
        const finalStore = useImportStore.getState()
        finalStore.setSummary({
          totalRead: result.totalFeatures,
          // Nothing net-written: the rollback removed everything this job added.
          imported: 0,
          rejected: rejectedTotal,
          duplicate: duplicateTotal,
          repaired: result.counts.repaired,
          elapsedMs: Date.now() - startedAt,
          jobId,
        })
        finalStore.setError(
          `Strict mode: ${rejectedTotal} feature(s) could not be imported, so all ` +
            `${deletedFeatureCount} already-imported feature(s) were removed. ` +
            "Nothing was added to the layer.",
        )
        finalStore.setStep("done")
        return
      }

      await importService.complete(jobId, "succeeded")

      const finalStore = useImportStore.getState()
      finalStore.setSummary({
        totalRead: result.totalFeatures,
        imported: committed,
        rejected: rejectedTotal,
        duplicate: duplicateTotal,
        repaired: result.counts.repaired,
        elapsedMs: Date.now() - startedAt,
        jobId,
      })
      finalStore.setStep("done")
    } catch (error) {
      const aborted = isAbortError(error)

      // A cancelled import is not a failure: chunks already committed remain,
      // and `cancel` has already told the server (spec Assumptions).
      if (!aborted && jobId) {
        // Best-effort: if marking the job failed also fails, the heartbeat sweep
        // will still give it a terminal state (FR-074).
        await importService
          .complete(jobId, "failed", error instanceof Error ? error.message : "Import failed.")
          .catch(() => undefined)
      }

      const store2 = useImportStore.getState()
      if (!aborted) {
        store2.setError(error instanceof Error ? error.message : "The import failed.")
      }
      store2.setStep("done")
      if (!aborted) throw error
    } finally {
      abortRef.current = null
      invalidate()
    }
  }, [layerId, invalidate])

  // -------------------------------------------------------------------------
  // 3. Cancel (T093)
  // -------------------------------------------------------------------------

  /**
   * Stops an import.
   *
   * Two halves, and both are necessary. Aborting the controller stops this tab
   * sending further chunks — that is the part that meets SC-004's two-second
   * target, because the check happens at a chunk boundary rather than
   * interrupting a statement. Calling the server makes it a *guarantee*: after
   * `cancel` returns, the chunk endpoint responds `409` to anything already in
   * flight, so a stale or hostile client cannot keep writing (research.md
   * Decision 13).
   */
  const cancel = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = null

    const jobId = useImportStore.getState().activeJobId
    if (!jobId) {
      useImportStore.getState().setStep("idle")
      return
    }

    try {
      const { importJob } = await importService.cancel(jobId)
      const store = useImportStore.getState()
      // FR-070: the summary must state how many features were imported before
      // the cancellation, and those features remain.
      store.setSummary({
        totalRead: store.preflight?.totalFeatures ?? importJob.totalFeatures ?? 0,
        imported: importJob.importedCount,
        rejected: importJob.rejectedCount,
        duplicate: importJob.duplicateCount,
        repaired: importJob.repairedCount,
        elapsedMs: 0,
        jobId,
      })
      store.setStep("done")
    } finally {
      invalidate()
    }
  }, [invalidate])

  // -------------------------------------------------------------------------
  // 4. Rollback (T094)
  // -------------------------------------------------------------------------

  /**
   * "Undo this import" — removes exactly the features one job created (FR-072).
   *
   * Available from every terminal state, `succeeded` included, and takes an
   * explicit `jobId` so it can be invoked from the history panel for a past
   * import, not only for the one just finished.
   */
  const rollback = useCallback(
    async (jobId: string) => {
      try {
        const { deletedFeatureCount } = await importService.rollback(jobId)
        return deletedFeatureCount
      } finally {
        invalidate()
      }
    },
    [invalidate],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    useImportStore.getState().reset()
  }, [])

  return { preflight, confirm, cancel, rollback, reset }
}
