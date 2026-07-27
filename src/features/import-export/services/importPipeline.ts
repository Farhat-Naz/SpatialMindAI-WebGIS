import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import type { ImportChunkResult } from "@/shared/contracts/importChunk.schema"
import { isApiRequestError } from "@/shared/errors/apiRequestError"
import { abortError } from "../utils/abortError"
import { IMPORT_CHUNK_SIZE } from "../types/importExport.constants"
import type {
  ImportProgressState,
  ImportSourceFormat,
  NormalizedFeature,
  ParseOptions,
  PreflightResult,
  Position,
} from "../types/importExport.types"
import { parseCustomCrs, previewTransform } from "./crsCatalog"
import { importService } from "./importService"
import type { WorkerRequest, WorkerResponse } from "./importParser.worker"

/**
 * Import orchestration (specs/005-import-export, T009 + T074 + T082).
 *
 * Three concerns, each pure or independently testable:
 *
 * - `chunkFeatures` / `toProgress` — arithmetic, no worker, no file, no network
 * - `runPreflight` — drives the parser worker and assembles a `PreflightResult`
 * - `commitChunkWithRetry` — the bounded retry the chunked upload needs
 *
 * `runPreflight` makes **no network call whatsoever**. That is what makes
 * FR-011's guarantee trivially true: abandoning at the confirmation gate writes
 * nothing, because nothing has been written.
 */

// ---------------------------------------------------------------------------
// Chunking and progress (T009)
// ---------------------------------------------------------------------------

/**
 * Splits a feature list into commit-sized chunks (research.md Decision 3).
 * Total membership is preserved exactly: no feature is dropped or duplicated,
 * and order is stable, which is what makes `chunkIndex` a usable idempotency
 * key on retry.
 */
export function chunkFeatures<T>(features: readonly T[], size: number = IMPORT_CHUNK_SIZE): T[][] {
  if (size <= 0) {
    throw new Error("Chunk size must be greater than zero.")
  }
  const chunks: T[][] = []
  for (let index = 0; index < features.length; index += size) {
    chunks.push(features.slice(index, index + size))
  }
  return chunks
}

/**
 * Builds the progress readout FR-009 requires — both a percentage and the
 * processed-of-total pair.
 *
 * Clamped so it can never exceed 100% or report more processed than total: the
 * denominator comes from the client's preflight and is a display value only, so
 * a mismatch between it and what actually commits must degrade to a plausible
 * readout rather than a nonsensical one.
 */
export function toProgress(processed: number, total: number): ImportProgressState & { percent: number } {
  const safeTotal = Math.max(total, 0)
  const safeProcessed = Math.min(Math.max(processed, 0), safeTotal || processed)
  const percent = safeTotal === 0 ? 0 : Math.min(100, Math.round((safeProcessed / safeTotal) * 100))
  return { processed: safeProcessed, total: safeTotal, percent }
}

/**
 * Formats a progress state for display and for the polite live region (FR-088).
 *
 * Reads the **clamped** values from `toProgress`, not the raw input: clamping the
 * percentage but not the count would produce "100% — 1,500 of 1,000 features",
 * which is exactly the kind of nonsensical readout the clamping exists to
 * prevent.
 */
export function formatProgress(state: ImportProgressState): string {
  const { processed, total, percent } = toProgress(state.processed, state.total)
  return `${percent}% — ${processed.toLocaleString()} of ${total.toLocaleString()} features`
}

// ---------------------------------------------------------------------------
// Preflight (T074)
// ---------------------------------------------------------------------------

export interface PreflightOptions extends Omit<ParseOptions, "signal"> {
  format: ImportSourceFormat
  signal?: AbortSignal
  /** Called as batches arrive, so a long parse shows movement (FR-009, SC-003). */
  onProgress?: (processed: number) => void
}

/** How many positions are sampled for the transformation preview (FR-064). */
const PREVIEW_SAMPLE_SIZE = 200

