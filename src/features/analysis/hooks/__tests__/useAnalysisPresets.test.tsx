import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDeletePreset, usePresets, useSavePreset } from "../useAnalysisPresets"
import { analysisService } from "../../services/analysisService"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    listPresets: vi.fn(),
    savePreset: vi.fn(),
    deletePreset: vi.fn(),
  },
}))

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

const presetA = { id: "1", projectId: "p1", userId: "u1", name: "A", operationType: "buffer", parameters: {}, createdAt: "t", updatedAt: "t" }
const presetB = { id: "2", projectId: "p1", userId: "u1", name: "B", operationType: "union", parameters: {}, createdAt: "t", updatedAt: "t" }

describe("useAnalysisPresets hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("usePresets: lists all presets when no operationType filter is given", async () => {
    mockedService.listPresets.mockResolvedValue({ presets: [presetA, presetB] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => usePresets("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.presets).toHaveLength(2)
  })

  it("usePresets: filters client-side by operationType when given", async () => {
    mockedService.listPresets.mockResolvedValue({ presets: [presetA, presetB] })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => usePresets("p1", "buffer"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.presets).toEqual([presetA])
  })

  it("useSavePreset: invalidates only the project's preset list (T103)", async () => {
    mockedService.savePreset.mockResolvedValue({ preset: presetA })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useSavePreset("p1"), { wrapper: Wrapper })

    result.current.mutate({ name: "A", operationType: "buffer", parameters: {} })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "analysisPresets"] })
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
  })

  it("useDeletePreset: invalidates only the project's preset list", async () => {
    mockedService.deletePreset.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeletePreset("p1"), { wrapper: Wrapper })

    result.current.mutate("1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "analysisPresets"] })
  })
})
