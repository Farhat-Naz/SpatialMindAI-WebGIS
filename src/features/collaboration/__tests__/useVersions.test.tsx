import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCompareVersions, useRestoreVersion, useSaveVersion, useVersions } from "../hooks/useVersions"
import { versionService } from "../services/versionService"

vi.mock("../services/versionService", () => ({
  versionService: {
    listVersions: vi.fn(),
    saveVersion: vi.fn(),
    getVersion: vi.fn(),
    restoreVersion: vi.fn(),
    compareVersions: vi.fn(),
  },
}))

vi.mock("@/features/database", () => ({
  queryKeys: {
    layers: (projectId: string) => ["projects", projectId, "layers"],
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

const mocked = vi.mocked(versionService)
const version = {
  id: "v1",
  projectId: "p1",
  createdByUserId: "u1",
  note: null,
  isPreRestoreSnapshot: false,
  createdAt: "t",
}

describe("useVersions", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists versions from the service", async () => {
    mocked.listVersions.mockResolvedValue({ versions: [version] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useVersions("p1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it("useSaveVersion invalidates the project's version list", async () => {
    mocked.saveVersion.mockResolvedValue({ version: { ...version, snapshot: {} } })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useSaveVersion("p1"), { wrapper: Wrapper })
    result.current.mutate({})
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "versions"] }))
  })

  it("useRestoreVersion invalidates versions AND database's layers query-key prefix (cross-feature)", async () => {
    mocked.restoreVersion.mockResolvedValue({ version: { ...version, snapshot: {} } })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useRestoreVersion("p1"), { wrapper: Wrapper })
    result.current.mutate("v1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "versions"] }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "layers"] }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["layers"] }))
  })

  it("useCompareVersions is disabled until both version ids are set", () => {
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useCompareVersions(null, null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe("idle")
  })
})
