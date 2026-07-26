import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OperationConfigForm } from "../OperationConfigForm"
import { analysisService } from "../../services/analysisService"
import { useAnalysisStore } from "../../store/analysisStore"
import { ANALYSIS_OPERATION_CATALOG } from "../../types/analysisOperations.constants"

vi.mock("../../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn() },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
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

describe("OperationConfigForm — Buffer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      stagedInputLayerIds: [],
      isHistoryPanelOpen: false,
      lastError: null,
      selectedPresetId: null,
      activeRunId: null,
      spatialQueryPredicate: null,
      measurementDraft: null,
    })
  })

  it("renders a placeholder when no operation is selected", () => {
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    expect(screen.getByText(/select an operation/i)).toBeTruthy()
  })

  it("renders the Buffer form when selectedOperationType is buffer", () => {
    useAnalysisStore.setState({ selectedOperationType: "buffer" })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    expect(screen.getByRole("form", { name: /buffer parameters/i })).toBeTruthy()
  })

  it("rejects a distance of 0 or less with an accessible error message", () => {
    useAnalysisStore.setState({ selectedOperationType: "buffer" })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: /run buffer/i }))

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toMatch(/positive number/i)
    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
  })

  it("rejects submission with no layer staged", () => {
    useAnalysisStore.setState({ selectedOperationType: "buffer" })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: /run buffer/i }))

    expect(screen.getByRole("alert").textContent).toMatch(/select at least one layer/i)
    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
  })

  it("submits distance/unit/dissolve for the first staged layer", async () => {
    mockedService.runAnalysis.mockResolvedValue({
      run: {
        id: "run-1",
        projectId: "p1",
        userId: "u1",
        operationType: "buffer",
        status: "succeeded",
        progress: 100,
        parameters: {},
        inputLayerIds: ["l1"],
        resultLayerId: "new-layer",
        resultData: null,
        errorMessage: null,
        batchId: null,
        presetId: null,
        startedAt: "t",
        completedAt: "t",
        executionTimeMs: 10,
        cancelRequestedAt: null,
        createdAt: "t",
        updatedAt: "t",
      },
    })
    useAnalysisStore.setState({ selectedOperationType: "buffer", stagedInputLayerIds: ["l1"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: "500" } })
    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: "kilometers" } })
    fireEvent.click(screen.getByLabelText(/dissolve/i))
    fireEvent.click(screen.getByRole("button", { name: /run buffer/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "buffer",
        inputLayerIds: ["l1"],
        parameters: { distance: 500, unit: "kilometers", dissolve: true },
      }),
    )
  })

  it("shows a graceful placeholder for an operation with no form yet", () => {
    // Read the subject from the catalog rather than naming an operation:
    // each user-story phase ships another form, so any hard-coded choice
    // here silently becomes wrong the moment that phase lands (it already
    // did twice, for `union` in Phase 11 and `simplify` in Phase 12).
    const pending = ANALYSIS_OPERATION_CATALOG.find((entry) => entry.operationType && !entry.implemented)
    if (!pending?.operationType) {
      // Every catalogued operation has a form — the placeholder branch is
      // dead code, which is a real finding, not a passing test.
      throw new Error("No unimplemented operation left in the catalog; remove OperationConfigForm's placeholder branch.")
    }
    useAnalysisStore.setState({ selectedOperationType: pending.operationType })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })
    expect(screen.getByText(/not yet available/i)).toBeTruthy()
  })
})
