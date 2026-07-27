import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiRequestError } from "@/shared/errors/apiRequestError"
import type { ImportChunkResult } from "@/shared/contracts/importChunk.schema"
import { IMPORT_CHUNK_SIZE } from "../../types/importExport.constants"
import type { NormalizedFeature, PreflightResult } from "../../types/importExport.types"
import * as pipeline from "../../services/importPipeline"
import { importService } from "../../services/importService"
import { useImportStore } from "../../store/importStore"
import { useImport } from "../useImport"

/**
 * `useImport` lifecycle tests (specs/005-import-export, T098).
 *
 * Each test builds a **fresh `QueryClient`**, so no cache leaks between cases.
 *
 * `runPreflight` is stubbed rather than exercised: it spawns a real Web Worker,
 * which jsdom does not provide, and the parsing it drives is already covered by
 * the parser suites. What these tests are actually about is the *sequence* — the
 * one thing that lives only in this hook.
 */

const LAYER_ID = "layer-1"
const PROJECT_ID = "project-1"

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function feature(index: number): NormalizedFeature {
  return { sourcePosition: index, geometry: { type: "Point", coordinates: [index, 0] }, properties: {} }
}

function preflightResult(featureCount: number, overrides: Partial<PreflightResult> = {}): PreflightResult {
  return {
    features: Array.from({ length: featureCount }, (_, index) => feature(index)),
    totalFeatures: featureCount,
    issues: [],
    counts: { rejected: 0, duplicate: 0, repaired: 0 },
    duplicatePositions: [],
    detectedCrs: "EPSG:4326",
    previewBbox: [0, 0, 1, 1],
    ...overrides,
  }
}

function chunkResult(committed: number, rejected: ImportChunkResult["rejected"] = []): ImportChunkResult {
  return {
    chunkIndex: 0,
    committed,
    rejected,
    job: {
      importedCount: committed,
      rejectedCount: rejected.length,
      duplicateCount: 0,
      status: "running",
    },
  }
}

/** Puts the store in the post-preflight state `confirm` requires. */
function stageConfirmable(featureCount: number, mode: "strict" | "lenient" = "lenient"): void {
  const store = useImportStore.getState()
  store.setFile(new File(["{}"], "parcels.geojson"), "geojson")
  store.setPreflight(preflightResult(featureCount))
  store.setCrs({ code: "EPSG:4326", bboxPlausible: true })
  store.setMode(mode)
  store.setStep("parsing")
  useImportStore.getState().setStep("confirming")
}

