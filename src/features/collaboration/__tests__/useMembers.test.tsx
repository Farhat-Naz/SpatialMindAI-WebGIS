import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useChangeRole, useMembers, useRemoveMember, useTransferOwnership } from "../hooks/useMembers"
import { membershipService } from "../services/membershipService"

vi.mock("../services/membershipService", () => ({
  membershipService: {
    listMembers: vi.fn(),
    changeRole: vi.fn(),
    removeMember: vi.fn(),
    transferOwnership: vi.fn(),
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

const mocked = vi.mocked(membershipService)
const member = { id: "m1", projectId: "p1", userId: "u1", role: "Owner" as const, createdAt: "t", updatedAt: "t" }

describe("useMembers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists members from the service", async () => {
    mocked.listMembers.mockResolvedValue({ members: [member] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useMembers("p1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it("invalidates the member list after changing a role", async () => {
    mocked.changeRole.mockResolvedValue({ member })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useChangeRole("p1"), { wrapper: Wrapper })
    result.current.mutate({ userId: "u1", input: { role: "Viewer" } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "members"] }))
  })

  it("invalidates the member list after removing a member", async () => {
    mocked.removeMember.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useRemoveMember("p1"), { wrapper: Wrapper })
    result.current.mutate("u1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "members"] }))
  })

  it("invalidates the member list after transferring ownership", async () => {
    mocked.transferOwnership.mockResolvedValue({ success: true })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useTransferOwnership("p1"), { wrapper: Wrapper })
    result.current.mutate({ newOwnerUserId: "u1" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "members"] }))
  })
})
