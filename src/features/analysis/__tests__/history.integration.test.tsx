import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HistoryPanel } from "../components/HistoryPanel"
import { PropertyPanel } from "../components/PropertyPanel"
import { PresetPicker } from "../components/PresetPicker"
import { analysisService } from "../services/analysisService"
import { useAnalysisStore } from "../store/analysisStore"
import { useAnalysisPanelStore } from "../store/analysisPanelStore"

vi.mock("../services/analysisService", () => ({
  analysisService: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    rerunAnalysis: vi.fn(),
    deleteRun: vi.fn(),
    listPresets: vi.fn(),
    savePreset: vi.fn(),
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

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "buffer-run",
    projectId: "p1",
    userId: "analyst-1",
    operationType: "buffer",
    status: "succeeded",
    progress: 100,
    parameters: { distance: 500, unit: "meters", dissolve: false },
    inputLayerIds: ["layer-a"],
    resultLayerId: "buffer-result",
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

/**
 * T224 — quickstart.md §8 end to end: list every run with its details,
 * re-run one, inspect it, delete it, and save/apply a preset.
 */
describe("Analysis History integration (US8)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedService.listRuns.mockResolvedValue({
      runs: [makeRun(), makeRun({ id: "clip-run", operationType: "clip", parameters: {}, status: "failed" })],
      nextCursor: null,
    } as never)
    mockedService.getRun.mockResolvedValue({ run: makeRun() } as never)
    mockedService.listPresets.mockResolvedValue({ presets: [] } as never)
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      stagedInputLayerIds: ["layer-a"],
      selectedPresetId: null,
      lastError: null,
      activeRunId: null,
    })
    useAnalysisPanelStore.setState({ selectedHistoryRunId: null })
  })

  it("§8.1 lists every run with operation, parameters, timestamp, and user", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())
    expect(screen.getByText("clip")).toBeTruthy()
    expect(screen.getByText(/distance: 500/)).toBeTruthy()
    expect(screen.getAllByText(/analyst-1/).length).toBe(2)
  })

  it("§8.2 re-running a Buffer run submits the same run id and surfaces the new run", async () => {
    mockedService.rerunAnalysis.mockResolvedValue({ run: makeRun({ id: "buffer-run-2" }) } as never)

    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    // The first row is the Buffer run.
    fireEvent.click(screen.getAllByRole("button", { name: /^re-run$/i })[0])

    await waitFor(() => expect(mockedService.rerunAnalysis).toHaveBeenCalledWith("buffer-run"))
    await waitFor(() => expect(useAnalysisStore.getState().activeRunId).toBe("buffer-run-2"))
  })

  it("selecting a run in History drives the Property panel's detail view", async () => {
    const wrapper = createWrapper()
    render(<HistoryPanel projectId="p1" />, { wrapper })
    render(<PropertyPanel />, { wrapper })

    // Nothing selected yet.
    expect(screen.getByText(/select a run from the history list/i)).toBeTruthy()

    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /show details for buffer/i }))

    await waitFor(() => expect(screen.getByLabelText("Run details")).toBeTruthy())
    expect(mockedService.getRun).toHaveBeenCalledWith("buffer-run")
  })

  it("deleting a history entry confirms first and leaves the result layer alone (FR-026)", async () => {
    mockedService.deleteRun.mockResolvedValue(undefined as never)

    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0])
    expect(screen.getByText(/any layer it produced stays in your project/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }))
    await waitFor(() => expect(mockedService.deleteRun).toHaveBeenCalledWith("buffer-run"))
  })

  it("§8.3 a saved preset becomes a quick-start option that fills the form", async () => {
    const preset = {
      id: "preset-1",
      projectId: "p1",
      userId: "u1",
      name: "500m walk",
      operationType: "buffer",
      parameters: { distance: 500, unit: "meters", dissolve: false },
      createdAt: "t",
      updatedAt: "t",
    }
    mockedService.savePreset.mockResolvedValue({ preset } as never)

    const { unmount } = render(
      <PresetPicker projectId="p1" operationType="buffer" parametersToSave={preset.parameters} />,
      { wrapper: createWrapper() },
    )

    fireEvent.change(screen.getByLabelText(/save current parameters as/i), { target: { value: "500m walk" } })
    fireEvent.click(screen.getByRole("button", { name: /save as preset/i }))
    await waitFor(() => expect(mockedService.savePreset).toHaveBeenCalled())
    unmount()

    // Starting a new Buffer run: the preset is offered and applying it
    // fills the draft the form reads from.
    mockedService.listPresets.mockResolvedValue({ presets: [preset] } as never)
    render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByRole("button", { name: /500m walk/i })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: /500m walk/i }))

    expect(useAnalysisStore.getState().selectedOperationType).toBe("buffer")
    expect(useAnalysisStore.getState().draftParameters).toEqual(preset.parameters)
  })

  it("filtering to failed runs narrows the list without a reload", async () => {
    render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
    await waitFor(() => expect(screen.getByText("buffer")).toBeTruthy())

    mockedService.listRuns.mockResolvedValue({
      runs: [makeRun({ id: "clip-run", operationType: "clip", status: "failed" })],
      nextCursor: null,
    } as never)
    fireEvent.click(screen.getByLabelText("failed"))

    await waitFor(() => expect(mockedService.listRuns).toHaveBeenCalledWith("p1", { status: ["failed"] }))
    await waitFor(() => expect(screen.queryByText("buffer")).toBeNull())
    expect(screen.getByText("clip")).toBeTruthy()
  })
})
