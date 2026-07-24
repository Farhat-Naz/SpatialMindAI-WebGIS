import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePresence } from "../hooks/usePresence"
import { presenceService } from "../services/presenceService"

vi.mock("../services/presenceService", () => ({
  presenceService: { heartbeat: vi.fn(), getSnapshot: vi.fn() },
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

const mocked = vi.mocked(presenceService)

describe("usePresence", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSnapshot.mockResolvedValue({ presence: [] })
    mocked.heartbeat.mockResolvedValue({
      presence: { id: "pr1", projectId: "p1", userId: "u1", cursorLng: null, cursorLat: null, viewportBounds: null, currentFeatureId: null, lastSeenAt: "t" },
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("fetches the initial snapshot and sends an immediate heartbeat", async () => {
    const { Wrapper } = createWrapper()
    renderHook(() => usePresence("p1"), { wrapper: Wrapper })
    await vi.waitFor(() => expect(mocked.heartbeat).toHaveBeenCalledTimes(1))
  })

  it("sends a heartbeat every ~10s while mounted", async () => {
    const { Wrapper } = createWrapper()
    renderHook(() => usePresence("p1"), { wrapper: Wrapper })
    await vi.waitFor(() => expect(mocked.heartbeat).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocked.heartbeat).toHaveBeenCalledTimes(2)
  })

  it("stops the heartbeat interval cleanly on unmount (no interval leak)", async () => {
    const { Wrapper } = createWrapper()
    const { unmount } = renderHook(() => usePresence("p1"), { wrapper: Wrapper })
    await vi.waitFor(() => expect(mocked.heartbeat).toHaveBeenCalledTimes(1))

    unmount()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocked.heartbeat).toHaveBeenCalledTimes(1)
  })
})