let create: ReturnType<typeof vi.spyOn>
let commitChunk: ReturnType<typeof vi.spyOn>
let complete: ReturnType<typeof vi.spyOn>
let cancelJob: ReturnType<typeof vi.spyOn>
let rollbackJob: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useImportStore.getState().reset()

  create = vi
    .spyOn(importService, "create")
    .mockResolvedValue({ importJob: { id: "job-1" } } as never)
  commitChunk = vi.spyOn(importService, "commitChunk").mockResolvedValue(chunkResult(1) as never)
  complete = vi.spyOn(importService, "complete").mockResolvedValue({ importJob: {} } as never)
  cancelJob = vi.spyOn(importService, "cancel").mockResolvedValue({
    importJob: {
      status: "cancelled",
      importedCount: 2000,
      rejectedCount: 0,
      duplicateCount: 0,
      repairedCount: 0,
      totalFeatures: 5000,
    },
  } as never)
  rollbackJob = vi
    .spyOn(importService, "rollback")
    .mockResolvedValue({ importJob: {}, deletedFeatureCount: 3 } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("preflight", () => {
  it("makes no network call, so abandoning at the gate writes nothing (FR-011)", async () => {
    vi.spyOn(pipeline, "runPreflight").mockResolvedValue(preflightResult(3))
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.preflight(new File(["{}"], "a.geojson"), { format: "geojson" })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    // The gate is open, and nothing has been written.
    expect(useImportStore.getState().step).toBe("confirming")
  })

  it("seeds the CRS selection with the detected code and its plausibility verdict", async () => {
    vi.spyOn(pipeline, "runPreflight").mockResolvedValue(
      preflightResult(1, { detectedCrs: "EPSG:27700", previewBbox: [-1, 51, 0, 52] }),
    )

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.preflight(new File(["{}"], "a.zip"), { format: "shapefile" })

    expect(useImportStore.getState().crs).toEqual({ code: "EPSG:27700", bboxPlausible: true })
  })

  it("flags an implausible bounding box so the gate can demand confirmation (SC-010)", async () => {
    // A projected extent read as degrees — the wrong-hemisphere failure mode.
    vi.spyOn(pipeline, "runPreflight").mockResolvedValue(
      preflightResult(1, { previewBbox: [500000, 180000, 530000, 190000] }),
    )

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.preflight(new File(["{}"], "a.geojson"), { format: "geojson" })

    expect(useImportStore.getState().crs?.bboxPlausible).toBe(false)
  })

  it("routes a CSV without a mapping to the mapping step", async () => {
    vi.spyOn(pipeline, "runPreflight").mockResolvedValue(preflightResult(1, { columns: ["lat", "lon"] }))

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.preflight(new File(["a"], "a.csv"), { format: "csv" })

    expect(useImportStore.getState().step).toBe("mapping")
  })

  it("routes an undetected CRS to the CRS step", async () => {
    vi.spyOn(pipeline, "runPreflight").mockResolvedValue(preflightResult(1, { detectedCrs: null }))

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.preflight(new File(["{}"], "a.zip"), { format: "shapefile" })

    expect(useImportStore.getState().step).toBe("crs")
  })

  it("records a parse failure as a user-facing error and returns to idle", async () => {
    vi.spyOn(pipeline, "runPreflight").mockRejectedValue(new Error("This file is not valid JSON."))

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await expect(
      result.current.preflight(new File(["x"], "a.geojson"), { format: "geojson" }),
    ).rejects.toThrow()

    const state = useImportStore.getState()
    expect(state.step).toBe("idle")
    expect(state.error).toMatch(/not valid JSON/)
  })
})

describe("confirm", () => {
  it("creates the job, then commits every chunk in order", async () => {
    stageConfirmable(IMPORT_CHUNK_SIZE * 2 + 5)

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    expect(create).toHaveBeenCalledTimes(1)
    expect(commitChunk).toHaveBeenCalledTimes(3)
    // Monotonic, 0-based — the idempotency key the server dedupes on.
    const sentIndexes = (commitChunk.mock.calls as unknown[][]).map(
      (call) => (call[1] as { chunkIndex: number }).chunkIndex,
    )
    expect(sentIndexes).toEqual([0, 1, 2])
    expect(complete).toHaveBeenCalledWith("job-1", "succeeded")
  })

  it("updates progress at least once per chunk (FR-009, FR-069)", async () => {
    stageConfirmable(IMPORT_CHUNK_SIZE * 2)

    const seen: number[] = []
    const unsubscribe = useImportStore.subscribe((state) => {
      if (state.progress) seen.push(state.progress.processed)
    })

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()
    unsubscribe()

    // Starts at 0, then one tick per committed chunk.
    expect(seen).toContain(IMPORT_CHUNK_SIZE)
    expect(seen).toContain(IMPORT_CHUNK_SIZE * 2)
    // Never moves backwards.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it("accumulates progress from actual chunk lengths, so the short final chunk is exact", async () => {
    stageConfirmable(IMPORT_CHUNK_SIZE + 7)

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    // The denominator and the final processed count agree — SC-006's balance.
    expect(useImportStore.getState().progress).toEqual({
      processed: IMPORT_CHUNK_SIZE + 7,
      total: IMPORT_CHUNK_SIZE + 7,
    })
  })

  it("writes a summary and reaches done", async () => {
    stageConfirmable(2)
    commitChunk.mockResolvedValue(chunkResult(2) as never)

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    const state = useImportStore.getState()
    expect(state.step).toBe("done")
    expect(state.summary).toMatchObject({ totalRead: 2, imported: 2, jobId: "job-1" })
  })

  it("refuses to confirm before a preflight has run", async () => {
    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await expect(result.current.confirm()).rejects.toThrow(/before its file has been validated/)
    expect(create).not.toHaveBeenCalled()
  })

  it("marks the job failed when a chunk fails permanently", async () => {
    stageConfirmable(2)
    commitChunk.mockRejectedValue(new ApiRequestError("bad geometry", 400, "INVALID_INPUT"))

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await expect(result.current.confirm()).rejects.toThrow()

    expect(complete).toHaveBeenCalledWith("job-1", "failed", expect.stringContaining("bad geometry"))
    expect(useImportStore.getState().error).toMatch(/bad geometry/)
  })
})

describe("duplicate opt-in (T250, FR-056)", () => {
  function stageWithDuplicates(): void {
    const store = useImportStore.getState()
    store.setFile(new File(["{}"], "parcels.geojson"), "geojson")
    store.setPreflight(
      preflightResult(4, {
        // Positions 1 and 3 are in-file duplicates; all four are in `features`.
        counts: { rejected: 0, duplicate: 2, repaired: 0 },
        duplicatePositions: [1, 3],
      }),
    )
    store.setCrs({ code: "EPSG:4326", bboxPlausible: true })
    store.setStep("parsing")
    useImportStore.getState().setStep("confirming")
  }

  it("skips in-file duplicates by default", async () => {
    stageWithDuplicates()

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    // Only the two non-duplicates were committed.
    const sent = (commitChunk.mock.calls[0] as unknown[])[1] as {
      features: { sourcePosition: number }[]
    }
    expect(sent.features.map((f) => f.sourcePosition)).toEqual([0, 2])

    // The preflight duplicate count reaches the job intact.
    const created = (create.mock.calls[0] as unknown[])[1] as {
      preflightCounts: { duplicate: number }
    }
    expect(created.preflightCounts.duplicate).toBe(2)
  })

  it("imports duplicates when the gate's opt-in is ticked", async () => {
    stageWithDuplicates()
    useImportStore.getState().setImportDuplicates(true)

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    // All four features go, duplicates included.
    const sent = (commitChunk.mock.calls[0] as unknown[])[1] as {
      features: { sourcePosition: number }[]
    }
    expect(sent.features.map((f) => f.sourcePosition)).toEqual([0, 1, 2, 3])

    // And they no longer count as "skipped as duplicate" — that is what keeps
    // imported + rejected + duplicate summing to total read (SC-006).
    const created = (create.mock.calls[0] as unknown[])[1] as {
      preflightCounts: { duplicate: number }
    }
    expect(created.preflightCounts.duplicate).toBe(0)
  })

  it("defaults to off, and reset clears an earlier opt-in", () => {
    useImportStore.getState().setImportDuplicates(true)
    useImportStore.getState().reset()
    expect(useImportStore.getState().importDuplicates).toBe(false)
  })
})

describe("Strict-mode auto-rollback (T096, FR-006)", () => {
  it("rolls back on the first commit-time rejection and imports nothing net", async () => {
    stageConfirmable(IMPORT_CHUNK_SIZE * 3, "strict")
    commitChunk.mockResolvedValue(
      chunkResult(999, [
        { sourcePosition: 12, category: "invalid_topology", message: "self-intersects" },
      ]) as never,
    )

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    // Stopped after the first rejecting chunk rather than continuing.
    expect(commitChunk).toHaveBeenCalledTimes(1)
    expect(rollbackJob).toHaveBeenCalledWith("job-1")
    // Not completed as succeeded — the outcome is a rollback.
    expect(complete).not.toHaveBeenCalled()

    const state = useImportStore.getState()
    // The observable outcome is exactly all-or-nothing.
    expect(state.summary?.imported).toBe(0)
    expect(state.error).toMatch(/Strict mode/)
    expect(state.step).toBe("done")
  })

  it("does not roll back in Lenient mode, which is the default", async () => {
    stageConfirmable(2, "lenient")
    commitChunk.mockResolvedValue(
      chunkResult(1, [
        { sourcePosition: 1, category: "invalid_topology", message: "self-intersects" },
      ]) as never,
    )

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    expect(rollbackJob).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith("job-1", "succeeded")
    expect(useImportStore.getState().summary?.imported).toBe(1)
  })

  it("completes normally in Strict mode when nothing is rejected", async () => {
    stageConfirmable(2, "strict")
    commitChunk.mockResolvedValue(chunkResult(2) as never)

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.confirm()

    expect(rollbackJob).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith("job-1", "succeeded")
  })
})

describe("cancel (T093, SC-004)", () => {
  it("stops sending chunks and tells the server", async () => {
    stageConfirmable(IMPORT_CHUNK_SIZE * 5)

    // Hold the first chunk open so cancel lands while it is genuinely in flight,
    // rather than calling cancel reentrantly from inside the mock.
    let firstChunkInFlight!: () => void
    const inFlight = new Promise<void>((resolve) => {
      firstChunkInFlight = resolve
    })
    let releaseFirstChunk!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseFirstChunk = resolve
    })

    let calls = 0
    commitChunk.mockImplementation(async () => {
      calls += 1
      if (calls === 1) {
        firstChunkInFlight()
        await gate
      }
      return chunkResult(IMPORT_CHUNK_SIZE) as never
    })

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })

    // The handler is attached in the same tick the promise is created: `cancel`
    // settles `confirm` on a later tick, and an unobserved rejection in between
    // would be reported as an unhandled rejection rather than as this assertion.
    let confirmError: unknown = null
    const running = result.current.confirm().catch((error: unknown) => {
      confirmError = error
    })

    await inFlight
    await result.current.cancel()
    releaseFirstChunk()
    await running

    // A cancelled import is an outcome, not a failure — the abort must not
    // surface to the caller as an error.
    expect(confirmError).toBeNull()

    // The abort is checked at a chunk boundary, so the fifth chunk is never
    // reached — this is what meets SC-004's two-second target without having to
    // interrupt an in-flight statement.
    expect(calls).toBe(1)
    // The server call is what makes it a guarantee rather than client politeness:
    // afterwards the chunk endpoint 409s anything already in flight.
    expect(cancelJob).toHaveBeenCalledWith("job-1")
  })

  it("reports how many features were imported before cancelling (FR-070)", async () => {
    stageConfirmable(5000)
    // Cancel is only reachable while an import is actually running, which is the
    // state a job id implies.
    useImportStore.getState().setStep("running")
    useImportStore.getState().setActiveJobId("job-1")

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.cancel()

    // Chunks already committed remain, and the summary must say so.
    expect(useImportStore.getState().summary).toMatchObject({ imported: 2000, jobId: "job-1" })
    expect(useImportStore.getState().step).toBe("done")
  })

  it("returns to idle without a server call when no job was created", async () => {
    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.cancel()

    expect(cancelJob).not.toHaveBeenCalled()
    expect(useImportStore.getState().step).toBe("idle")
  })
})

