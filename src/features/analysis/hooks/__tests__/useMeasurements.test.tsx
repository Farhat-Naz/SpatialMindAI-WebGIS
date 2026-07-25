import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useDeleteMeasurement, useMeasurementHistory, useSaveMeasurement } from "../useMeasurements"
import { analysisService } from "../../services/analysisService"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    listMeasurements: vi.fn(),
    saveMeasurement: vi.fn(),
    deleteMeasurement: vi.fn(),
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

const sampleMeasurement = {
  id: "m1",
  projectId: "p1",
  userId: "u1",
  measurementType: "distance" as const,
  geometry: { type: "LineString" as const, coordinates: [[0, 0], [1, 0]] },
  value: 111195,
  unit: "meters",
  label: null,
  createdAt: "t",
}

describe("useMeasurements hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useMeasurementHistory: lists a project's measurement history", async () => {
    mockedService.listMeasurements.mockResolvedValue({ measurements: [sampleMeasurement], nextCursor: null })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useMeasurementHistory("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.measurements).toHaveLength(1)
  })

  it("useSaveMeasurement: invalidates only the project's measurement list (T103)", async () => {
    mockedService.saveMeasurement.mockResolvedValue({ measurement: sampleMeasurement })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useSaveMeasurement("p1"), { wrapper: Wrapper })

    result.current.mutate({
      measurementType: "distance",
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "measurementHistory"] })
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
  })

  it("useDeleteMeasurement: invalidates only the project's measurement list", async () => {
    mockedService.deleteMeasurement.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteMeasurement("p1"), { wrapper: Wrapper })

    result.current.mutate("m1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "measurementHistory"] })
  })
})
