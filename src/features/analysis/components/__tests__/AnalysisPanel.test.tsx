import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisPanel } from "../AnalysisPanel"
import { useAnalysisPanelStore } from "../../store/analysisPanelStore"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    runAnalysis: vi.fn(),
    getRun: vi.fn().mockResolvedValue({ run: null }),
    listRuns: vi.fn().mockResolvedValue({ runs: [], nextCursor: null }),
    listPresets: vi.fn().mockResolvedValue({ presets: [] }),
    listExports: vi.fn().mockResolvedValue({ exports: [], nextCursor: null }),
    discardResult: vi.fn(),
    logExport: vi.fn(),
    saveMeasurement: vi.fn(),
    listMeasurements: vi.fn().mockResolvedValue({ measurements: [], nextCursor: null }),
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

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function resetPanel(overrides: Record<string, unknown> = {}) {
  useAnalysisPanelStore.setState({
    isPanelOpen: true,
    dockPosition: "right",
    panelWidth: 360,
    activeTab: "toolbox",
    selectedHistoryRunId: null,
    ...overrides,
  })
}

/** T255 (US10) — dock, resize, collapse, and tab switching. */
describe("AnalysisPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPanel()
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

  it("renders only a reopen affordance while collapsed", () => {
    resetPanel({ isPanelOpen: false })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.queryByRole("complementary", { name: /analysis panel/i })).toBeNull()
    expect(screen.getByRole("button", { name: /^analysis$/i })).toBeTruthy()
  })

  it("reopens from the collapsed affordance", () => {
    resetPanel({ isPanelOpen: false })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /^analysis$/i }))

    expect(useAnalysisPanelStore.getState().isPanelOpen).toBe(true)
  })

  it("collapses without unmounting the dashboard around it", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /collapse analysis panel/i }))

    expect(useAnalysisPanelStore.getState().isPanelOpen).toBe(false)
  })

  it("offers every dock position and applies the chosen one", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    const select = screen.getByLabelText(/dock position/i) as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["left", "right", "floating"])

    fireEvent.change(select, { target: { value: "left" } })
    expect(useAnalysisPanelStore.getState().dockPosition).toBe("left")
  })

  it("applies the stored width when docked", () => {
    resetPanel({ panelWidth: 420 })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    const panel = screen.getByRole("complementary", { name: /analysis panel/i })
    expect(panel.style.width).toBe("420px")
  })

  it("the resize handle is keyboard-operable and clamped", () => {
    resetPanel({ panelWidth: 360 })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    const handle = screen.getByRole("separator", { name: /resize analysis panel/i })
    fireEvent.keyDown(handle, { key: "ArrowRight" })
    expect(useAnalysisPanelStore.getState().panelWidth).toBe(376)

    fireEvent.keyDown(handle, { key: "ArrowLeft" })
    expect(useAnalysisPanelStore.getState().panelWidth).toBe(360)
  })

  it("the resize handle refuses to shrink below its minimum", () => {
    resetPanel({ panelWidth: 280 })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.keyDown(screen.getByRole("separator", { name: /resize analysis panel/i }), { key: "ArrowLeft" })

    expect(useAnalysisPanelStore.getState().panelWidth).toBe(280)
  })

  it("a floating panel has no resize handle", () => {
    resetPanel({ dockPosition: "floating" })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.queryByRole("separator", { name: /resize analysis panel/i })).toBeNull()
  })

  it("every tab is reachable and renders its wired-in component", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    // Toolbox is the default tab.
    expect(screen.getByRole("navigation", { name: /analysis toolbox/i })).toBeTruthy()

    fireEvent.click(screen.getByRole("tab", { name: /history/i }))
    expect(useAnalysisPanelStore.getState().activeTab).toBe("history")
    expect(screen.getByRole("region", { name: /analysis history/i })).toBeTruthy()

    fireEvent.click(screen.getByRole("tab", { name: /properties/i }))
    expect(screen.getByText(/select a run from the history list/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("tab", { name: /result/i }))
    expect(screen.getByRole("region", { name: /analysis summary/i })).toBeTruthy()
  })

  it("marks the active tab with aria-selected", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.getByRole("tab", { name: /toolbox/i }).getAttribute("aria-selected")).toBe("true")

    fireEvent.click(screen.getByRole("tab", { name: /history/i }))
    expect(screen.getByRole("tab", { name: /history/i }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tab", { name: /toolbox/i }).getAttribute("aria-selected")).toBe("false")
  })

  it("the Toolbox tab hosts the operation form and the measure toolbar", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.getByText(/select an operation from the toolbox/i)).toBeTruthy()
    // The tool picker renders here without the map-bound click collector,
    // so arming a measurement from the panel drives the same map overlay.
    expect(screen.getByRole("radio", { name: /measure distance/i })).toBeTruthy()
  })

  it("arming a measurement tool from the panel sets the shared mode (T245)", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("radio", { name: /measure area/i }))

    expect(useAnalysisStore.getState().measurementMode).toBe("area")
  })
})
