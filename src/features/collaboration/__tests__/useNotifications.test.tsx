import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../hooks/useNotifications"
import { notificationService } from "../services/notificationService"

vi.mock("../services/notificationService", () => ({
  notificationService: {
    listNotifications: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
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

const mocked = vi.mocked(notificationService)
const notification = { id: "n1", recipientUserId: "u1", type: "mention" as const, payload: {}, read: false, createdAt: "t" }

describe("useNotifications", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists notifications plus unreadCount from the service", async () => {
    mocked.listNotifications.mockResolvedValue({ notifications: [notification], nextCursor: null, unreadCount: 1 })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useNotifications(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.unreadCount).toBe(1)
  })

  it("useMarkNotificationRead invalidates the notification list", async () => {
    mocked.markRead.mockResolvedValue({ notification: { ...notification, read: true } })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper: Wrapper })
    result.current.mutate("n1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["notifications"] }))
  })

  it("useMarkAllNotificationsRead invalidates the notification list", async () => {
    mocked.markAllRead.mockResolvedValue({ updatedCount: 3 })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: Wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["notifications"] }))
  })
})
