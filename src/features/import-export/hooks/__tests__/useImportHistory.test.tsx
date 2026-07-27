import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IMPORT_INLINE_ISSUE_LIMIT } from "../../types/importExport.constants"
import { importService } from "../../services/importService"
import { useImportHistory } from "../useImportHistory"
import { useImportIssues } from "../useImportIssues"

/**
 * `useImportHistory` and `useImportIssues` tests (specs/005-import-export, T099).
 */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

let listForProject: ReturnType<typeof vi.spyOn>
let listIssues: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  listForProject = vi.spyOn(importService, "listForProject").mockResolvedValue({
    imports: [{ id: "job-2", fileName: "two.geojson" }],
    nextCursor: "cursor-2",
  } as never)

  listIssues = vi.spyOn(importService, "listIssues").mockResolvedValue({
    issues: [{ id: "i1", sourcePosition: 3, category: "duplicate_in_file", message: "dup" }],
    nextCursor: null,
    totalPersisted: 1000,
    truncated: true,
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useImportHistory", () => {
  it("reads a project's history newest first", async () => {
    const { result } = renderHook(() => useImportHistory("proj-1"), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(listForProject).toHaveBeenCalledWith("proj-1", {})
    expect(result.current.data?.imports[0].fileName).toBe("two.geojson")
  })

  it("passes a cursor through so paging neither skips nor duplicates (FR-077)", async () => {
    const { result } = renderHook(() => useImportHistory("proj-1", { cursor: "cursor-2", limit: 20 }), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(listForProject).toHaveBeenCalledWith("proj-1", { cursor: "cursor-2", limit: 20 })
  })

  it("passes a status filter through", async () => {
    const { result } = renderHook(() => useImportHistory("proj-1", { status: "succeeded" }), {
      wrapper: wrapper(),
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(listForProject).toHaveBeenCalledWith("proj-1", { status: "succeeded" })
  })

  it("caches distinct pages under distinct keys", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const first = renderHook(() => useImportHistory("proj-1"), { wrapper: Wrapper })
    await waitFor(() => expect(first.result.current.data).toBeDefined())

    const second = renderHook(() => useImportHistory("proj-1", { cursor: "cursor-2" }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(second.result.current.data).toBeDefined())

    // Two separate fetches, because the params are part of the key. Sharing one
    // key would make page two silently serve page one from cache.
    expect(listForProject).toHaveBeenCalledTimes(2)
  })

  it("issues no request without a project id", async () => {
    const { result } = renderHook(() => useImportHistory(""), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(listForProject).not.toHaveBeenCalled()
  })
})

describe("useImportIssues", () => {
  it("defaults to FR-058's inline issue count", async () => {
    const { result } = renderHook(() => useImportIssues("job-1"), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(listIssues).toHaveBeenCalledWith("job-1", { limit: IMPORT_INLINE_ISSUE_LIMIT })
  })

  it("surfaces `truncated` so the UI can state the history cap honestly", async () => {
    const { result } = renderHook(() => useImportIssues("job-1"), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    // History holds the first 1,000 of a larger set (research.md Decision 16);
    // hiding that would misrepresent the report.
    expect(result.current.data?.truncated).toBe(true)
    expect(result.current.data?.totalPersisted).toBe(1000)
  })

  it("lets a caller override the limit", async () => {
    const { result } = renderHook(() => useImportIssues("job-1", { limit: 500 }), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(listIssues).toHaveBeenCalledWith("job-1", { limit: 500 })
  })

  it("issues no request without a job id", async () => {
    const { result } = renderHook(() => useImportIssues(null), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(listIssues).not.toHaveBeenCalled()
  })
})
