import { create } from "zustand"
import type { ColumnMapping, ImportMode } from "@/shared/contracts/importJob.schema"
import type {
  ImportProgressState,
  ImportSourceFormat,
  ImportSummary,
  PreflightResult,
} from "../types/importExport.types"
import { toProgress } from "../services/importPipeline"

/**
 * Import dialog session state (specs/005-import-export, T101, T103, T105, T107, T108).
 *
 * ## What is deliberately NOT here
 *
 * **No `ImportJobRecord` from the server is ever copied into this store.** Job
 * records live in React Query (`useImportProgress`, `useImportHistory`), because
 * copying server state into Zustand is exactly the shadow cache the Constitution
 * forbids — two sources of truth that drift the moment one is invalidated and
 * the other is not.
 *
 * `preflight` is the one apparent exception and it proves the rule: it is
 * computed **locally** by the parser worker and was never server state. Holding
 * it is also what makes FR-058's uncapped in-session issue download possible,
 * since only the first `IMPORT_MAX_PERSISTED_ISSUES` are ever sent to the server
 * (research.md Decision 16).
 *
 * `activeJobId` is an id, not a record — the pointer into React Query's cache,
 * not a copy of what it points at.
 *
 * **No history array, page cache, or record collection exists here** (T104).
 * History is server state; `useImportHistory` owns it.
 *
 * ## Why there is no `persist` middleware (T107)
 *
 * Three independent reasons, recorded so a later contributor does not add one:
 *
 * 1. A `File` handle **cannot be serialized**. Persisting the store would
 *    restore a session pointing at a file it can no longer read.
 * 2. A persisted half-finished preflight is stale by definition — the file on
 *    disk may have changed, and the counts would be presented as current.
 * 3. Cross-session recovery is already solved server-side: the `ImportJob` row
 *    is the system of record, and `useImportProgress` reads it after a reload
 *    (research.md Decisions 12, 17). Persisting here would add a second,
 *    less accurate recovery path.
 */

/**
 * The dialog's step machine. `mapping` is CSV-only; `crs` is skipped for KML,
 * which is WGS84 by specification. `confirming` is the FR-005 gate — the last
 * step before anything is written, and the reason abandoning is free (FR-011).
 */
export type ImportStep = "idle" | "parsing" | "mapping" | "crs" | "confirming" | "running" | "done"

/** The coordinate-system selection in progress (FR-060–FR-065). */
export interface CrsSelectionState {
  code: string
  /** proj4 or WKT text, present only when `code` is `"CUSTOM"` (FR-063). */
  custom?: string
  /**
   * Whether the transformed sample lands inside valid geographic bounds
   * (FR-065). False requires an explicit second confirmation before the import
   * may proceed (SC-010) — this is the single most valuable warning the feature
   * produces, because it catches projected coordinates about to be read as
   * degrees.
   */
  bboxPlausible: boolean
}

/**
 * Legal transitions out of each step. Encoded as data rather than as branches so
 * the machine is inspectable and testable, and so an illegal transition is a
 * single lookup rather than a scattered set of guards.
 *
 * `idle` is reachable from everywhere via `reset()`, which is not a transition
 * but an abandonment.
 */
const ALLOWED_TRANSITIONS: Record<ImportStep, readonly ImportStep[]> = {
  // `idle → mapping` exists for CSV, which is the one format whose columns must be
  // chosen *before* it can be parsed at all: `parseCsv` needs to be told which
  // columns are the coordinates, so the mapper is reached from a cheap header
  // preview rather than from a completed parse (FR-030).
  idle: ["parsing", "mapping"],
  // A parse can land on the CSV mapper, the CRS step, or straight at the gate,
  // depending on format and on whether the CRS was detected.
  parsing: ["mapping", "crs", "confirming", "idle"],
  mapping: ["parsing", "crs", "confirming"],
  crs: ["mapping", "confirming"],
  confirming: ["crs", "mapping", "running"],
  running: ["done"],
  // `done` goes nowhere: a finished import is reviewed and then dismissed via
  // `reset()`, which is what releases the retained file and issue list.
  done: [],
}

interface ImportState {
  file: File | null
  sourceFormat: ImportSourceFormat | null
  step: ImportStep
  preflight: PreflightResult | null
  crs: CrsSelectionState | null
  columnMapping: ColumnMapping | null
  mode: ImportMode
  /**
   * FR-056's opt-in: import in-file duplicates instead of skipping them.
   * Off by default — skipping is the platform behavior; this records an
   * explicit choice made at the confirmation gate.
   */
  importDuplicates: boolean
  progress: ImportProgressState | null
  activeJobId: string | null
  summary: ImportSummary | null
  /** The most recent user-facing failure, shown in the dialog (FR-090). */
  error: string | null

