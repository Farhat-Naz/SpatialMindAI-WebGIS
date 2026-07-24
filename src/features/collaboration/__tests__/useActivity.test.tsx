import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useActivity } from "../hooks/useActivity"
import { activityService } from "../services/activityService"

vi.mock("../services/activityService", () => ({
  activityService: { listActivity: vi.fn() },
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

const mocked = vi.mocked(activityService)

describe("useActivity", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists activity from the service", async () => {
    mocked.listActivity.mockResolvedValue({
      activities: [
        {
          id: "a1",
          projectId: "p1",
          userId: "u1",
          action: "create",
          targetType: "feature",
          targetId: "f1",
          metadata: null,
          createdAt: "t",
        },
      ],
      nextCursor: null,
    })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useActivity("p1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.activities).toHaveLength(1)
  })
})
