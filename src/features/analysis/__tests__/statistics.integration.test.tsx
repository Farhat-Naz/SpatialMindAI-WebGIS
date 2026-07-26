import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisToolbox } from "../components/AnalysisToolbox"
import { AnalysisSummary } from "../components/AnalysisSummary"
import { OperationConfigForm } from "../components/OperationConfigForm"
import { ResultPanel } from "../components/ResultPanel"
import { analysisService } from "../services/analysisService"
import { useAnalysisStore } from "../store/analysisStore"

vi.mock("../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn(), getRun: vi.fn(), discardResult: vi.fn(), listRuns: vi.fn() },
}))

const useFeaturesMock = vi.fn()

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: { list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }) },
  useFeatures: (layerId: string) => useFeaturesMock(layerId),
  useDatabaseStore: (selector: (state: unknown) => unknown) =>
    selector({ selectLayer: vi.fn(), selectFeatureRange: vi.fn() }),
}))

vi.mock("@/features/database/store/editingStore", () => ({
  useEditingStore: (selector: (state: unknown) => unknown) => selector({ setTool: vi.fn() }),
}))

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

const POLYGON_SUMMARY = {
  featureCount: 3,
  geometryTypes: ["POLYGON"],
  totalAreaSquareMeters: 1234.5,
  averageAreaSquareMeters: 411.5,
  totalLengthMeters: 0,
  averageLengthMeters: 0,
  boundingBox: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  centroid: { type: "Point", coordinates: [0.5, 0.5] },
  convexHull: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  extent: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
}

function summarizeRun(resultData: unknown = POLYGON_SUMMARY, operationType = "summarize") {
  return {
    run: {
      id: "run-1",
      projectId: "p1",
      userId: "u1",
      operationType,
      status: "succeeded",
      progress: 100,
      parameters: {},
      inputLayerIds: ["layer-a"],
      // Statistics never create a layer (spec.md US6).
      resultLayerId: null,
      resultData,
      errorMessage: null,
      batchId: null,
      presetId: null,
      startedAt: "t",
      completedAt: "t",
      executionTimeMs: 5,
      cancelRequestedAt: null,
      createdAt: "t",
      updatedAt: "t",
    },
  }
}

/** T213 — quickstart.md §6: choose Summarize on a layer, see every statistic without a new layer being created. */
describe("Spatial Statistics integration (US6)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFeaturesMock.mockReturnValue({ data: { features: [] } })
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      stagedInputLayerIds: ["layer-a"],
      isHistoryPanelOpen: false,
      lastError: null,
      selectedPresetId: null,
      activeRunId: null,
      spatialQueryPredicate: null,
      measurementDraft: null,
    })
  })

  it("the Toolbox lists Summarize and every individual statistic as available", () => {
    render(<AnalysisToolbox />, { wrapper: createWrapper() })

    for (const label of [
      "Summarize",
      "Feature Count",
      "Area Calculation",
      "Average Area",
      "Length Calculation",
      "Total Length",
      "Average Length",
      "Density Analysis",
      "Bounding Box",
      "Centroid",
      "Convex Hull",
      "Extent",
    ]) {
      const button = screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") })
      expect(button.hasAttribute("disabled")).toBe(false)
      expect(button.textContent).not.toMatch(/coming soon/i)
    }
  })

  it("§6.1 selecting Summarize with a project context runs it immediately (T201)", async () => {
    mockedService.runAnalysis.mockResolvedValue(summarizeRun() as never)

    render(<AnalysisToolbox projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "summarize",
        inputLayerIds: ["layer-a"],
        parameters: undefined,
      }),
    )
  })

  it("without a project context the Toolbox stays a pure selector", () => {
    render(<AnalysisToolbox />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))

    expect(useAnalysisStore.getState().selectedOperationType).toBe("summarize")
    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
  })

  it("selecting Summarize with no layer staged reports why instead of running", () => {
    useAnalysisStore.setState({ stagedInputLayerIds: [] })
    render(<AnalysisToolbox projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))

    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    expect(useAnalysisStore.getState().lastError).toMatch(/select a layer/i)
  })

  it("Summarize is also runnable from its confirm form", async () => {
    mockedService.runAnalysis.mockResolvedValue(summarizeRun() as never)
    useAnalysisStore.setState({ selectedOperationType: "summarize" })

    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole("button", { name: /^run summarize$/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "summarize",
        inputLayerIds: ["layer-a"],
        parameters: undefined,
      }),
    )
  })

  it("§6.1 the result shows every statistic as a card and creates no layer", async () => {
    mockedService.getRun.mockResolvedValue(summarizeRun() as never)
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByLabelText("Statistics")).toBeTruthy())
    for (const label of [/feature count/i, /total area/i, /bounding box/i, /centroid/i, /convex hull/i, /extent/i]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    // No layer was produced, so no "added to your project" message.
    expect(screen.queryByText(/a new layer was added/i)).toBeNull()
    // And the payload is rendered as cards, not raw JSON.
    expect(screen.queryByText(/"featureCount"/)).toBeNull()
  })

  it("a point layer's summary omits area and length cards", async () => {
    mockedService.getRun.mockResolvedValue(
      summarizeRun({ ...POLYGON_SUMMARY, geometryTypes: ["POINT"] }) as never,
    )
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/feature count/i)).toBeTruthy())
    expect(screen.queryByText(/total area/i)).toBeNull()
    expect(screen.queryByText(/total length/i)).toBeNull()
  })

  it("a non-statistics run still falls back to the raw payload view", async () => {
    mockedService.getRun.mockResolvedValue(
      summarizeRun({ unrepairedFeatureIds: ["broken-1"] }, "repairGeometry") as never,
    )
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/broken-1/)).toBeTruthy())
  })

  it("AnalysisSummary tallies a project's runs by status and operation (T210)", async () => {
    mockedService.listRuns.mockResolvedValue({
      runs: [
        { status: "succeeded", operationType: "buffer" },
        { status: "succeeded", operationType: "buffer" },
        { status: "failed", operationType: "clip" },
      ],
      nextCursor: null,
    } as never)

    render(<AnalysisSummary projectId="p1" statistics={POLYGON_SUMMARY} />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/3 total/i)).toBeTruthy())
    expect(screen.getByText(/by status/i)).toBeTruthy()
    expect(screen.getByText(/by operation/i)).toBeTruthy()
    // The active run's own statistics render alongside the tally.
    expect(screen.getByText(/layer statistics/i)).toBeTruthy()
    expect(screen.getByText(/feature count/i)).toBeTruthy()
  })

  it("AnalysisSummary says so plainly when a project has no runs", async () => {
    mockedService.listRuns.mockResolvedValue({ runs: [], nextCursor: null } as never)

    render(<AnalysisSummary projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/no analysis has been run/i)).toBeTruthy())
  })
})
