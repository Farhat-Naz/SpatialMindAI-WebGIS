import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCreateFeature, useFeatures, useUpdateFeature } from "../hooks/useFeatures"
import { featureService } from "../services/featureService"

vi.mock("../services/featureService", () => ({
  featureService: {
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

const mockedFeatureService = vi.mocked(featureService)
const sampleFeature = {
  id: "f1",
  layerId: "l1",
  geometry: { type: "Point" as const, coordinates: [1, 2] as [number, number] },
  attributes: [],
  style: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("useFeatures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists a layer's features", async () => {
    mockedFeatureService.list.mockResolvedValue({ features: [sampleFeature], nextCursor: null })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useFeatures("l1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.features).toHaveLength(1)
  })

  it("re-fetches when the cursor param changes", async () => {
    mockedFeatureService.list.mockResolvedValue({ features: [sampleFeature], nextCursor: "f1" })

    function useFeaturesWithCursor(cursor?: string) {
      return useFeatures("l1", { cursor })
    }

    const { Wrapper } = createWrapper()
    const { result, rerender } = renderHook((cursor?: string) => useFeaturesWithCursor(cursor), {
      wrapper: Wrapper,
      initialProps: undefined,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedFeatureService.list).toHaveBeenCalledWith("l1", { cursor: undefined })

    rerender("f1")

    await waitFor(() =>
      expect(mockedFeatureService.list).toHaveBeenCalledWith("l1", { cursor: "f1" }),
    )
  })

  it("invalidates the layer's feature list after create", async () => {
    mockedFeatureService.create.mockResolvedValue({ feature: sampleFeature })

    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

    const { result } = renderHook(() => useCreateFeature("l1"), { wrapper: Wrapper })
    result.current.mutate({ geometry: sampleFeature.geometry })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["layers", "l1", "features"] }),
    )
  })

  it("does not alter cached geometry/style when only attributes are updated", async () => {
    const updated = { ...sampleFeature, attributes: [{ key: "a", value: "b" }] }
    mockedFeatureService.update.mockResolvedValue({ feature: updated })

    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useUpdateFeature("f1", "l1"), { wrapper: Wrapper })
    result.current.mutate({ attributes: [{ key: "a", value: "b" }] })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.feature.geometry).toEqual(sampleFeature.geometry)
    expect(result.current.data?.feature.style).toEqual(sampleFeature.style)
  })
})
