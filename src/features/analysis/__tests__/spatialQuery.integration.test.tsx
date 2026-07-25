import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisToolbox } from "../components/AnalysisToolbox"
import { OperationConfigForm } from "../components/OperationConfigForm"
import { analysisService } from "../services/analysisService"
import { useAnalysisStore } from "../store/analysisStore"

const selectLayerMock = vi.fn()
const selectFeatureRangeMock = vi.fn()

vi.mock("../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn() },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: {
    list: vi.fn().mockResolvedValue({ features: [{ id: "f1" }, { id: "f2" }], nextCursor: null }),
  },
  useDatabaseStore: (selector: (state: unknown) => unknown) =>
    selector({ selectLayer: selectLayerMock, selectFeatureRange: selectFeatureRangeMock }),
}))

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

/**
 * T150 — full Spatial Query flow: Toolbox selection → configure → run →
 * matching features highlight on the map (quickstart.md §2, spec.md US2
 * Acceptance Scenarios).
 */
describe("Spatial Query integration (US2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      stagedInputLayerIds: ["source-layer", "reference-layer"],
      isHistoryPanelOpen: false,
      lastError: null,
      selectedPresetId: null,
      activeRunId: null,
      spatialQueryPredicate: null,
      measurementDraft: null,
    })
  })

  it("selecting Spatial Join in the Toolbox opens the Select by Location form", () => {
    render(<AnalysisToolbox />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /spatial join/i }))

    expect(useAnalysisStore.getState().selectedOperationType).toBe("spatialJoin")
  })

  it("running a query with a result layer selects it and highlights its features on the map", async () => {
    mockedService.runAnalysis.mockResolvedValue({
      run: {
        id: "run-1",
        projectId: "p1",
        userId: "u1",
        operationType: "spatialJoin",
        status: "succeeded",
        progress: 100,
        parameters: { relationship: "intersects" },
        inputLayerIds: ["source-layer", "reference-layer"],
        resultLayerId: "matching-layer",
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
      },
    })
    useAnalysisStore.setState({ selectedOperationType: "spatialJoin" })

    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByRole("button", { name: /run query/i }))

    await waitFor(() => expect(selectLayerMock).toHaveBeenCalledWith("matching-layer"))
    await waitFor(() => expect(selectFeatureRangeMock).toHaveBeenCalledWith(["f1", "f2"]))
  })
})
