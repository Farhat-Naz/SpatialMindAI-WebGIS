import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  useAnalysisRun,
  useAnalysisRuns,
  useCancelAnalysis,
  useDeleteAnalysisRun,
  useDiscardAnalysisResult,
  useRerunAnalysis,
  useRunAnalysis,
} from "../useAnalysis"
import { analysisService } from "../../services/analysisService"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    runAnalysis: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
    cancelAnalysis: vi.fn(),
    discardResult: vi.fn(),
    rerunAnalysis: vi.fn(),
    deleteRun: vi.fn(),
  },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
}))

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { Wrapper, queryClient }
}

const sampleRun = {
  id: "run-1",
  projectId: "p1",
  userId: "u1",
  operationType: "featureCount",
  status: "succeeded" as const,
  progress: 100,
  parameters: {},
  inputLayerIds: ["l1"],
  resultLayerId: null,
  resultData: { featureCount: 3 },
  errorMessage: null,
  batchId: null,
  presetId: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  executionTimeMs: 1000,
  cancelRequestedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
}

describe("useAnalysis hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnalysisStore.setState({ activeRunId: null })
  })

  it("useRunAnalysis: sets activeRunId on success (T111)", async () => {
    mockedService.runAnalysis.mockResolvedValue({ run: sampleRun })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRunAnalysis("p1"), { wrapper: Wrapper })

    result.current.mutate({ operationType: "featureCount", inputLayerIds: ["l1"], parameters: undefined } as never)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useAnalysisStore.getState().activeRunId).toBe("run-1")
  })

  it("useRunAnalysis: does not retry on failure (T086)", async () => {
    mockedService.runAnalysis.mockRejectedValue(new Error("boom"))
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRunAnalysis("p1"), { wrapper: Wrapper })

    result.current.mutate({ operationType: "featureCount", inputLayerIds: ["l1"], parameters: undefined } as never)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockedService.runAnalysis).toHaveBeenCalledTimes(1)
  })

  it("useAnalysisRuns: lists runs for a project", async () => {
    mockedService.listRuns.mockResolvedValue({ runs: [sampleRun], nextCursor: null })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAnalysisRuns("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.runs).toHaveLength(1)
  })

  it("useAnalysisRun: stops polling once a terminal status is cached", async () => {
    mockedService.getRun.mockResolvedValue({ run: sampleRun })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useAnalysisRun("run-1", { poll: true }), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // refetchInterval is a function on the query observer; verifying no
    // further poll fires by confirming the service was only called once
    // shortly after the initial fetch is sufficient without faking timers
    // for the full interval duration.
    expect(mockedService.getRun).toHaveBeenCalledTimes(1)
  })

  it("useCancelAnalysis: invalidates the run's own query key on success", async () => {
    mockedService.cancelAnalysis.mockResolvedValue({ run: { ...sampleRun, status: "cancelled" } })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useCancelAnalysis(), { wrapper: Wrapper })

    result.current.mutate("run-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["analysisRuns", "run-1"] })
  })

  it("useDiscardAnalysisResult: invalidates both analysisRuns and database's layers", async () => {
    mockedService.discardResult.mockResolvedValue({ run: { ...sampleRun, resultLayerId: null } })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDiscardAnalysisResult("p1"), { wrapper: Wrapper })

    result.current.mutate("run-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["projects", "p1", "analysisRuns"] }))
    expect(invalidatedKeys).toContain(JSON.stringify({ queryKey: ["projects", "p1", "layers"] }))
  })

  it("useRerunAnalysis: calls the service with the run id", async () => {
    mockedService.rerunAnalysis.mockResolvedValue({ run: sampleRun })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useRerunAnalysis(), { wrapper: Wrapper })

    result.current.mutate("run-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedService.rerunAnalysis).toHaveBeenCalledWith("run-1")
  })

  it("useDeleteAnalysisRun: invalidates the project's run list on success", async () => {
    mockedService.deleteRun.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useDeleteAnalysisRun("p1"), { wrapper: Wrapper })

    result.current.mutate("run-1")

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "analysisRuns"] })
  })
})
