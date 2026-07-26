import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HistoryPanel } from "../HistoryPanel"
import { analysisService } from "../../services/analysisService"
import { useAnalysisStore } from "../../store/analysisStore"
import { useAnalysisPanelStore } from "../../store/analysisPanelStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    listRuns: vi.fn(),
    rerunAnalysis: vi.fn(),
    deleteRun: vi.fn(),
  },
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

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    projectId: "p1",
    userId: "analyst-1",
    operationType: "buffer",
    status: "succeeded",
    progress: 100,
    parameters: { distance: 500, unit: "meters" },
    inputLayerIds: ["layer-a"],
    resultLayerId: "result-layer",
    resultData: null,
    errorMessage: null,
    batchId: null,
    presetId: null,
    startedAt: "2026-07-01T10:00:00.000Z",
    completedAt: "2026-07-01T10:00:02.000Z",
    executionTimeMs: 2000,
    cancelRequestedAt: null,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:02.000Z",
    ...overrides,
  }
}

/** T223 (US8) — every action in the History list. */
describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedService.listRuns.mockResolvedValue({ runs: [run()], nextCursor: null } as never)
    useAnalysisStore.setState({ selectedOperationType: null, draftParameters: null, lastError: null, activeRunId: null })
    useAnalysisPanelStore.setState({ selectedHistoryRunId: null })
  })

  it("lists a run's operation, parameters, timing, and user (FR-019)", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())
    expect(screen.getByText(/distance: 500/)).toBeTruthy()
    expect(screen.getByText(/analyst-1/)).toBeTruthy()
    // 2000ms renders as seconds rather than a raw millisecond count.
    expect(screen.getByText(/2\.00 s/)).toBeTruthy()
  })

  it("says so plainly when the project has no runs", async () => {
    mockedService.listRuns.mockResolvedValue({ runs: [], nextCursor: null } as never)
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/no analysis has been run/i)).toBeTruthy())
  })

  it("filtering by status re-queries with that status (T217)", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(mockedService.listRuns).toHaveBeenCalledWith("p1", {}))

    fireEvent.click(screen.getByLabelText("failed"))

    await waitFor(() => expect(mockedService.listRuns).toHaveBeenCalledWith("p1", { status: ["failed"] }))
  })

  it("status filters accumulate and can be cleared", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByLabelText("failed"))
    fireEvent.click(screen.getByLabelText("succeeded"))
    await waitFor(() =>
      expect(mockedService.listRuns).toHaveBeenCalledWith("p1", { status: ["failed", "succeeded"] }),
    )

    fireEvent.click(screen.getByLabelText("failed"))
    await waitFor(() => expect(mockedService.listRuns).toHaveBeenCalledWith("p1", { status: ["succeeded"] }))
  })

  it("an empty filtered list distinguishes 'no matches' from 'no runs at all'", async () => {
    mockedService.listRuns.mockResolvedValue({ runs: [], nextCursor: null } as never)
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText(/no analysis has been run/i)).toBeTruthy())

    fireEvent.click(screen.getByLabelText("cancelled"))

    await waitFor(() => expect(screen.getByText(/no runs match this filter/i)).toBeTruthy())
  })

  it("Re-run calls the rerun endpoint and makes the new run active (T219)", async () => {
    mockedService.rerunAnalysis.mockResolvedValue({ run: run({ id: "run-2" }) } as never)
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /^re-run$/i }))

    await waitFor(() => expect(mockedService.rerunAnalysis).toHaveBeenCalledWith("run-1"))
    await waitFor(() => expect(useAnalysisStore.getState().activeRunId).toBe("run-2"))
  })

  it("a failed re-run surfaces its message rather than failing silently", async () => {
    mockedService.rerunAnalysis.mockRejectedValue(new Error("Input layer was deleted"))
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /^re-run$/i }))

    await waitFor(() => expect(useAnalysisStore.getState().lastError).toBe("Input layer was deleted"))
  })

  it("Re-run with changes loads the run's operation and parameters into the form (T219)", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /re-run with changes/i }))

    const state = useAnalysisStore.getState()
    expect(state.selectedOperationType).toBe("buffer")
    // setSelectedOperationType clears the draft, so the parameters must be
    // applied after it - this asserts that ordering.
    expect(state.draftParameters).toEqual({ distance: 500, unit: "meters" })
    expect(mockedService.rerunAnalysis).not.toHaveBeenCalled()
  })

  it("View Result restores the past configuration and reopens its result (T218)", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /view result/i }))

    expect(useAnalysisStore.getState().activeRunId).toBe("run-1")
    expect(useAnalysisStore.getState().draftParameters).toEqual({ distance: 500, unit: "meters" })
  })

  it("View Result is not offered for a run that produced no layer", async () => {
    mockedService.listRuns.mockResolvedValue({ runs: [run({ resultLayerId: null })], nextCursor: null } as never)
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    expect(screen.queryByRole("button", { name: /view result/i })).toBeNull()
  })

  it("Delete asks for confirmation first and only deletes on confirm (T220)", async () => {
    mockedService.deleteRun.mockResolvedValue(undefined as never)
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }))

    // The confirmation states that the result layer survives (FR-026).
    expect(screen.getByText(/any layer it produced stays in your project/i)).toBeTruthy()
    expect(mockedService.deleteRun).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i, hidden: false }))
    await waitFor(() => expect(mockedService.deleteRun).toHaveBeenCalledWith("run-1"))
  })

  it("cancelling the delete confirmation deletes nothing", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }))
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => expect(screen.queryByText(/any layer it produced/i)).toBeNull())
    expect(mockedService.deleteRun).not.toHaveBeenCalled()
  })

  it("selecting a row publishes it for the Property panel", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getByRole("button", { name: /show details for buffer/i }))

    expect(useAnalysisPanelStore.getState().selectedHistoryRunId).toBe("run-1")
  })

  it("a run with no parameters says so instead of showing an empty object", async () => {
    mockedService.listRuns.mockResolvedValue({
      runs: [run({ parameters: {}, operationType: "union" })],
      nextCursor: null,
    } as never)
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/no parameters/i)).toBeTruthy())
  })
})
