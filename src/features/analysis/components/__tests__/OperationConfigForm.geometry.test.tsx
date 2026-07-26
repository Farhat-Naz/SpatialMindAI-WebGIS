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

const useFeaturesMock = vi.fn()
const setToolMock = vi.fn()

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  featureService: { list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }) },
  useFeatures: (layerId: string) => useFeaturesMock(layerId),
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

vi.mock("@/features/database/store/editingStore", () => ({
  useEditingStore: (selector: (state: unknown) => unknown) => selector({ setTool: setToolMock }),
}))

const mockedService = vi.mocked(analysisService)

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function resetStore(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  })
}

/** T195 (US5) — the tolerance slider, split-line trigger, attribute picker, and no-parameter confirm variants. */
describe("OperationConfigForm — Geometry Processing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFeaturesMock.mockReturnValue({ data: undefined })
    resetStore()
    mockedService.runAnalysis.mockResolvedValue({
      run: { id: "r", status: "succeeded", resultLayerId: "result" } as never,
    })
  })

  describe("Simplify", () => {
    it("submits the tolerance typed into the number input", async () => {
      resetStore({ selectedOperationType: "simplify", stagedInputLayerIds: ["l1"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.change(screen.getByLabelText(/^tolerance/i), { target: { value: "0.01" } })
      fireEvent.click(screen.getByRole("button", { name: /run simplify/i }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType: "simplify",
          inputLayerIds: ["l1"],
          parameters: { tolerance: 0.01 },
        }),
      )
    })

    it("exposes the slider and the number input over the same value", () => {
      resetStore({ selectedOperationType: "simplify", stagedInputLayerIds: ["l1"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      const slider = screen.getByRole("slider", { name: /simplify tolerance/i })
      expect(slider).toBeTruthy()

      fireEvent.change(screen.getByLabelText(/^tolerance/i), { target: { value: "0.02" } })
      expect(slider.getAttribute("aria-valuenow")).toBe("0.02")
    })

    it("rejects a non-positive tolerance without calling the service", () => {
      resetStore({ selectedOperationType: "simplify", stagedInputLayerIds: ["l1"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.change(screen.getByLabelText(/^tolerance/i), { target: { value: "0" } })
      fireEvent.click(screen.getByRole("button", { name: /run simplify/i }))

      expect(screen.getByRole("alert").textContent).toMatch(/positive number/i)
      expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    })

    it("rejects submission with no layer staged", () => {
      resetStore({ selectedOperationType: "simplify", stagedInputLayerIds: [] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: /run simplify/i }))

      expect(screen.getByRole("alert").textContent).toMatch(/select a layer/i)
      expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    })
  })

  describe("no-parameter operations", () => {
    const NO_PARAM_OPERATIONS = [
      { operationType: "smoothGeometry", title: "Smooth" },
      { operationType: "repairGeometry", title: "Repair Geometry" },
      { operationType: "multipartToSinglepart", title: "Multipart to Singlepart" },
      { operationType: "singlepartToMultipart", title: "Singlepart to Multipart" },
    ] as const

    it.each(NO_PARAM_OPERATIONS)("$title submits its staged layer with no parameters", async ({ operationType, title }) => {
      resetStore({ selectedOperationType: operationType, stagedInputLayerIds: ["l1"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: new RegExp(`run ${title}`, "i") }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType,
          inputLayerIds: ["l1"],
          parameters: undefined,
        }),
      )
    })

    it.each(NO_PARAM_OPERATIONS)("$title rejects submission with no layer staged", ({ operationType, title }) => {
      resetStore({ selectedOperationType: operationType, stagedInputLayerIds: [] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: new RegExp(`run ${title}`, "i") }))

      expect(screen.getByRole("alert").textContent).toMatch(/select a layer/i)
      expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    })
  })

  describe("Dissolve", () => {
    it("offers the staged layer's own attribute keys as a picker", async () => {
      useFeaturesMock.mockReturnValue({
        data: {
          features: [
            { id: "f1", attributes: [{ key: "zone", value: "R1" }, { key: "owner", value: "A" }] },
            { id: "f2", attributes: [{ key: "zone", value: "R2" }] },
          ],
        },
      })
      resetStore({ selectedOperationType: "dissolve", stagedInputLayerIds: ["l1"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      const picker = screen.getByLabelText(/dissolve by attribute/i) as HTMLSelectElement
      // Sorted and de-duplicated, after the placeholder option.
      expect(Array.from(picker.options).map((option) => option.value)).toEqual(["", "owner", "zone"])

      fireEvent.change(picker, { target: { value: "zone" } })
      fireEvent.click(screen.getByRole("button", { name: /run dissolve/i }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType: "dissolve",
          inputLayerIds: ["l1"],
          parameters: { attributeKey: "zone" },
        }),
      )
    })

    it("falls back to a text input when the layer's attributes are not loaded", async () => {
      useFeaturesMock.mockReturnValue({ data: undefined })
      resetStore({ selectedOperationType: "dissolve", stagedInputLayerIds: ["l1"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.change(screen.getByLabelText(/dissolve by attribute/i), { target: { value: "kind" } })
      fireEvent.click(screen.getByRole("button", { name: /run dissolve/i }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType: "dissolve",
          inputLayerIds: ["l1"],
          parameters: { attributeKey: "kind" },
        }),
      )
    })

    it("requires an attribute to be chosen", () => {
      resetStore({ selectedOperationType: "dissolve", stagedInputLayerIds: ["l1"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: /run dissolve/i }))

      expect(screen.getByRole("alert").textContent).toMatch(/attribute to dissolve by/i)
      expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    })
  })

  describe("Merge", () => {
    it("submits every staged layer, not just the first two", async () => {
      resetStore({ selectedOperationType: "merge", stagedInputLayerIds: ["a", "b", "c"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: /run merge/i }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType: "merge",
          inputLayerIds: ["a", "b", "c"],
          parameters: undefined,
        }),
      )
    })

    it("rejects a merge of fewer than two layers", () => {
      resetStore({ selectedOperationType: "merge", stagedInputLayerIds: ["only-one"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: /run merge/i }))

      expect(screen.getByRole("alert").textContent).toMatch(/at least two layers/i)
      expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    })
  })

  describe("Split", () => {
    it("submits the target layer and the split-line layer in staging order", async () => {
      resetStore({ selectedOperationType: "split", stagedInputLayerIds: ["target", "blade"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: /run split/i }))

      await waitFor(() =>
        expect(mockedService.runAnalysis).toHaveBeenCalledWith("p1", {
          operationType: "split",
          inputLayerIds: ["target", "blade"],
          parameters: undefined,
        }),
      )
    })

    it("the draw trigger puts the map into line-draw mode (T187)", () => {
      resetStore({ selectedOperationType: "split", stagedInputLayerIds: ["target", "blade"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: /draw a split line/i }))

      expect(setToolMock).toHaveBeenCalledWith("draw-line")
      // Drawing must not submit the form.
      expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    })

    it("rejects submission without both layers staged", () => {
      resetStore({ selectedOperationType: "split", stagedInputLayerIds: ["target"] })
      render(<OperationConfigForm projectId="p1" />, { wrapper: createWrapper() })

      fireEvent.click(screen.getByRole("button", { name: /run split/i }))

      expect(screen.getByRole("alert").textContent).toMatch(/stage two layers/i)
      expect(mockedService.runAnalysis).not.toHaveBeenCalled()
    })
  })
})