/**
 * Collects a sample of source positions for the CRS preview.
 *
 * Sampled rather than exhaustive because the preview's job is to answer "are
 * these coordinates plausibly in the CRS I selected?", and a spread of a few
 * hundred positions answers that as well as a hundred thousand would while
 * costing nothing.
 */
function samplePositions(features: readonly NormalizedFeature[]): Position[] {
  const sample: Position[] = []
  if (features.length === 0) return sample

  const step = Math.max(1, Math.floor(features.length / PREVIEW_SAMPLE_SIZE))
  for (let index = 0; index < features.length && sample.length < PREVIEW_SAMPLE_SIZE; index += step) {
    const first = firstPosition(features[index].geometry.coordinates)
    if (first) sample.push(first)
  }
  return sample
}

/** Finds the first `[x, y]` pair inside an arbitrarily nested coordinate array. */
function firstPosition(coordinates: unknown): Position | null {
  if (!Array.isArray(coordinates)) return null
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [coordinates[0], coordinates[1]]
  }
  for (const child of coordinates) {
    const found = firstPosition(child)
    if (found) return found
  }
  return null
}

/**
 * Constructs the parser worker.
 *
 * **The `new URL(..., import.meta.url)` form is mandatory** — see the worker
 * module's own header. A `blob:` worker is blocked by this application's CSP at
 * runtime in production while working in development, so substituting one would
 * ship a bug that no local test catches (research.md Decision 7).
 */
function createWorker(): Worker {
  return new Worker(new URL("./importParser.worker.ts", import.meta.url), { type: "module" })
}

/**
 * Parses and validates a whole file in a worker, returning everything the
 * confirmation gate needs to describe what is about to happen (FR-005).
 *
 * The returned `issues` list is **uncapped** — it is the client-computed
 * artifact that makes FR-058's in-session full-report download possible, even
 * though only the first `IMPORT_MAX_PERSISTED_ISSUES` are ever persisted
 * (research.md Decision 16).
 */
export async function runPreflight(file: File, options: PreflightOptions): Promise<PreflightResult> {
  const { format, signal, onProgress, ...parseOptions } = options
  const worker = createWorker()

  try {
    return await new Promise<PreflightResult>((resolve, reject) => {
      const features: NormalizedFeature[] = []

      const onAbort = () => {
        worker.postMessage({ type: "cancel" } satisfies WorkerRequest)
        reject(abortError("The import was cancelled."))
      }
      signal?.addEventListener("abort", onAbort, { once: true })

      worker.onerror = (event) => {
        reject(new Error(event.message || "The file could not be read."))
      }

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data

        switch (message.type) {
          case "chunk":
            features.push(...message.features)
            onProgress?.(message.processed)
            return

          case "cancelled":
            reject(abortError("The import was cancelled."))
            return

          case "error":
            reject(new Error(message.message))
            return

          case "done": {
            // The preview transform runs on the main thread, not in the worker:
            // it needs proj4, and loading a second copy of it into the worker to
            // transform 200 positions would cost more than it saves.
            const crs = message.detectedCrs

            // Validated rather than converted: `parseCustomCrs` confirms the
            // definition actually transforms (returning null if not) and passes
            // it through in whichever format it arrived — a Shapefile `.prj`'s
            // WKT stays WKT. Both consumers accept both forms; see
            // `parseCustomCrs`'s doc comment for the one signature that does not,
            // and which `toCanonicalGeometry` therefore avoids.
            const definition = message.detectedCrsDefinition
              ? (parseCustomCrs(message.detectedCrsDefinition)?.proj4 ?? undefined)
              : undefined

            const preview = crs ? previewTransform(samplePositions(features), crs, definition) : null

            const result: PreflightResult = {
              features,
              totalFeatures: message.totalFeatures,
              issues: message.issues,
              counts: message.counts,
              duplicatePositions: message.duplicatePositions,
              detectedCrs: crs,
              previewBbox: preview?.bbox ?? null,
            }
            if (definition) result.detectedCrsDefinition = definition
            if (message.columns) result.columns = message.columns
            if (message.availableLayers) result.availableLayers = message.availableLayers
            resolve(result)
            return
          }
        }
      }

      worker.postMessage({ type: "parse", file, format, options: parseOptions } satisfies WorkerRequest)
    })
  } finally {
    // The worker is single-use: one file, one worker. Terminating rather than
    // pooling means a parser that crashed or leaked costs a worker, not the tab.
    worker.terminate()
  }
}

