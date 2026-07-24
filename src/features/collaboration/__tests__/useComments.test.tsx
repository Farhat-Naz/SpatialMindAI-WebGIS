import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useResolveComment,
  useUpdateComment,
} from "../hooks/useComments"
import { commentService } from "../services/commentService"

vi.mock("../services/commentService", () => ({
  commentService: {
    listComments: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    resolveComment: vi.fn(),
    deleteComment: vi.fn(),
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

const mocked = vi.mocked(commentService)
const comment = {
  id: "c1",
  featureId: "f1",
  authorId: "u1",
  parentCommentId: null,
  body: "hi",
  resolved: false,
  mentionedUserIds: [],
  createdAt: "t",
  updatedAt: "t",
}
const commentsKey = ["features", "f1", "comments"]

describe("useComments", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists comments from the service", async () => {
    mocked.listComments.mockResolvedValue({ comments: [comment] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useComments("f1"), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it("useCreateComment invalidates the comment list on success", async () => {
    mocked.createComment.mockResolvedValue({ comment })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useCreateComment("f1"), { wrapper: Wrapper })
    result.current.mutate({ body: "hi" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: commentsKey }))
  })

  it("useUpdateComment invalidates the comment list on success", async () => {
    mocked.updateComment.mockResolvedValue({ comment })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useUpdateComment("f1"), { wrapper: Wrapper })
    result.current.mutate({ commentId: "c1", input: { body: "edited" } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: commentsKey }))
  })

  it("useResolveComment invalidates the comment list on success", async () => {
    mocked.resolveComment.mockResolvedValue({ comment })
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useResolveComment("f1"), { wrapper: Wrapper })
    result.current.mutate({ commentId: "c1", resolved: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: commentsKey }))
  })

  it("useDeleteComment invalidates the comment list on success", async () => {
    mocked.deleteComment.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const spy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteComment("f1"), { wrapper: Wrapper })
    result.current.mutate("c1")
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: commentsKey }))
  })
})
