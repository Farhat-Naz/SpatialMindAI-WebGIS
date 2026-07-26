import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AnalysisPanel } from "../components/AnalysisPanel"
import { ANALYSIS_OPERATION_CATALOG } from "../types/analysisOperations.constants"
import { useAnalysisPanelStore } from "../store/analysisPanelStore"
import { useAnalysisStore } from "../store/analysisStore"

vi.mock("../services/analysisService", () => ({
  analysisService: {
    runAnalysis: vi.fn(),
    getRun: vi.fn().mockResolvedValue({ run: null }),
    listRuns: vi.fn().mockResolvedValue({ runs: [], nextCursor: null }),
    listPresets: vi.fn().mockResolvedValue({ presets: [] }),
    listExports: vi.fn().mockResolvedValue({ exports: [], nextCursor: null }),
    discardResult: vi.fn(),
    logExport: vi.fn(),
    savePreset: vi.fn(),
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

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

/**
 * T257 — quickstart.md §7 (Raster-Ready Framework) and §10 (Analysis
 * Workspace UI): every category reachable from one Toolbox, the raster
 * entries visibly present but explicitly unavailable except Heatmap, and
 * the panel dockable/resizable/collapsible without losing state.
 */
describe("Analysis Workspace integration (US7 + US10)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      stagedInputLayerIds: ["layer-a"],
      lastError: null,
      activeRunId: null,
      heatmapLayerId: null,
      measurementMode: null,
      measurementDraft: null,
    })
  })

  it("§10.2 every operation category is reachable from the one Toolbox", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    for (const heading of [
      /^buffer$/i,
      /spatial query/i,
      /^measurement$/i,
      /overlay analysis/i,
      /geometry processing/i,
      /spatial statistics/i,
      /raster/i,
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy()
    }
  })

  it("§10.2 every catalogued operation appears in the Toolbox", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    const toolbox = screen.getByRole("navigation", { name: /analysis toolbox/i })

    for (const entry of ANALYSIS_OPERATION_CATALOG) {
      // getAllBy, not getBy: some labels are prefixes of others
      // ("Distance" and "Distance Matrix" are both real entries).
      const matches = within(toolbox).getAllByRole("button", { name: new RegExp(`^${entry.label}`, "i") })
      expect(matches.length, `${entry.label} should appear in the Toolbox`).toBeGreaterThan(0)
    }
  })

  it("§7.1 the Raster category lists all five entries as first-class rows", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    for (const label of ["Heatmap", "Elevation / DEM", "Slope", "Aspect", "Hillshade"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`, "i") })).toBeTruthy()
    }
  })

  it("§7.2 the unimplemented raster tools are visibly distinct and not clickable", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    for (const label of ["Elevation / DEM", "Slope", "Aspect", "Hillshade"]) {
      const button = screen.getByRole("button", { name: new RegExp(`^${label}`, "i") })
      expect(button.hasAttribute("disabled")).toBe(true)
      expect(button.textContent).toMatch(/coming soon/i)
    }
  })

  it("§7.4 Heatmap is the one enabled raster entry and toggles client-side", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    const heatmap = screen.getByRole("button", { name: /^heatmap/i })
    expect(heatmap.hasAttribute("disabled")).toBe(false)
    expect(heatmap.textContent).not.toMatch(/coming soon/i)

    fireEvent.click(heatmap)

    // Renders from the staged layer, and creates no AnalysisRun
    // (research.md Decision 9).
    expect(useAnalysisStore.getState().heatmapLayerId).toBe("layer-a")
    expect(useAnalysisStore.getState().activeRunId).toBeNull()
  })

  it("§7.4 clicking Heatmap again turns it off", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })
    const heatmap = screen.getByRole("button", { name: /^heatmap/i })

    fireEvent.click(heatmap)
    fireEvent.click(screen.getByRole("button", { name: /^heatmap/i }))

    expect(useAnalysisStore.getState().heatmapLayerId).toBeNull()
  })

  it("Heatmap with no layer staged explains itself instead of doing nothing", () => {
    useAnalysisStore.setState({ stagedInputLayerIds: [] })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /^heatmap/i }))

    expect(useAnalysisStore.getState().heatmapLayerId).toBeNull()
    expect(useAnalysisStore.getState().lastError).toMatch(/select a layer/i)
  })

  it("§10.1 the panel docks, resizes, and collapses without losing its configuration", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    // Configure an operation, then move the panel around it.
    fireEvent.click(screen.getByRole("button", { name: /^buffer$/i }))
    expect(useAnalysisStore.getState().selectedOperationType).toBe("buffer")

    fireEvent.change(screen.getByLabelText(/dock position/i), { target: { value: "left" } })
    fireEvent.keyDown(screen.getByRole("separator", { name: /resize analysis panel/i }), { key: "ArrowRight" })
    fireEvent.click(screen.getByRole("button", { name: /collapse analysis panel/i }))
    fireEvent.click(screen.getByRole("button", { name: /^analysis$/i }))

    // The dock/width changes persisted, and the in-progress configuration
    // survived the round trip.
    expect(useAnalysisPanelStore.getState().dockPosition).toBe("left")
    expect(useAnalysisPanelStore.getState().panelWidth).toBe(376)
    expect(useAnalysisStore.getState().selectedOperationType).toBe("buffer")
  })

  it("§10.1 a floating panel still renders its tabs and content", () => {
    useAnalysisPanelStore.setState({ dockPosition: "floating" })
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    expect(screen.getByRole("complementary", { name: /analysis panel/i })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: /analysis toolbox/i })).toBeTruthy()
  })

  it("§10.3-5 selecting an operation opens its form in the same panel", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: /^simplify$/i }))

    expect(screen.getByRole("form", { name: /simplify parameters/i })).toBeTruthy()
  })

  it("§10.2 measurement is armable from the panel as well as the map toolbar", () => {
    render(<AnalysisPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("radio", { name: /measure distance/i }))

    expect(useAnalysisStore.getState().measurementMode).toBe("distance")
  })
})
