import { beforeEach, describe, expect, it } from "vitest"
import type { PreflightResult } from "../../types/importExport.types"
import {
  selectIsRunning,
  selectNeedsCrsConfirmation,
  selectProgress,
  selectProgressPercent,
  selectStep,
  useImportStore,
  type ImportStep,
} from "../importStore"

/**
 * `importStore` tests (specs/005-import-export, T110).
 *
 * Every test resets the store first, so no mutable state is shared between cases
 * (Constitution Principle VII).
 */

function preflight(overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    features: [],
    totalFeatures: 0,
    issues: [],
    counts: { rejected: 0, duplicate: 0, repaired: 0 },
    duplicatePositions: [],
    detectedCrs: "EPSG:4326",
    previewBbox: null,
    ...overrides,
  }
}

beforeEach(() => {
  useImportStore.getState().reset()
})

describe("initial state", () => {
  it("starts idle, in lenient mode, with nothing selected", () => {
    const state = useImportStore.getState()
    expect(state.step).toBe("idle")
    // Lenient is the platform default (FR-006).
    expect(state.mode).toBe("lenient")
    expect(state.file).toBeNull()
    expect(state.preflight).toBeNull()
    expect(state.progress).toBeNull()
    expect(state.activeJobId).toBeNull()
  })
})

describe("step machine", () => {
  /** Drives the store to a step through a legal path so transitions can be tested from it. */
  function goTo(step: ImportStep): void {
    const { setStep } = useImportStore.getState()
    const paths: Record<ImportStep, ImportStep[]> = {
      idle: [],
      parsing: ["parsing"],
      mapping: ["parsing", "mapping"],
      crs: ["parsing", "crs"],
      confirming: ["parsing", "confirming"],
      running: ["parsing", "confirming", "running"],
      done: ["parsing", "confirming", "running", "done"],
    }
    for (const next of paths[step]) setStep(next)
    expect(useImportStore.getState().step).toBe(step)
  }

  it.each([
    ["idle", "parsing"],
    ["parsing", "mapping"],
    ["parsing", "crs"],
    ["parsing", "confirming"],
    ["mapping", "crs"],
    ["crs", "confirming"],
    ["confirming", "running"],
    ["running", "done"],
  ] as [ImportStep, ImportStep][])("allows %s → %s", (from, to) => {
    goTo(from)
    useImportStore.getState().setStep(to)
    expect(useImportStore.getState().step).toBe(to)
  })

  it.each([
    ["idle", "running"],
    ["idle", "confirming"],
    ["parsing", "running"],
    ["parsing", "done"],
    ["confirming", "done"],
    ["running", "confirming"],
    ["done", "running"],
    ["done", "parsing"],
  ] as [ImportStep, ImportStep][])("rejects %s → %s, leaving the step unchanged", (from, to) => {
    goTo(from)
    useImportStore.getState().setStep(to)
    expect(useImportStore.getState().step).toBe(from)
  })

  it("skips the mapping step for a non-CSV format", () => {
    // GeoJSON goes parsing → confirming directly; `mapping` is CSV-only.
    const { setStep } = useImportStore.getState()
    setStep("parsing")
    setStep("confirming")
    expect(useImportStore.getState().step).toBe("confirming")
  })

  it("allows returning from the gate to correct the CRS", () => {
    goTo("confirming")
    useImportStore.getState().setStep("crs")
    expect(useImportStore.getState().step).toBe("crs")
  })

  it("treats a transition to the current step as a no-op", () => {
    goTo("parsing")
    useImportStore.getState().setStep("parsing")
    expect(useImportStore.getState().step).toBe("parsing")
  })

  it("lets a running import reach done and go no further", () => {
    goTo("done")
    useImportStore.getState().setStep("idle")
    expect(useImportStore.getState().step).toBe("done")
  })
})

describe("setFile", () => {
  it("clears every downstream decision, since a new file invalidates them", () => {
    const store = useImportStore.getState()
    store.setPreflight(preflight({ totalFeatures: 5 }))
    store.setCrs({ code: "EPSG:27700", bboxPlausible: true })
    store.setColumnMapping({
      latitudeColumn: "lat",
      longitudeColumn: "lon",
      delimiter: ",",
      hasHeaderRow: true,
      attributeColumns: [],
    })
    store.setError("stale error")

    useImportStore.getState().setFile(new File(["{}"], "new.geojson"), "geojson")

    const after = useImportStore.getState()
    expect(after.file?.name).toBe("new.geojson")
    expect(after.sourceFormat).toBe("geojson")
    expect(after.preflight).toBeNull()
    expect(after.crs).toBeNull()
    expect(after.columnMapping).toBeNull()
    expect(after.error).toBeNull()
  })
})

