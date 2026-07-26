import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisPanel } from "../AnalysisPanel"
import { HistoryPanel } from "../HistoryPanel"
import { PresetPicker } from "../PresetPicker"
import { ResultPanel } from "../ResultPanel"
import { analysisService } from "../../services/analysisService"
import { useAnalysisPanelStore } from "../../store/analysisPanelStore"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    runAnalysis: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    listPresets: vi.fn(),
    listExports: vi.fn(),
    discardResult: vi.fn(),
    logExport: vi.fn(),
    savePreset: vi.fn(),
    deleteRun: vi.fn(),
    rerunAnalysis: vi.fn(),
    listMeasurements: vi.fn().mockResolvedValue({ measurements: [], nextCursor: null }),
    saveMeasurement: vi.fn(),
    deleteMeasurement: vi.fn(),
  },
}))

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: { list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }) },
  useFeatures: () => ({ data: { features: [] } }),
  useDatabaseStore: (selector: (state: unknown) => unknown) =>
    selector({ selectLayer: vi.fn(), selectFeatureRange: vi.fn(), selectedProjectId: "p1" }),
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

vi.mock("@/features/database/store/databaseStore", () => ({
  useDatabaseStore: (selector: (state: unknown) => unknown) => selector({ selectedProjectId: "p1" }),
}))

/**
 * Lets one test make a real child throw during render. A rejected query is
 * caught by React Query and never reaches an error boundary, so only an
 * actual render-time throw exercises T254's boundary. Defaults to off, and
 * delegates to the real component otherwise, so every other test in this
 * file still sees genuine PropertyPanel behaviour.
 */
const { propertyPanelThrows } = vi.hoisted(() => ({ propertyPanelThrows: { value: false } }))

vi.mock("../PropertyPanel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../PropertyPanel")>()
  return {
    PropertyPanel: () => {
      if (propertyPanelThrows.value) throw new Error("boom")
      return <actual.PropertyPanel />
    },
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

/** A promise that never settles, so a pending query stays pending for the assertion. */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

/** T256 (US10) — loading, empty, and error states across every panel. */
describe("AnalysisPanel — loading/empty/error states", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedService.listRuns.mockResolvedValue({ runs: [], nextCursor: null } as never)
    mockedService.listPresets.mockResolvedValue({ presets: [] } as never)
    mockedService.listExports.mockResolvedValue({ exports: [], nextCursor: null } as never)
    mockedService.getRun.mockResolvedValue({ run: null } as never)
    useAnalysisPanelStore.setState({
      isPanelOpen: true,
      dockPosition: "right",
      panelWidth: 360,
      activeTab: "toolbox",
      selectedHistoryRunId: null,
    })
    useAnalysisStore.setState({
      selectedOperationType: null,
      draftParameters: null,
      stagedInputLayerIds: [],
      lastError: null,
      activeRunId: null,
      heatmapLayerId: null,
      measurementMode: null,
      measurementDraft: null,
    })
  })

  describe("loading (T252)", () => {
    it("History says it is loading rather than flashing an empty list", () => {
      mockedService.listRuns.mockReturnValue(pending())
      render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })

      expect(screen.getByText(/loading history/i)).toBeTruthy()
      // The misleading "no runs" message must not appear while pending.
      expect(screen.queryByText(/no analysis has been run/i)).toBeNull()
    })

    it("the Property panel says it is loading a selected run", () => {
      useAnalysisPanelStore.setState({ selectedHistoryRunId: "run-1", activeTab: "properties" })
      mockedService.getRun.mockReturnValue(pending())
      render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

      expect(screen.getByText(/loading run details/i)).toBeTruthy()
    })

    it("the Analysis Summary says it is loading run history", () => {
      mockedService.listRuns.mockReturnValue(pending())
      useAnalysisPanelStore.setState({ activeTab: "result" })
      render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

      expect(screen.getByText(/loading run history/i)).toBeTruthy()
    })
  })

  describe("empty (T253)", () => {
    it("History's empty state names history specifically", async () => {
      render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })

      await waitFor(() => expect(screen.getByText(/no analysis has been run in this project yet/i)).toBeTruthy())
    })

    it("Presets' empty state names presets specifically", async () => {
      render(<PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />, {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(screen.getByText(/no presets saved for this operation/i)).toBeTruthy())
    })

    it("the Result panel renders nothing at all until a run has succeeded", () => {
      const { container } = render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

      expect(container.textContent).toBe("")
    })

    it("the Analysis Summary's empty state names runs specifically", async () => {
      useAnalysisPanelStore.setState({ activeTab: "result" })
      render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

      await waitFor(() => expect(screen.getByText(/no analysis has been run in this project yet/i)).toBeTruthy())
    })

    it("each empty state is distinct, not one generic message", async () => {
      render(<HistoryPanel projectId="p1" />, { wrapper: createWrapper() })
      const historyEmpty = await screen.findByText(/no analysis has been run/i)

      const { getByText } = render(
        <PresetPicker projectId="p1" operationType="buffer" parametersToSave={{}} />,
        { wrapper: createWrapper() },
      )
      await waitFor(() => getByText(/no presets saved/i))

      expect(historyEmpty.textContent).not.toBe(getByText(/no presets saved/i).textContent)
    })
  })

  describe("error (T254)", () => {
    it("a store error renders as a dismissible banner", () => {
      useAnalysisStore.setState({ lastError: "Input layer was deleted" })
      render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

      const banner = screen.getByRole("alert")
      expect(banner.textContent).toMatch(/input layer was deleted/i)

      fireEvent.click(screen.getByRole("button", { name: /dismiss error/i }))
      expect(useAnalysisStore.getState().lastError).toBeNull()
    })

    it("no banner renders when there is no error", () => {
      render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

      expect(screen.queryByRole("button", { name: /dismiss error/i })).toBeNull()
    })

    it("a render error inside a tab is contained rather than blanking the panel", () => {
      useAnalysisPanelStore.setState({ activeTab: "properties" })
      propertyPanelThrows.value = true
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      try {
        render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

        expect(screen.getByText(/hit an unexpected error/i)).toBeTruthy()
        // The panel's own chrome survives, so the dashboard around it is
        // not blanked and the user can switch tabs or collapse out of it.
        expect(screen.getByRole("tab", { name: /toolbox/i })).toBeTruthy()
        expect(screen.getByRole("button", { name: /collapse analysis panel/i })).toBeTruthy()
      } finally {
        propertyPanelThrows.value = false
        consoleError.mockRestore()
      }
    })
  })
})