/**
 * Recomputes the preview bounding box for a CRS the user selected, without
 * re-parsing (FR-064).
 *
 * Separate from `runPreflight` because changing the CRS in `CrsSelector` must be
 * instant: the features are already in hand, and only the transform needs
 * redoing.
 */
export function previewForCrs(
  features: readonly NormalizedFeature[],
  crsCode: string,
  customDefinition?: string,
) {
  return previewTransform(samplePositions(features), crsCode, customDefinition)
}

// ---------------------------------------------------------------------------
// Chunk retry (T082)
// ---------------------------------------------------------------------------

/** Attempts per chunk, including the first. */
export const CHUNK_RETRY_ATTEMPTS = 3

/** Base backoff in milliseconds; doubled per attempt. */
export const CHUNK_RETRY_BASE_DELAY_MS = 500

/**
 * Sleeps, resolving early with a rejection if the signal aborts mid-wait —
 * which is the common case, since a user cancelling during a backoff should not
 * wait out the remaining delay before the import stops (SC-004).
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    // An already-aborted signal never fires `abort` again, so waiting on the
    // listener here would hang forever.
    return Promise.reject(abortError("The import was cancelled."))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(abortError("The import was cancelled."))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Commits one chunk, retrying a transient failure with bounded exponential
 * backoff.
 *
 * Retrying is only safe because the server is idempotent on
 * `(importJobId, chunkIndex)`: a request that actually reached the database
 * before the connection dropped is recognized on replay and commits nothing new
 * (research.md Decision 3). Without that guarantee this function would duplicate
 * features on every network blip — and across the ~100 requests a large import
 * makes, blips are routine rather than exceptional.
 *
 * **`CONFLICT` is never retried.** It means the job was cancelled or is already
 * terminal, so the correct response is to stop immediately: retrying would be
 * both futile and a way for a stale client to keep hammering a job the user
 * already abandoned (research.md Decision 13).
 *
 * A `RATE_LIMITED` **is** retried, because it is purely transient — the whole
 * point of the backoff.
 */
export async function commitChunkWithRetry(
  jobId: string,
  chunkIndex: number,
  features: NormalizedFeature[],
  options: {
    signal?: AbortSignal
    attempts?: number
    /** Base backoff, overridable so tests exercise the retry ladder without real waits. */
    baseDelayMs?: number
  } = {},
): Promise<ImportChunkResult> {
  const attempts = options.attempts ?? CHUNK_RETRY_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? CHUNK_RETRY_BASE_DELAY_MS
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    options.signal?.throwIfAborted()

    try {
      return await importService.commitChunk(jobId, { chunkIndex, features })
    } catch (error) {
      lastError = error

      // A cancelled or terminal job is permanent — stop, do not retry.
      if (isApiRequestError(error) && error.code === "CONFLICT") throw error

      // A client-side rejection (bad geometry, oversized chunk) will fail
      // identically every time; retrying only delays the report.
      if (isApiRequestError(error) && error.code === "INVALID_INPUT") throw error

      // Authorization and existence failures are equally permanent.
      if (
        isApiRequestError(error) &&
        (error.code === "FORBIDDEN" || error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED")
      ) {
        throw error
      }

      if (attempt === attempts) break
      await delay(baseDelayMs * 2 ** (attempt - 1), options.signal)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Chunk ${chunkIndex} could not be committed after ${attempts} attempts.`)
}

/**
 * Trims a preflight issue list to what the create-job request will persist.
 * The full list stays in the store for the in-session download (FR-058).
 */
export function toPersistableIssues(
  issues: readonly ImportIssueDraft[],
  cap: number,
): ImportIssueDraft[] {
  return issues.length <= cap ? [...issues] : issues.slice(0, cap)
}
