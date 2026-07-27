import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { importService } from "../importService"

/**
 * `importService` request-shaping tests (specs/005-import-export, T084).
 *
 * The service is deliberately logic-free (Constitution Principle I), so what
 * there is to verify is exactly that: the right URL, the right method, the right
 * body, and no retry or sequencing sneaking in. Retry lives in
 * `importPipeline.test.ts`; sequencing lives in `useImport`'s tests.
 */

const fetchMock = vi.fn()

/**
 * Stubs `fetch` to return a **fresh** `Response` per call.
 *
 * A single `Response` instance cannot serve two calls: its body is a stream that
 * can only be read once, so `mockResolvedValue(response)` fails the second time
 * with "Body has already been read".
 */
function respondWith(body: unknown, status = 200): void {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    ),
  )
}

beforeEach(() => {
  fetchMock.mockReset()
  respondWith({ importJob: { id: "job-1" } })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The URL and init of the single call made during a test. */
function lastCall(): { url: string; init: RequestInit } {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init }
}

describe("importService", () => {
  it("posts a create request to the layer's imports endpoint", async () => {
    await importService.create("layer-9", {
      sourceFormat: "geojson",
      fileName: "parcels.geojson",
      fileSizeBytes: 2048,
      sourceCrs: "EPSG:4326",
      mode: "lenient",
      totalFeatures: 3,
      preflightCounts: { rejected: 0, duplicate: 0, repaired: 0 },
    })

    const { url, init } = lastCall()
    expect(url).toBe("/api/layers/layer-9/imports")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string).fileName).toBe("parcels.geojson")
  })

  it("posts a chunk with its index and features", async () => {
    respondWith({ chunkIndex: 2, committed: 1, rejected: [] })

    await importService.commitChunk("job-1", {
      chunkIndex: 2,
      features: [{ sourcePosition: 0, geometry: { type: "Point", coordinates: [1, 2] } }],
    })

    const { url, init } = lastCall()
    expect(url).toBe("/api/imports/job-1/chunks")
    const body = JSON.parse(init.body as string)
    expect(body.chunkIndex).toBe(2)
    expect(body.features).toHaveLength(1)
  })

  it("omits errorMessage from complete when none is given", async () => {
    await importService.complete("job-1", "succeeded")
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ outcome: "succeeded" })
  })

  it("includes errorMessage on a failed completion", async () => {
    await importService.complete("job-1", "failed", "Network lost.")
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      outcome: "failed",
      errorMessage: "Network lost.",
    })
  })

  it.each([
    ["cancel", () => importService.cancel("job-1"), "/api/imports/job-1/cancel"],
    ["rollback", () => importService.rollback("job-1"), "/api/imports/job-1/rollback"],
  ])("posts %s with no body", async (_name, call, expectedUrl) => {
    await call()
    const { url, init } = lastCall()
    expect(url).toBe(expectedUrl)
    expect(init.method).toBe("POST")
    expect(init.body).toBeUndefined()
  })

  it("reads one job with a plain GET", async () => {
    await importService.get("job-1")
    const { url, init } = lastCall()
    expect(url).toBe("/api/imports/job-1")
    expect(init.method).toBeUndefined()
  })

  it("builds a query string only for the params supplied", async () => {
    respondWith({ issues: [], nextCursor: null, totalPersisted: 0, truncated: false })

    await importService.listIssues("job-1")
    expect(lastCall().url).toBe("/api/imports/job-1/issues")

    fetchMock.mockClear()
    await importService.listIssues("job-1", { cursor: "abc", limit: 50 })
    expect(lastCall().url).toBe("/api/imports/job-1/issues?cursor=abc&limit=50")
  })

  it("passes a status filter through to the history endpoint", async () => {
    respondWith({ imports: [], nextCursor: null })
    await importService.listForProject("proj-1", { status: "succeeded" })
    expect(lastCall().url).toBe("/api/projects/proj-1/imports?status=succeeded")
  })
})
