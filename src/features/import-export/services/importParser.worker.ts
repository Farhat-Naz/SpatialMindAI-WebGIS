/// <reference lib="webworker" />

import type { ImportIssueDraft } from "@/shared/contracts/importIssue.schema"
import { IMPORT_CHUNK_SIZE, IMPORT_MAX_PERSISTED_ISSUES } from "../types/importExport.constants"
import type {
  ImportSourceFormat,
  NormalizedFeature,
  ParseFile,
  ParseOptions,
} from "../types/importExport.types"
import { isAbortError } from "../utils/abortError"
import { DuplicateTracker } from "../utils/duplicateHash"
import { importIssueMessages } from "../utils/importErrors"
import { repairGeometry } from "../utils/repairGeometry"

/**
 * The parser Web Worker (specs/005-import-export, T075).
 *
 * Parsing and preflighting a 50 MB file is tens of seconds of synchronous CPU.
 * On the main thread that is a frozen tab; here it is a background task the user
 * can cancel, which is what makes SC-002's "interface interactive throughout"
 * achievable at all.
 *
 * ## The CSP-critical construction (research.md Decision 7)
 *
 * This worker MUST be constructed as:
 *
 * ```ts
 * new Worker(new URL("./importParser.worker.ts", import.meta.url), { type: "module" })
 * ```
 *
 * `next.config.ts` sets `script-src 'self' 'unsafe-inline'` and declares **no**
 * `worker-src`. `worker-src` falls back through `child-src` to `script-src`, and
 * `blob:` is not listed there — so `new Worker(URL.createObjectURL(...))`, which
 * several worker-helper libraries use internally, is **blocked at runtime in
 * production while working fine in dev**. The `new URL(..., import.meta.url)`
 * form emits a same-origin chunk under `/_next/static/`, which `'self'` permits.
 *
 * Do not substitute a blob-URL worker library, and **do not relax the CSP to
 * accommodate one** — a CSP diff in this feature's PR should be treated as a
 * review failure.
 *
 * ## Why the parsers are dynamically imported here
 *
 * Each format's library is loaded with `await import()` at the moment it is
 * needed (research.md Decision 10), so importing a GeoJSON file downloads
 * neither `shpjs`, `@tmcw/togeojson`, `jszip`, nor `papaparse`, and a user who
 * never imports downloads none of them (Constitution Principle V).
 */

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------

export interface ParseRequest {
  type: "parse"
  file: File
  format: ImportSourceFormat
  options: Omit<ParseOptions, "signal">
}

/** Cancellation: an `AbortSignal` cannot cross a worker boundary, so it is a message. */
export interface CancelRequest {
  type: "cancel"
}

export type WorkerRequest = ParseRequest | CancelRequest

/**
 * One batch of accepted features. Emitted as the worker goes so it never holds
 * the whole normalized array alongside the parser's own output.
 */
export interface ChunkMessage {
  type: "chunk"
  features: NormalizedFeature[]
  /** Features examined so far, for the progress readout during a long parse. */
  processed: number
}

export interface DoneMessage {
  type: "done"
  totalFeatures: number
  issues: ImportIssueDraft[]
  counts: { rejected: number; duplicate: number; repaired: number }
  /**
   * Source positions of in-file duplicates. The duplicates themselves stay in
   * the emitted feature stream so FR-056's "import them anyway" opt-in is
   * possible; by default the client drops these positions before committing.
   */
  duplicatePositions: number[]
  detectedCrs: string | null
  detectedCrsDefinition?: string
  columns?: string[]
  availableLayers?: string[]
}

export interface ErrorMessage {
  type: "error"
  message: string
}

export interface CancelledMessage {
  type: "cancelled"
}

export type WorkerResponse = ChunkMessage | DoneMessage | ErrorMessage | CancelledMessage

// ---------------------------------------------------------------------------
// Parser routing
// ---------------------------------------------------------------------------

/**
 * Loads exactly one parser. A `switch` with a literal specifier per branch is
 * required rather than a computed path: bundlers can only statically discover
 * and split a dynamic import whose specifier is a literal.
 */
async function loadParser(format: ImportSourceFormat): Promise<ParseFile> {
  switch (format) {
    case "geojson": {
      const { parseGeoJson } = await import("./parsers/geoJsonParser")
      return parseGeoJson
    }
    case "shapefile": {
      const { parseShapefile } = await import("./parsers/shapefileParser")
      return parseShapefile
    }
    case "kml":
    case "kmz": {
      const { parseKml } = await import("./parsers/kmlParser")
      return parseKml
    }
    case "csv": {
      const { parseCsv } = await import("./parsers/csvParser")
      return parseCsv
    }
  }
}

// ---------------------------------------------------------------------------
// Worker body
// ---------------------------------------------------------------------------

