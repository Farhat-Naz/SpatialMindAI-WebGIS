import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  useCreateLayer,
  useDeleteLayer,
  useLayers,
  useReorderLayers,
} from "../hooks/useLayers"
import { layerService } from "../services/layerService"

vi.mock("../services/layerService", () => ({
  layerService: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    reorder: vi.fn(),
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

const mockedLayerService = vi.mocked(layerService)
const sampleLayer = {
  id: "l1",
  name: "Roads",
  order: 0,
  projectId: "p1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("useLayers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists a project's layers", async () => {
    mockedLayerService.list.mockResolvedValue({ layers: [sampleLayer] })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useLayers("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it("invalidates the project's layer list after create", async () => {
    mockedLayerService.create.mockResolvedValue({ layer: sampleLayer })

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useCreateLayer("p1"), { wrapper: Wrapper })
    result.current.mutate({ name: "Roads" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["projects", "p1", "layers"] }),
    )
  })

  it("invalidates the same list key that useLayers reads after reorder", async () => {
    mockedLayerService.reorder.mockResolvedValue({ layers: [sampleLayer] })

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useReorderLayers("p1"), { wrapper: Wrapper })
    result.current.mutate(["l1"])

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["projects", "p1", "layers"] }),
    )
  })

  it("invalidates the project's layer list after delete", async () => {
    mockedLayerService.remove.mockResolvedValue(undefined)

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useDeleteLayer("l1", "p1"), { wrapper: Wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["projects", "p1", "layers"] }),
    )
  })
})
