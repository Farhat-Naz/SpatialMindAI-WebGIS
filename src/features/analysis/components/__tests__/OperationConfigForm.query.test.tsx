import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OperationConfigForm } from "../OperationConfigForm"
import { analysisService } from "../../services/analysisService"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: { runAnalysis: vi.fn() },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: { list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }) },
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

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function resetStore() {
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
}

describe("OperationConfigForm — Spatial Query", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it("renders the Select by Location form with every predicate keyboard-selectable", () => {
    useAnalysisStore.setState({ selectedOperationType: "spatialJoin", stagedInputLayerIds: ["l1", "l2"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    const select = screen.getByLabelText(/relationship/i) as HTMLSelectElement
    const values = Array.from(select.options).map((option) => option.value)
    expect(values).toEqual(["intersects", "within", "contains", "touches", "crosses", "overlaps", "nearest"])
  })

  it("rejects submission without both a source and reference layer staged", () => {
    useAnalysisStore.setState({ selectedOperationType: "spatialJoin", stagedInputLayerIds: ["l1"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /run query/i }))

    expect(screen.getByRole("alert").textContent).toMatch(/source layer and a reference layer/i)
    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
  })

  it("submits spatialJoin with the selected relationship for the two staged layers", async () => {
    mockedService.runAnalysis.mockResolvedValue({
      run: {
        id: "run-1",
        projectId: "p1",
        userId: "u1",
        operationType: "spatialJoin",
        status: "succeeded",
        progress: 100,
        parameters: {},
        inputLayerIds: ["l1", "l2"],
        resultLayerId: "new-layer",
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
    useAnalysisStore.setState({ selectedOperationType: "spatialJoin", stagedInputLayerIds: ["l1", "l2"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "within" } })
    fireEvent.click(screen.getByRole("button", { name: /run query/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "spatialJoin",
        inputLayerIds: ["l1", "l2"],
        parameters: { relationship: "within" },
      }),
    )
  })

  it("submits touches/crosses/overlaps with no parameters", async () => {
    mockedService.runAnalysis.mockResolvedValue({
      run: { resultLayerId: "new-layer", id: "r", status: "succeeded" } as never,
    })
    useAnalysisStore.setState({ selectedOperationType: "touches", stagedInputLayerIds: ["l1", "l2"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "touches" } })
    fireEvent.click(screen.getByRole("button", { name: /run query/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "touches",
        inputLayerIds: ["l1", "l2"],
        parameters: undefined,
      }),
    )
  })

  it("submits nearAnalysis when the Nearest predicate is selected", async () => {
    mockedService.runAnalysis.mockResolvedValue({
      run: { resultLayerId: null, resultData: [], id: "r", status: "succeeded" } as never,
    })
    useAnalysisStore.setState({ selectedOperationType: "nearAnalysis", stagedInputLayerIds: ["l1", "l2"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "nearest" } })
    fireEvent.click(screen.getByRole("button", { name: /run query/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "nearAnalysis",
        inputLayerIds: ["l1", "l2"],
        parameters: undefined,
      }),
    )
  })

  it("renders the Select by Attribute form and validates a required key", () => {
    useAnalysisStore.setState({ selectedOperationType: "selectByAttribute", stagedInputLayerIds: ["l1"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /run select by attribute/i }))

    expect(screen.getByRole("alert").textContent).toMatch(/attribute key/i)
    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
  })

  it("submits selectByAttribute with key/operator/value", async () => {
    mockedService.runAnalysis.mockResolvedValue({
      run: { resultLayerId: "new-layer", id: "r", status: "succeeded" } as never,
    })
    useAnalysisStore.setState({ selectedOperationType: "selectByAttribute", stagedInputLayerIds: ["l1"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText(/attribute key/i), { target: { value: "kind" } })
    fireEvent.change(screen.getByLabelText(/^value$/i), { target: { value: "target" } })
    fireEvent.click(screen.getByRole("button", { name: /run select by attribute/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "selectByAttribute",
        inputLayerIds: ["l1"],
        parameters: { key: "kind", operator: "eq", value: "target" },
      }),
    )
  })
})
