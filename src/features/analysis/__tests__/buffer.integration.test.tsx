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

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  // ResultPanel reads the result layer's features to report which input
  // attributes survived the operation (T176); Buffer's result carries none.
  useFeatures: () => ({ data: { features: [] } }),
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

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

const succeededRun = {
  id: "run-1",
  projectId: "p1",
  userId: "u1",
  operationType: "buffer",
  status: "succeeded" as const,
  progress: 100,
  parameters: { distance: 500, unit: "meters" as const, dissolve: false },
  inputLayerIds: ["l1"],
  resultLayerId: "new-layer-1",
  resultData: null,
  errorMessage: null,
  batchId: null,
  presetId: null,
  startedAt: "t",
  completedAt: "t",
  executionTimeMs: 42,
  cancelRequestedAt: null,
  createdAt: "t",
  updatedAt: "t",
}

/**
 * T133 — full Buffer flow: Toolbox selection → configure → run → result →
 * add to project (quickstart.md §1, spec.md US1 Acceptance Scenarios).
 * Renders the composed components with a mocked service layer (real
 * React Query + Zustand) rather than a live server, matching this
 * codebase's existing component-integration test convention.
 */
describe("Buffer integration (US1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      stagedInputLayerIds: ["l1"],
      isHistoryPanelOpen: false,
      lastError: null,
      selectedPresetId: null,
      activeRunId: null,
      spatialQueryPredicate: null,
      measurementDraft: null,
    })
  })

  it("selecting Buffer in the Toolbox opens the Buffer form", () => {
    render(<AnalysisToolbox />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /^buffer$/i }))

    expect(useAnalysisStore.getState().selectedOperationType).toBe("buffer")
  })

  it("configuring and running Buffer produces a visible result with an Add to Project action", async () => {
    mockedService.runAnalysis.mockResolvedValue({ run: succeededRun })
    mockedService.getRun.mockResolvedValue({ run: succeededRun })
    useAnalysisStore.setState({ selectedOperationType: "buffer" })

    const Wrapper = createWrapper()
    const { rerender } = render(
      <Wrapper>
        <OperationConfigForm projectId="p1" />
        <ResultPanel projectId="p1" />
      </Wrapper>,
    )

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: /run buffer/i }))

    await waitFor(() => expect(mockedService.runAnalysis).toHaveBeenCalled())
    await waitFor(() => expect(useAnalysisStore.getState().activeRunId).toBe("run-1"))

    rerender(
      <Wrapper>
        <OperationConfigForm projectId="p1" />
        <ResultPanel projectId="p1" />
      </Wrapper>,
    )

    await waitFor(() => expect(screen.getByText(/new layer was added/i)).toBeTruthy())
    expect(screen.getByRole("button", { name: /add to project/i })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /add to project/i }))
    expect(useAnalysisStore.getState().activeRunId).toBeNull()
  })
})
