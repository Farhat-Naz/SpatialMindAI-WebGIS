import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useExportHistory, useExportResult } from "../useExportHistory"
import { analysisService } from "../../services/analysisService"
import * as exportServiceModule from "../../services/exportService"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    listExports: vi.fn(),
    logExport: vi.fn(),
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

const sampleExport = {
  id: "e1",
  projectId: "p1",
  userId: "u1",
  sourceAnalysisRunId: null,
  sourceLayerId: "l1",
  format: "geojson" as const,
  status: "succeeded" as const,
  featureCount: 10,
  errorMessage: null,
  createdAt: "t",
}

describe("useExportHistory hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("useExportHistory: lists a project's export history", async () => {
    mockedService.listExports.mockResolvedValue({ exports: [sampleExport], nextCursor: null })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useExportHistory("p1"), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.exports).toHaveLength(1)
  })

  it("useExportResult: logs success and invalidates export history", async () => {
    vi.spyOn(exportServiceModule, "exportAnalysisResult").mockResolvedValue({ blob: new Blob(), featureCount: 12 })
    mockedService.logExport.mockResolvedValue({ exportJob: sampleExport })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useExportResult("p1"), { wrapper: Wrapper })

    result.current.mutate({ run: { resultLayerId: "l1", resultData: null }, format: "geojson" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // featureCount is logged so the history list can show an export's size
    // without re-reading the layer (T234).
    expect(mockedService.logExport).toHaveBeenCalledWith("p1", {
      sourceAnalysisRunId: undefined,
      format: "geojson",
      status: "succeeded",
      featureCount: 12,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects", "p1", "exportHistory"] })
  })

  it("useExportResult: logs failure and re-throws when the underlying export fails", async () => {
    vi.spyOn(exportServiceModule, "exportAnalysisResult").mockRejectedValue(new Error("browser memory limit"))
    mockedService.logExport.mockResolvedValue({ exportJob: { ...sampleExport, status: "failed" } })
    const { Wrapper } = createWrapper()
    const { result } = renderHook(() => useExportResult("p1"), { wrapper: Wrapper })

    result.current.mutate({ run: { resultLayerId: "l1", resultData: null }, format: "shapefile" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mockedService.logExport).toHaveBeenCalledWith("p1", {
      sourceAnalysisRunId: undefined,
      format: "shapefile",
      status: "failed",
      errorMessage: "browser memory limit",
    })
  })
})
