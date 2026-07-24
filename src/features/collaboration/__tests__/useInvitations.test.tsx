import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useInvitations,
  useInvite,
} from "../hooks/useInvitations"
import { invitationService } from "../services/invitationService"

vi.mock("../services/invitationService", () => ({
  invitationService: {
    invite: vi.fn(),
    listInvitations: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
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

const mocked = vi.mocked(invitationService)
const invitation = {
  id: "i1",
  projectId: "p1",
  invitedByUserId: "u1",
  invitedUserId: "u2",
  role: "Editor" as const,
  status: "pending" as const,
  createdAt: "t",
  updatedAt: "t",
}

describe("useInvitations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists invitations from the service", async () => {
    mocked.listInvitations.mockResolvedValue({ invitations: [invitation] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useInvitations("p1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it("invalidates the invitation list after inviting", async () => {
    mocked.invite.mockResolvedValue({ invitation })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useInvite("p1"), { wrapper: Wrapper })
    result.current.mutate({ invitedUserId: "u2", role: "Editor" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "invitations"] }))
  })

  it("invalidates both invitations and members after accepting", async () => {
    mocked.accept.mockResolvedValue({ invitation: { ...invitation, status: "accepted" } })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useAcceptInvitation("p1"), { wrapper: Wrapper })
    result.current.mutate("i1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "invitations"] }))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "members"] }))
  })

  it("invalidates the invitation list after declining", async () => {
    mocked.decline.mockResolvedValue({ invitation: { ...invitation, status: "declined" } })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeclineInvitation("p1"), { wrapper: Wrapper })
    result.current.mutate("i1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["projects", "p1", "invitations"] }))
  })
})
