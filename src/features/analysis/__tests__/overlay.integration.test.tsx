import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisToolbox } from "../components/AnalysisToolbox"
import { OperationConfigForm } from "../components/OperationConfigForm"
import { ResultPanel } from "../components/ResultPanel"
import { analysisService } from "../services/analysisService"
import { useAnalysisStore } from "../store/analysisStore"

vi.mock("../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn(), getRun: vi.fn(), discardResult: vi.fn() },
}))

const useFeaturesMock = vi.fn()

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: { list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }) },
  useFeatures: (layerId: string) => useFeaturesMock(layerId),
  useDatabaseStore: (selector: (state: unknown) => unknown) =>
    selector({ selectLayer: vi.fn(), selectFeatureRange: vi.fn() }),
}))

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function succeededRun(operationType: string, overrides: Record<string, unknown> = {}) {
  return {
    run: {
      id: "run-1",
      projectId: "p1",
      userId: "u1",
      operationType,
      status: "succeeded",
      progress: 100,
      parameters: {},
      inputLayerIds: ["layer-a", "layer-b"],
      resultLayerId: "overlay-result",
      resultData: null,
      errorMessage: null,
      batchId: null,
      presetId: null,
      startedAt: "t",
      completedAt: "t",
      executionTimeMs: 5,
      cancelRequestedAt: null,
      createdAt: "t",
      updatedAt: "t",
      ...overrides,
    },
  }
}

/**
 * T179 — full Overlay flow per quickstart.md §4: Toolbox selection →
 * two-layer configure → run → result surfaced. Exercises all 7 operations
 * (spec.md US4 Acceptance Scenarios 1–7).
 */
describe("Overlay integration (US4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFeaturesMock.mockReturnValue({ data: undefined })
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      stagedInputLayerIds: ["layer-a", "layer-b"],
      isHistoryPanelOpen: false,
      lastError: null,
      selectedPresetId: null,
      activeRunId: null,
      spatialQueryPredicate: null,
      measurementDraft: null,
    })
  })

  const OPERATIONS = [
    { toolboxLabel: "Union", operationType: "union", runLabel: "Run Union" },
    { toolboxLabel: "Intersection", operationType: "intersect", runLabel: "Run Intersection" },
    { toolboxLabel: "Difference", operationType: "difference", runLabel: "Run Difference" },
    { toolboxLabel: "Clip", operationType: "clip", runLabel: "Run Clip" },
    { toolboxLabel: "Erase", operationType: "erase", runLabel: "Run Erase" },
    { toolboxLabel: "Identity", operationType: "identity", runLabel: "Run Identity" },
    {
      toolboxLabel: "Symmetrical Difference",
      operationType: "symmetricalDifference",
      runLabel: "Run Symmetrical Difference",
    },
  ] as const

  it("the Toolbox lists all 7 Overlay operations as available (not 'coming soon')", () => {
    render(<AnalysisToolbox />, { wrapper: createWrapper() })

    for (const { toolboxLabel } of OPERATIONS) {
      const button = screen.getByRole("button", { name: new RegExp(`^${toolboxLabel}$`, "i") })
      expect(button.hasAttribute("disabled")).toBe(false)
      expect(button.textContent).not.toMatch(/coming soon/i)
    }
  })

  it.each(OPERATIONS)(
    "$toolboxLabel: Toolbox selection opens its form and running it submits both staged layers",
    async ({ toolboxLabel, operationType, runLabel }) => {
      mockedService.runAnalysis.mockResolvedValue(succeededRun(operationType) as never)

      const wrapper = createWrapper()
      render(<AnalysisToolbox />, { wrapper })
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${toolboxLabel}$`, "i") }))
      expect(useAnalysisStore.getState().selectedOperationType).toBe(operationType)

      render(<OperationConfigForm projectId="p1" />, { wrapper })
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${runLabel}$`, "i") }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType,
          inputLayerIds: ["layer-a", "layer-b"],
          parameters: undefined,
        }),
      )
    },
  )

  it("an overlay that preserves input attributes surfaces them in the Result panel (T176)", async () => {
    // Clip/Erase/Identity carry the input layer's own attributes through.
    useFeaturesMock.mockReturnValue({
      data: {
        features: [
          { id: "f1", attributes: [{ key: "name", value: "Parcel 1" }, { key: "zone", value: "R1" }] },
          { id: "f2", attributes: [{ key: "name", value: "Parcel 2" }] },
        ],
      },
    })
    mockedService.getRun.mockResolvedValue(succeededRun("clip") as never)
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/attributes preserved: name, zone/i)).toBeTruthy())
  })

  it("an overlay with no surviving attributes shows the result without an attribute line", async () => {
    // Union/Intersection/Difference/Symmetrical Difference build a new
    // combined shape with no per-feature attribute mapping.
    useFeaturesMock.mockReturnValue({ data: { features: [{ id: "f1", attributes: [] }] } })
    mockedService.getRun.mockResolvedValue(succeededRun("union") as never)
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/a new layer was added/i)).toBeTruthy())
    expect(screen.queryByText(/attributes preserved/i)).toBeNull()
  })
})
