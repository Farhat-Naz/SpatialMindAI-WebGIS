import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ResultPanel } from "../ResultPanel"
import { analysisService } from "../../services/analysisService"
import * as exportServiceModule from "../../services/exportService"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: {
    getRun: vi.fn(),
    discardResult: vi.fn(),
    logExport: vi.fn(),
    listExports: vi.fn(),
  },
}))

const useFeaturesMock = vi.fn()

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  useFeatures: (layerId: string) => useFeaturesMock(layerId),
  featureService: { list: vi.fn() },
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

const RUN = {
  id: "run-1",
  projectId: "p1",
  userId: "u1",
  operationType: "buffer",
  status: "succeeded",
  progress: 100,
  parameters: {},
  inputLayerIds: ["layer-a"],
  resultLayerId: "result-layer",
  resultData: null,
  errorMessage: null,
  batchId: null,
  presetId: null,
  startedAt: "t",
  completedAt: "t",
  executionTimeMs: 5,
  cancelRequestedAt: null,
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "t",
}

function featurePage(count: number) {
  return { features: Array.from({ length: count }, (_, index) => ({ id: `f${index}`, attributes: [] })) }
}

/** T235 (US9) — the export format selector, progress announcement, oversized warning, and history list. */
describe("ResultPanel — export", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    mockedService.getRun.mockResolvedValue({ run: RUN } as never)
    mockedService.logExport.mockResolvedValue({ exportJob: {} } as never)
    mockedService.listExports.mockResolvedValue({ exports: [], nextCursor: null } as never)
    useFeaturesMock.mockReturnValue({ data: featurePage(3) })
    useAnalysisStore.setState({ activeRunId: "run-1", lastError: null })
  })

  it("offers all four formats in a keyboard-operable select", async () => {
    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    const select = (await screen.findByLabelText(/export format/i)) as HTMLSelectElement
    expect(select.tagName).toBe("SELECT")
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "geojson",
      "shapefile",
      "csv",
      "kml",
    ])
  })

  it("exports in the chosen format", async () => {
    const spy = vi
      .spyOn(exportServiceModule, "exportAnalysisResult")
      .mockResolvedValue({ blob: new Blob(["x"]), featureCount: 3 })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.change(await screen.findByLabelText(/export format/i), { target: { value: "kml" } })
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }))

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ resultLayerId: "result-layer" }), "kml", expect.any(Function)),
    )
  })

  it("announces progress through an aria-live region", async () => {
    vi.spyOn(exportServiceModule, "exportAnalysisResult").mockImplementation(async (_run, _format, onProgress) => {
      onProgress?.(2, 5)
      // Held open so the in-progress message is observable.
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { blob: new Blob(["x"]), featureCount: 3 }
    })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.click(await screen.findByRole("button", { name: /^export$/i }))

    const live = await screen.findByText(/2 of 5 pages loaded/i)
    expect(live.getAttribute("aria-live")).toBe("polite")
  })

  it("disables the export button while an export is running", async () => {
    vi.spyOn(exportServiceModule, "exportAnalysisResult").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { blob: new Blob(["x"]), featureCount: 3 }
    })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.click(await screen.findByRole("button", { name: /^export$/i }))

    await waitFor(() => expect(screen.getByRole("button", { name: /exporting/i }).hasAttribute("disabled")).toBe(true))
  })

  it("surfaces a failed export rather than failing silently", async () => {
    vi.spyOn(exportServiceModule, "exportAnalysisResult").mockRejectedValue(new Error("browser memory limit"))

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })
    fireEvent.click(await screen.findByRole("button", { name: /^export$/i }))

    await waitFor(() => expect(useAnalysisStore.getState().lastError).toBe("browser memory limit"))
  })

  it("warns before a very large export without blocking it (T232)", async () => {
    useFeaturesMock.mockReturnValue({ data: featurePage(0) })
    // The threshold is read from the service so the two cannot drift.
    const large = { features: Array.from({ length: exportServiceModule.LARGE_EXPORT_FEATURE_THRESHOLD }, () => ({ id: "f", attributes: [] })) }
    useFeaturesMock.mockReturnValue({ data: large })

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    const warning = await screen.findByText(/may take a while/i)
    expect(warning.textContent).toMatch(/will not be truncated/i)
    // Warning only - the action stays available.
    expect(screen.getByRole("button", { name: /^export$/i }).hasAttribute("disabled")).toBe(false)
  })

  it("does not warn for an ordinary-sized result", async () => {
    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await screen.findByLabelText(/export format/i)
    expect(screen.queryByText(/may take a while/i)).toBeNull()
  })

  it("lists past exports with format, feature count, and status (T234)", async () => {
    mockedService.listExports.mockResolvedValue({
      exports: [
        {
          id: "e1",
          format: "geojson",
          status: "succeeded",
          featureCount: 42,
          createdAt: "2026-07-01T10:00:00.000Z",
        },
        { id: "e2", format: "csv", status: "failed", featureCount: null, createdAt: "2026-07-01T11:00:00.000Z" },
      ],
      nextCursor: null,
    } as never)

    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/export history/i)).toBeTruthy())
    expect(screen.getByText("geojson")).toBeTruthy()
    expect(screen.getByText("42 features")).toBeTruthy()
    expect(screen.getByText("failed")).toBeTruthy()
  })

  it("omits the export history section when there is none", async () => {
    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    await screen.findByLabelText(/export format/i)
    expect(screen.queryByText(/export history/i)).toBeNull()
  })
})