let controller: AbortController | null = null

/** Posts a response, narrowed so a malformed message cannot be sent by accident. */
function post(message: WorkerResponse): void {
  self.postMessage(message)
}

async function handleParse(request: ParseRequest): Promise<void> {
  controller = new AbortController()
  const signal = controller.signal

  const parse = await loadParser(request.format)
  const parsed = await parse(request.file, { ...request.options, signal })
  signal.throwIfAborted()

  // ---- Preflight: repair, de-duplicate, count, and emit in batches --------
  //
  // The parser's issues are carried forward; this pass adds the ones that need
  // cross-feature knowledge (in-file duplicates) or a transformation (ring
  // repair). Topology is deliberately *not* checked here — that is PostGIS
  // `ST_IsValid`'s job at commit time (research.md Decision 6), the split
  // `geometry.schema.ts`'s own doc comment already establishes.
  const issues: ImportIssueDraft[] = [...parsed.warnings]
  const duplicates = new DuplicateTracker()

  let rejected = 0
  let duplicate = 0
  let repaired = 0
  let accepted = 0
  const duplicatePositions: number[] = []

  // Issues are collected uncapped: the full list is what makes FR-058's
  // in-session download possible, and only the first
  // IMPORT_MAX_PERSISTED_ISSUES are ever sent to the server (research.md
  // Decision 16). A hard ceiling well above the persisted cap still guards
  // against a pathological file producing an unbounded array.
  const ISSUE_MEMORY_CEILING = IMPORT_MAX_PERSISTED_ISSUES * 100

  // Every issue category the parser already emitted that counts as a rejection
  // has removed its feature from `parsed.features`, so those are tallied from
  // the issue list rather than re-derived.
  for (const warning of parsed.warnings) {
    if (
      warning.category === "invalid_geometry" ||
      warning.category === "unsupported_geometry_type" ||
      warning.category === "out_of_range_coordinate" ||
      warning.category === "missing_coordinate"
    ) {
      rejected += 1
    }
  }

  let batch: NormalizedFeature[] = []

  for (let index = 0; index < parsed.features.length; index += 1) {
    if (index % 2000 === 0) signal.throwIfAborted()

    const feature = parsed.features[index]

    const repair = repairGeometry(feature.geometry)
    if (repair.repaired) {
      repaired += 1
      if (issues.length < ISSUE_MEMORY_CEILING) {
        issues.push({
          sourcePosition: feature.sourcePosition,
          category: "repaired_geometry",
          message: importIssueMessages.repairedGeometry(),
        })
      }
    }

    if (duplicates.isDuplicate(repair.geometry, feature.properties)) {
      duplicate += 1
      duplicatePositions.push(feature.sourcePosition)
      if (issues.length < ISSUE_MEMORY_CEILING) {
        issues.push({
          sourcePosition: feature.sourcePosition,
          category: "duplicate_in_file",
          message: importIssueMessages.duplicateInFile(feature.sourcePosition),
        })
      }
      // Deliberately NOT dropped here: the feature stays in the stream so the
      // user can opt into importing duplicates (FR-056). The default drop
      // happens client-side in `useImport.confirm`, where the toggle lives.
    } else {
      accepted += 1
    }

    batch.push({ ...feature, geometry: repair.geometry })

    if (batch.length >= IMPORT_CHUNK_SIZE) {
      post({ type: "chunk", features: batch, processed: index + 1 })
      // A fresh array rather than `batch.length = 0`: the posted array was
      // structured-cloned, but reusing the reference risks a subtle aliasing bug
      // for no benefit.
      batch = []
    }
  }

  if (batch.length > 0) {
    post({ type: "chunk", features: batch, processed: parsed.features.length })
  }

  duplicates.clear()

  const done: DoneMessage = {
    type: "done",
    // Total *read* from the source, which is what SC-006's
    // "imported + rejected + duplicate = total read" balances against.
    totalFeatures: accepted + rejected + duplicate,
    issues,
    counts: { rejected, duplicate, repaired },
    duplicatePositions,
    detectedCrs: parsed.detectedCrs,
  }
  if (parsed.detectedCrsDefinition) done.detectedCrsDefinition = parsed.detectedCrsDefinition
  if (parsed.columns) done.columns = parsed.columns
  if (parsed.availableLayers) done.availableLayers = parsed.availableLayers

  post(done)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  if (request.type === "cancel") {
    controller?.abort()
    return
  }

  void handleParse(request)
    .catch((error: unknown) => {
      if (isAbortError(error)) {
        post({ type: "cancelled" })
        return
      }
      post({
        type: "error",
        message: error instanceof Error ? error.message : "The file could not be read.",
      })
    })
    .finally(() => {
      controller = null
    })
}