describe("progress slice", () => {
  it("stores and clears progress", () => {
    useImportStore.getState().setProgress({ processed: 250, total: 1000 })
    expect(selectProgress(useImportStore.getState())).toEqual({ processed: 250, total: 1000 })

    useImportStore.getState().clearProgress()
    expect(selectProgress(useImportStore.getState())).toBeNull()
  })

  it("derives a clamped percentage", () => {
    useImportStore.getState().setProgress({ processed: 250, total: 1000 })
    expect(selectProgressPercent(useImportStore.getState())).toBe(25)

    // Clamped, so an over-count cannot show more than 100%.
    useImportStore.getState().setProgress({ processed: 1500, total: 1000 })
    expect(selectProgressPercent(useImportStore.getState())).toBe(100)
  })

  it("reports a null percentage when nothing is running", () => {
    expect(selectProgressPercent(useImportStore.getState())).toBeNull()
  })
})

describe("reset", () => {
  it("releases the file and the preflight issue list so they can be collected", () => {
    const issues = Array.from({ length: 500 }, (_, index) => ({
      sourcePosition: index,
      category: "duplicate_in_file" as const,
      message: "dup",
    }))

    const store = useImportStore.getState()
    store.setFile(new File(["{}"], "big.geojson"), "geojson")
    store.setPreflight(preflight({ issues, totalFeatures: 100_000 }))
    store.setStep("parsing")
    store.setProgress({ processed: 50_000, total: 100_000 })
    store.setActiveJobId("job-1")

    useImportStore.getState().reset()

    const after = useImportStore.getState()
    // Both references dropped — this is what makes the memory recoverable
    // (plan.md Performance).
    expect(after.file).toBeNull()
    expect(after.preflight).toBeNull()
    expect(after.step).toBe("idle")
    expect(after.progress).toBeNull()
    expect(after.activeJobId).toBeNull()
    expect(after.summary).toBeNull()
  })
})

describe("selectors", () => {
  it("selectIsRunning is true only while committing", () => {
    expect(selectIsRunning(useImportStore.getState())).toBe(false)
    const { setStep } = useImportStore.getState()
    setStep("parsing")
    setStep("confirming")
    setStep("running")
    expect(selectIsRunning(useImportStore.getState())).toBe(true)
  })

  it("selectNeedsCrsConfirmation flags an implausible bounding box (SC-010)", () => {
    expect(selectNeedsCrsConfirmation(useImportStore.getState())).toBe(false)

    useImportStore.getState().setCrs({ code: "EPSG:4326", bboxPlausible: false })
    expect(selectNeedsCrsConfirmation(useImportStore.getState())).toBe(true)

    useImportStore.getState().setCrs({ code: "EPSG:27700", bboxPlausible: true })
    expect(selectNeedsCrsConfirmation(useImportStore.getState())).toBe(false)
  })

  it("selectStep reads only the step", () => {
    useImportStore.getState().setStep("parsing")
    expect(selectStep(useImportStore.getState())).toBe("parsing")
  })
})

describe("no server state is shadowed", () => {
  it("holds an active job id, never a job record", () => {
    useImportStore.getState().setActiveJobId("job-42")
    const state = useImportStore.getState() as unknown as Record<string, unknown>

    expect(state.activeJobId).toBe("job-42")
    // A record — or any collection of them — would be the shadow cache the
    // Constitution forbids. History and job detail live in React Query.
    for (const key of ["importJob", "importJobs", "history", "imports", "jobs"]) {
      expect(state[key]).toBeUndefined()
    }
  })

  it("has no array-valued field that could hold server records", () => {
    const state = useImportStore.getState() as unknown as Record<string, unknown>
    const arrayFields = Object.entries(state)
      .filter(([, value]) => Array.isArray(value))
      .map(([key]) => key)

    // `preflight.issues` is nested inside a client-computed artifact, not a
    // top-level cache of server rows.
    expect(arrayFields).toEqual([])
  })
})