describe("rollback (T094, FR-072)", () => {
  it("deletes the import's features and reports the count", async () => {
    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await expect(result.current.rollback("job-9")).resolves.toBe(3)
    expect(rollbackJob).toHaveBeenCalledWith("job-9")
  })

  it("takes an explicit job id, so a past import can be undone from history", async () => {
    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })
    await result.current.rollback("some-older-job")
    expect(rollbackJob).toHaveBeenCalledWith("some-older-job")
  })
})

describe("cache invalidation (T095)", () => {
  /** Captures the query keys a run invalidated. */
  function trackingWrapper() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const keys: unknown[] = []
    vi.spyOn(client, "invalidateQueries").mockImplementation((filters) => {
      keys.push((filters as { queryKey?: unknown })?.queryKey)
      return Promise.resolve()
    })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { Wrapper, keys }
  }

  it("invalidates import history and the layer's features, both by list prefix", async () => {
    stageConfirmable(2)
    const { Wrapper, keys } = trackingWrapper()

    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: Wrapper })
    await result.current.confirm()

    await waitFor(() => expect(keys.length).toBeGreaterThanOrEqual(2))

    // Prefix keys — one element shorter than their parameterized counterparts —
    // so every cached cursor page matches, not only the no-params page.
    expect(keys).toContainEqual(["projects", PROJECT_ID, "imports"])
    // Imported features must appear on the map with no manual refresh.
    expect(keys).toContainEqual(["layers", LAYER_ID, "features"])
  })

  it("invalidates after a rollback too, so the map reflects the removal", async () => {
    const { Wrapper, keys } = trackingWrapper()
    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: Wrapper })

    await result.current.rollback("job-1")

    expect(keys).toContainEqual(["layers", LAYER_ID, "features"])
  })
})

describe("reset", () => {
  it("aborts any running work and clears the store", async () => {
    stageConfirmable(2)
    const { result } = renderHook(() => useImport(LAYER_ID, PROJECT_ID), { wrapper: wrapper() })

    result.current.reset()

    expect(useImportStore.getState().step).toBe("idle")
    expect(useImportStore.getState().file).toBeNull()
    expect(useImportStore.getState().preflight).toBeNull()
  })
})
