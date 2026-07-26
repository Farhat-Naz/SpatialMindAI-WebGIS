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

// The analysis feature imports these from their own modules rather than
// the `@/features/database` barrel (the barrel re-exports map components,
// which drag Leaflet into non-map consumers). These delegate to the barrel
// mock above so there is still only one place to configure the fakes; the
// try/catch covers files whose barrel mock only defines some of the four.
vi.mock("@/features/database/services/queryKeys", async () => {
  try {
    return { queryKeys: (await import("@/features/database")).queryKeys }
  } catch {
    return { queryKeys: {} }
  }
})
vi.mock("@/features/database/services/featureService", async () => {
  try {
    return { featureService: (await import("@/features/database")).featureService }
  } catch {
    return { featureService: { list: vi.fn() } }
  }
})
vi.mock("@/features/database/hooks/useFeatures", async () => {
  try {
    return { useFeatures: (await import("@/features/database")).useFeatures }
  } catch {
    return { useFeatures: () => ({ data: undefined }) }
  }
})
vi.mock("@/features/database/store/databaseStore", async () => {
  try {
    return { useDatabaseStore: (await import("@/features/database")).useDatabaseStore }
  } catch {
    return { useDatabaseStore: (selector: (state: unknown) => unknown) => selector({}) }
  }
})

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
      inputLayerIds: ["layer-a"],
      resultLayerId: "geometry-result",
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
 * T196 — the three flows of quickstart.md §5: Simplify with a tolerance,
 * Repair Geometry surfacing an unrepairable feature rather than failing
 * silently, and Multipart to Singlepart copying attributes to each part.
 */
describe("Geometry Processing integration (US5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFeaturesMock.mockReturnValue({ data: undefined })
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

  it("the Toolbox lists all 8 Geometry Processing operations as available", () => {
    render(<AnalysisToolbox />, { wrapper: createWrapper() })

    for (const label of [
      "Simplify",
      "Smooth",
      "Split",
      "Merge",
      "Dissolve",
      "Multipart to Singlepart",
      "Singlepart to Multipart",
      "Repair Geometry",
    ]) {
      const button = screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") })
      expect(button.hasAttribute("disabled")).toBe(false)
      expect(button.textContent).not.toMatch(/coming soon/i)
    }
  })

  it("§5.1 Simplify: Toolbox selection, tolerance entry, and run", async () => {
    mockedService.runAnalysis.mockResolvedValue(succeededRun("simplify") as never)

    const wrapper = createWrapper()
    render(<AnalysisToolbox />, { wrapper })
    fireEvent.click(screen.getByRole("button", { name: /^simplify$/i }))
    expect(useAnalysisStore.getState().selectedOperationType).toBe("simplify")

    render(<OperationConfigForm projectId="p1" />, { wrapper })
    fireEvent.change(screen.getByLabelText(/^tolerance/i), { target: { value: "0.005" } })
    fireEvent.click(screen.getByRole("button", { name: /^run simplify$/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "simplify",
        inputLayerIds: ["layer-a"],
        parameters: { tolerance: 0.005 },
      }),
    )
  })

  it("§5.1 Simplify: an already-simple layer reports 'no change needed' rather than looking failed", async () => {
    mockedService.getRun.mockResolvedValue(
      succeededRun("simplify", { resultData: { unchangedFeatureCount: 4, noChangeNeeded: true } }) as never,
    )
    useFeaturesMock.mockReturnValue({ data: { features: [] } })
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    // The run succeeded and the no-op outcome is visible in the payload.
    await waitFor(() => expect(screen.getByText(/noChangeNeeded/i)).toBeTruthy())
    expect(screen.getByText(/unchangedFeatureCount/i)).toBeTruthy()
  })

  it("§5.2 Repair Geometry: an unrepairable feature is reported, not silently dropped", async () => {
    mockedService.runAnalysis.mockResolvedValue(succeededRun("repairGeometry") as never)

    useAnalysisStore.setState({ selectedOperationType: "repairGeometry" })

    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole("button", { name: /^run repair geometry$/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "repairGeometry",
        inputLayerIds: ["layer-a"],
        parameters: undefined,
      }),
    )

    mockedService.getRun.mockResolvedValue(
      succeededRun("repairGeometry", { resultData: { unrepairedFeatureIds: ["broken-1"] } }) as never,
    )
    useFeaturesMock.mockReturnValue({ data: { features: [] } })
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText(/broken-1/)).toBeTruthy())
  })

  it("§5.3 Multipart to Singlepart: each resulting part carries the parent's attributes", async () => {
    mockedService.getRun.mockResolvedValue(succeededRun("multipartToSinglepart") as never)
    // ST_Dump produced three parts, each with the original's attributes.
    useFeaturesMock.mockReturnValue({
      data: {
        features: [
          { id: "p1", attributes: [{ key: "name", value: "Island" }, { key: "zone", value: "A" }] },
          { id: "p2", attributes: [{ key: "name", value: "Island" }, { key: "zone", value: "A" }] },
          { id: "p3", attributes: [{ key: "name", value: "Island" }, { key: "zone", value: "A" }] },
        ],
      },
    })
    useAnalysisStore.setState({ activeRunId: "run-1" })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/attributes preserved: name, zone/i)).toBeTruthy())
  })
})
