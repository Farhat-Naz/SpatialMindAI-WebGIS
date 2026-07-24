import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from "../hooks/useProjects"
import { projectService } from "../services/projectService"

vi.mock("../services/projectService", () => ({
  projectService: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
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

const mockedProjectService = vi.mocked(projectService)

describe("useProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists projects from the service", async () => {
    mockedProjectService.list.mockResolvedValue({
      projects: [
        {
          id: "1",
          name: "A",
          description: null,
          ownerId: "u1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useProjects(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it("invalidates the project list after a successful create", async () => {
    mockedProjectService.create.mockResolvedValue({
      project: {
        id: "2",
        name: "B",
        description: null,
        ownerId: "u1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    })

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useCreateProject(), { wrapper: Wrapper })

    result.current.mutate({ name: "B" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["projects"] }),
    )
  })

  it("invalidates both list and detail queries after a successful update", async () => {
    mockedProjectService.update.mockResolvedValue({
      project: {
        id: "3",
        name: "C",
        description: "updated",
        ownerId: "u1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    })

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useUpdateProject("3"), { wrapper: Wrapper })
    result.current.mutate({ description: "updated" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["projects", "3"] }),
    )
  })

  it("invalidates the project list after a successful delete", async () => {
    mockedProjectService.remove.mockResolvedValue(undefined)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useDeleteProject("4"), { wrapper: Wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["projects"] }),
    )
  })
})
