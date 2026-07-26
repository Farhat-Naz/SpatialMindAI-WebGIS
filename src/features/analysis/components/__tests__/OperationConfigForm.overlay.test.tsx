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

/** The 7 overlay operations and the per-operation input labelling T167 requires. */
const OVERLAY_OPERATIONS = [
  { operationType: "union", title: "Union", first: "Layer A", second: "Layer B" },
  { operationType: "intersect", title: "Intersection", first: "Layer A", second: "Layer B" },
  { operationType: "difference", title: "Difference", first: "Layer A", second: "Layer B (subtracted)" },
  { operationType: "clip", title: "Clip", first: "Target layer", second: "Clip boundary" },
  { operationType: "erase", title: "Erase", first: "Target layer", second: "Erase boundary" },
  { operationType: "identity", title: "Identity", first: "Target layer", second: "Reference layer" },
  {
    operationType: "symmetricalDifference",
    title: "Symmetrical Difference",
    first: "Layer A",
    second: "Layer B",
  },
] as const

/**
 * T178 (US4) — two-layer selection validation and per-operation labelling
 * for the Overlay form, covering spec.md Acceptance Scenarios US4.1–7.
 */
describe("OperationConfigForm — Overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it.each(OVERLAY_OPERATIONS)(
    "$title labels its two inputs as '$first' / '$second'",
    ({ operationType, title, first, second }) => {
      useAnalysisStore.setState({ selectedOperationType: operationType, stagedInputLayerIds: ["a", "b"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      expect(screen.getByRole("form", { name: new RegExp(`${title} parameters`, "i") })).toBeTruthy()
      expect(screen.getByRole("button", { name: new RegExp(`run ${title}`, "i") })).toBeTruthy()
      // Both input roles are named in the staged-layer summary line.
      expect(screen.getByText(new RegExp(`${first}:`, "i"))).toBeTruthy()
      expect(screen.getByText(new RegExp(`${second.replace(/[()]/g, "\\$&")}:`, "i"))).toBeTruthy()
    },
  )

  it.each(OVERLAY_OPERATIONS)("$title rejects submission with fewer than 2 layers staged", ({ operationType, second }) => {
    useAnalysisStore.setState({ selectedOperationType: operationType, stagedInputLayerIds: ["only-one"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /^run /i }))

    // Client-side rejection is announced, and no request is made.
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toMatch(/select two layers/i)
    expect(alert.textContent).toContain(second)
    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
  })

  it("rejects submission when no layers are staged at all", () => {
    useAnalysisStore.setState({ selectedOperationType: "union", stagedInputLayerIds: [] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /run union/i }))

    expect(screen.getByRole("alert").textContent).toMatch(/select two layers/i)
    expect(mockedService.runAnalysis).not.toHaveBeenCalled()
  })

  it.each(OVERLAY_OPERATIONS)(
    "$title submits the two staged layers in order with no parameters",
    async ({ operationType, title }) => {
      mockedService.runAnalysis.mockResolvedValue({
        run: { id: "r", status: "succeeded", resultLayerId: "result-layer" } as never,
      })
      useAnalysisStore.setState({ selectedOperationType: operationType, stagedInputLayerIds: ["first", "second"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: new RegExp(`run ${title}`, "i") }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType,
          inputLayerIds: ["first", "second"],
          parameters: undefined,
        }),
      )
    },
  )

  it("only the first two staged layers are used, in staging order", async () => {
    mockedService.runAnalysis.mockResolvedValue({
      run: { id: "r", status: "succeeded", resultLayerId: "result-layer" } as never,
    })
    useAnalysisStore.setState({ selectedOperationType: "clip", stagedInputLayerIds: ["a", "b", "c"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /run clip/i }))

    await waitFor(() =>
      expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
        operationType: "clip",
        inputLayerIds: ["a", "b"],
        parameters: undefined,
      }),
    )
  })

  it("surfaces a failed run through the store's lastError", async () => {
    mockedService.runAnalysis.mockRejectedValue(new Error("Overlay failed on the server"))
    useAnalysisStore.setState({ selectedOperationType: "intersect", stagedInputLayerIds: ["a", "b"] })
    render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /run intersection/i }))

    await waitFor(() => expect(useAnalysisStore.getState().lastError).toBe("Overlay failed on the server"))
  })
})
