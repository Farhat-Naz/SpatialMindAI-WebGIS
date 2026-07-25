import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useFeatureLock } from "../hooks/useFeatureLock"
import { lockService } from "../services/lockService"

const setLastError = vi.fn()

vi.mock("../services/lockService", () => ({
  lockService: { acquireLock: vi.fn(), releaseLock: vi.fn() },
}))

vi.mock("@/features/database/store/editingStore", () => ({
  useEditingStore: (selector: (state: { setLastError: typeof setLastError }) => unknown) =>
    selector({ setLastError }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper }
}

const mocked = vi.mocked(lockService)

describe("useFeatureLock", () => {
  beforeEach(() => vi.clearAllMocks())

  it("acquires a lock successfully", async () => {
    mocked.acquireLock.mockResolvedValue({
      lock: { id: "l1", featureId: "f1", lockedByUserId: "u1", acquiredAt: "t", expiresAt: "t" },
    })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useFeatureLock(), { wrapper: Wrapper })
    result.current.acquire.mutate("f1")
    await waitFor(() => expect(result.current.acquire.isSuccess).toBe(true))
    expect(setLastError).not.toHaveBeenCalled()
  })

  it("surfaces a 409 conflict via editingStore.setLastError, not a thrown/unhandled error", async () => {
    mocked.acquireLock.mockRejectedValue(new Error("This feature is currently locked by another member."))
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useFeatureLock(), { wrapper: Wrapper })
    result.current.acquire.mutate("f1")
    await waitFor(() => expect(result.current.acquire.isError).toBe(true))
    expect(setLastError).toHaveBeenCalledWith("This feature is currently locked by another member.")
  })

  it("releases a lock", async () => {
    mocked.releaseLock.mockResolvedValue(undefined)
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useFeatureLock(), { wrapper: Wrapper })
    result.current.release.mutate("f1")
    await waitFor(() => expect(result.current.release.isSuccess).toBe(true))
  })
})
