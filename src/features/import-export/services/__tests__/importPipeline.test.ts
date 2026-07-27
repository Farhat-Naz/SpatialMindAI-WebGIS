import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiRequestError } from "@/shared/errors/apiRequestError"
import { IMPORT_CHUNK_SIZE } from "../../types/importExport.constants"
import type { NormalizedFeature } from "../../types/importExport.types"
import {
  CHUNK_RETRY_ATTEMPTS,
  chunkFeatures,
  commitChunkWithRetry,
  formatProgress,
  toPersistableIssues,
  toProgress,
} from "../importPipeline"
import { importService } from "../importService"

/**
 * Chunking, progress, and retry tests (specs/005-import-export, T084).
 *
 * The retry cases are the load-bearing ones: they encode *which* failures are
 * worth repeating and which are permanent, and getting that backwards either
 * duplicates a user's data or hammers a cancelled job.
 */

function feature(index: number): NormalizedFeature {
  return { sourcePosition: index, geometry: { type: "Point", coordinates: [index, 0] }, properties: {} }
}

describe("chunkFeatures", () => {
  it.each([
    [0, 0],
    [1, 1],
    [IMPORT_CHUNK_SIZE, 1],
    [IMPORT_CHUNK_SIZE + 1, 2],
    [IMPORT_CHUNK_SIZE * 2, 2],
  ])("splits %i features into %i chunks", (count, expectedChunks) => {
    const features = Array.from({ length: count }, (_, index) => feature(index))
    const chunks = chunkFeatures(features)
    expect(chunks).toHaveLength(expectedChunks)
  })

  it("loses and duplicates nothing across a boundary", () => {
    const features = Array.from({ length: IMPORT_CHUNK_SIZE + 7 }, (_, index) => feature(index))
    const flattened = chunkFeatures(features).flat()

    expect(flattened).toHaveLength(features.length)
    // Order is stable, which is what makes chunkIndex a usable idempotency key.
    expect(flattened.map((f) => f.sourcePosition)).toEqual(features.map((f) => f.sourcePosition))
    expect(new Set(flattened.map((f) => f.sourcePosition)).size).toBe(features.length)
  })

  it("respects an explicit size", () => {
    expect(chunkFeatures([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("refuses a non-positive size rather than looping forever", () => {
    expect(() => chunkFeatures([1, 2, 3], 0)).toThrow(/greater than zero/)
  })
})

describe("toProgress", () => {
  it("never exceeds 100 percent even when more commits than expected", () => {
    expect(toProgress(150, 100).percent).toBe(100)
    expect(toProgress(150, 100).processed).toBe(100)
  })

  it("reports zero rather than NaN for an empty import", () => {
    expect(toProgress(0, 0)).toEqual({ processed: 0, total: 0, percent: 0 })
  })

  it("clamps a negative processed count to zero", () => {
    expect(toProgress(-5, 10).processed).toBe(0)
  })

  it("formats a readable, screen-reader-friendly string", () => {
    expect(formatProgress({ processed: 500, total: 1000 })).toBe("50% — 500 of 1,000 features")
  })
})

describe("toPersistableIssues", () => {
  it("returns the whole list when under the cap", () => {
    const issues = [{ sourcePosition: 1, category: "duplicate_in_file" as const, message: "x" }]
    expect(toPersistableIssues(issues, 10)).toHaveLength(1)
  })

  it("truncates to the cap, keeping the earliest issues", () => {
    const issues = Array.from({ length: 20 }, (_, index) => ({
      sourcePosition: index,
      category: "duplicate_in_file" as const,
      message: `issue ${index}`,
    }))
    const capped = toPersistableIssues(issues, 5)
    expect(capped).toHaveLength(5)
    expect(capped[0].sourcePosition).toBe(0)
  })
})

describe("commitChunkWithRetry", () => {
  let commitChunk: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    commitChunk = vi.spyOn(importService, "commitChunk")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Real timers with a 1 ms base backoff rather than fake timers.
   *
   * Fake timers here caused spurious unhandled-rejection reports: the retry
   * promise settles while `runAllTimersAsync` is still being awaited, so its
   * rejection is momentarily unobserved. A 1 ms ladder exercises the identical
   * code path with no such race and no meaningful wall-clock cost — which is why
   * `baseDelayMs` is an option on the function rather than a hard-coded constant.
   */
  const fast = { baseDelayMs: 1 }

  it("returns the first successful result without retrying", async () => {
    const result = { chunkIndex: 0, committed: 1, rejected: [], job: {} }
    commitChunk.mockResolvedValue(result as never)

    await expect(commitChunkWithRetry("job-1", 0, [feature(0)], fast)).resolves.toBe(result)
    expect(commitChunk).toHaveBeenCalledTimes(1)
  })

  it("retries a transient failure and succeeds", async () => {
    const result = { chunkIndex: 0, committed: 1, rejected: [], job: {} }
    commitChunk.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(result as never)

    await expect(commitChunkWithRetry("job-1", 0, [feature(0)], fast)).resolves.toBe(result)
    expect(commitChunk).toHaveBeenCalledTimes(2)
  })

  it("retries RATE_LIMITED — it is transient by definition", async () => {
    const result = { chunkIndex: 0, committed: 1, rejected: [], job: {} }
    commitChunk
      .mockRejectedValueOnce(new ApiRequestError("Too many requests.", 429, "RATE_LIMITED"))
      .mockResolvedValueOnce(result as never)

    await expect(commitChunkWithRetry("job-1", 0, [feature(0)], fast)).resolves.toBe(result)
    expect(commitChunk).toHaveBeenCalledTimes(2)
  })

  it("does NOT retry CONFLICT — the job is cancelled or terminal", async () => {
    commitChunk.mockRejectedValue(new ApiRequestError("Cancelled.", 409, "CONFLICT"))

    await expect(commitChunkWithRetry("job-1", 0, [feature(0)], fast)).rejects.toThrow(/Cancelled/)
    expect(commitChunk).toHaveBeenCalledTimes(1)
  })

  it.each(["INVALID_INPUT", "FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED"] as const)(
    "does NOT retry %s — it would fail identically",
    async (code) => {
      commitChunk.mockRejectedValue(new ApiRequestError("nope", 400, code))

      await expect(commitChunkWithRetry("job-1", 0, [feature(0)], fast)).rejects.toThrow()
      expect(commitChunk).toHaveBeenCalledTimes(1)
    },
  )

  it("gives up after the attempt limit", async () => {
    commitChunk.mockRejectedValue(new Error("still down"))

    await expect(commitChunkWithRetry("job-1", 0, [feature(0)], fast)).rejects.toThrow(/still down/)
    expect(commitChunk).toHaveBeenCalledTimes(CHUNK_RETRY_ATTEMPTS)
  })

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      commitChunkWithRetry("job-1", 0, [feature(0)], { ...fast, signal: controller.signal }),
    ).rejects.toThrow()
    expect(commitChunk).not.toHaveBeenCalled()
  })
})
