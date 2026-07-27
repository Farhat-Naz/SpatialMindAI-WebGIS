import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { importService } from "../../services/importService"
import { useImportProgress } from "../useImportProgress"

/**
 * `useImportProgress` tests (specs/005-import-export, T099).
 *
 * The driver assertions check the **request count**, not merely observable
 * behavior: the whole point of the hook's `enabled` guard is that the driving tab
 * issues zero requests, and a test that only checked "the data is right" would
 * pass even if it polled ~100 times per import (research.md Decision 12).
 */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    importJob: {
      id: "job-1",
      status: "running",
      importedCount: 500,
      rejectedCount: 0,
      duplicateCount: 0,
      totalFeatures: 1000,
      ...overrides,
    },
  }
}

let get: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  get = vi.spyOn(importService, "get").mockResolvedValue(job() as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useImportProgress", () => {
  it("issues zero requests when this tab is the driver", async () => {
    const { result } = renderHook(() => useImportProgress("job-1", true), { wrapper: wrapper() })

    // The driving tab already holds both numerator and denominator in
    // `importStore`; polling would be ~100 pointless requests per import.
    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(get).not.toHaveBeenCalled()
  })

  it("fetches when this tab is not the driver — after a reload or from another device", async () => {
    const { result } = renderHook(() => useImportProgress("job-1", false), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(get).toHaveBeenCalledWith("job-1")
    expect(result.current.data?.importJob.importedCount).toBe(500)
  })

  it("issues no request without a job id", async () => {
    const { result } = renderHook(() => useImportProgress(null, false), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(get).not.toHaveBeenCalled()
  })

  it("starts polling when the tab stops being the driver", async () => {
    const { result, rerender } = renderHook(
      ({ isDriver }: { isDriver: boolean }) => useImportProgress("job-1", isDriver),
      { wrapper: wrapper(), initialProps: { isDriver: true } },
    )

    expect(get).not.toHaveBeenCalled()

    rerender({ isDriver: false })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(get).toHaveBeenCalledTimes(1)
  })
})