  setFile: (file: File | null, sourceFormat: ImportSourceFormat | null) => void
  setStep: (step: ImportStep) => void
  setPreflight: (preflight: PreflightResult | null) => void
  setCrs: (crs: CrsSelectionState | null) => void
  setColumnMapping: (mapping: ColumnMapping | null) => void
  setMode: (mode: ImportMode) => void
  setImportDuplicates: (value: boolean) => void
  setProgress: (progress: ImportProgressState | null) => void
  clearProgress: () => void
  setActiveJobId: (jobId: string | null) => void
  setSummary: (summary: ImportSummary | null) => void
  setError: (message: string | null) => void
  reset: () => void
}

/** Everything `reset()` restores, so the shape is stated once. */
const INITIAL_STATE = {
  file: null,
  sourceFormat: null,
  step: "idle" as ImportStep,
  preflight: null,
  crs: null,
  columnMapping: null,
  // Lenient is the platform default (FR-006): a partly-valid file is far more
  // often worth importing than rejecting wholesale.
  mode: "lenient" as ImportMode,
  importDuplicates: false,
  progress: null,
  activeJobId: null,
  summary: null,
  error: null,
}

export const useImportStore = create<ImportState>((set) => ({
  ...INITIAL_STATE,

  setFile: (file, sourceFormat) =>
    // A new file invalidates every downstream decision, so they are cleared
    // together rather than left to be individually overwritten later.
    set({
      file,
      sourceFormat,
      preflight: null,
      crs: null,
      columnMapping: null,
      summary: null,
      progress: null,
      error: null,
    }),

  /**
   * Advances the step machine, ignoring an illegal transition rather than
   * throwing.
   *
   * A rejected transition means a component asked for something the flow does
   * not allow — a bug, but not one worth turning into a crashed dialog mid-import
   * for the user. `importStore.test.ts` asserts the rejections explicitly, which
   * is where that class of bug is meant to be caught.
   */
  setStep: (step) =>
    set((state) => {
      if (step === state.step) return state
      return ALLOWED_TRANSITIONS[state.step].includes(step) ? { step } : state
    }),

  setPreflight: (preflight) => set({ preflight }),

  setCrs: (crs) => set({ crs }),

  setColumnMapping: (columnMapping) => set({ columnMapping }),

  setMode: (mode) => set({ mode }),

  setImportDuplicates: (importDuplicates) => set({ importDuplicates }),

  setProgress: (progress) => set({ progress }),

  clearProgress: () => set({ progress: null }),

  setActiveJobId: (activeJobId) => set({ activeJobId }),

  setSummary: (summary) => set({ summary }),

  setError: (error) => set({ error }),

  /**
   * Returns the store to `idle` and **releases the `File` reference and the
   * preflight issue list**.
   *
   * The release is the point, not a side effect: a 100,000-feature import holds
   * the whole normalized array plus a potentially very long issue list, and
   * without dropping both references, closing the dialog would leave that memory
   * pinned for the tab's lifetime (plan.md Performance — memory).
   */
  reset: () => set({ ...INITIAL_STATE }),
}))

// ---------------------------------------------------------------------------
// Narrow selectors (T106)
// ---------------------------------------------------------------------------

/**
 * Per-field selectors so a component subscribes to the minimum state it renders
 * (Constitution Principle V).
 *
 * This matters most during an import: `progress` updates once per chunk, roughly
 * a hundred times for a large file. A component subscribing to the whole store
 * object would re-render on every one of those ticks; subscribing to
 * `selectProgress` re-renders only the progress readout.
 */
export const selectStep = (state: ImportState): ImportStep => state.step
export const selectFile = (state: ImportState): File | null => state.file
export const selectSourceFormat = (state: ImportState): ImportSourceFormat | null => state.sourceFormat
export const selectPreflight = (state: ImportState): PreflightResult | null => state.preflight
export const selectCrs = (state: ImportState): CrsSelectionState | null => state.crs
export const selectColumnMapping = (state: ImportState): ColumnMapping | null => state.columnMapping
export const selectMode = (state: ImportState): ImportMode => state.mode
export const selectImportDuplicates = (state: ImportState): boolean => state.importDuplicates
export const selectProgress = (state: ImportState): ImportProgressState | null => state.progress
export const selectActiveJobId = (state: ImportState): string | null => state.activeJobId
export const selectSummary = (state: ImportState): ImportSummary | null => state.summary
export const selectImportError = (state: ImportState): string | null => state.error

/**
 * Progress as a whole number percentage, or null when no import is running.
 * Derived here rather than in a component so the clamping rules in `toProgress`
 * apply everywhere progress is shown.
 */
export const selectProgressPercent = (state: ImportState): number | null =>
  state.progress ? toProgress(state.progress.processed, state.progress.total).percent : null

/** True while an import is committing — the window in which Cancel is meaningful. */
export const selectIsRunning = (state: ImportState): boolean => state.step === "running"

/** Whether the transformed sample looked implausible, requiring a second confirmation (SC-010). */
export const selectNeedsCrsConfirmation = (state: ImportState): boolean =>
  state.crs !== null && !state.crs.bboxPlausible

export type { ImportState }
