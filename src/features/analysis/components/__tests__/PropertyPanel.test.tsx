import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PropertyPanel } from "../PropertyPanel"
import { analysisService } from "../../services/analysisService"
import { useAnalysisPanelStore } from "../../store/analysisPanelStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: { getRun: vi.fn() },
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

const RUN = {
  id: "run-1",
  projectId: "p1",
  userId: "analyst-1",
  operationType: "clip",
  status: "succeeded",
  progress: 100,
  parameters: { tolerance: 0.01 },
  inputLayerIds: ["layer-a", "layer-b"],
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
}

/** T223 (US8/US10) — the selected run's full detail. */
describe("PropertyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnalysisPanelStore.setState({ selectedHistoryRunId: null })
    mockedService.getRun.mockResolvedValue({ run: RUN } as never)
  })

  it("prompts for a selection when no run is selected", () => {
    render(<PropertyPanel />, { wrapper: createWrapper() })

    expect(screen.getByText(/select a run from the history list/i)).toBeTruthy()
    expect(mockedService.getRun).not.toHaveBeenCalled()
  })

  it("loads the run named by the panel store", async () => {
    useAnalysisPanelStore.setState({ selectedHistoryRunId: "run-1" })
    render(<PropertyPanel />, { wrapper: createWrapper() })

    await waitFor(() => expect(mockedService.getRun).toHaveBeenCalledWith("run-1"))
  })

  it("shows every field of the run, not a curated subset", async () => {
    useAnalysisPanelStore.setState({ selectedHistoryRunId: "run-1" })
    render(<PropertyPanel />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByLabelText("Run details")).toBeTruthy())

    for (const label of [
      /^operation$/i,
      /^status$/i,
      /^run by$/i,
      /^created$/i,
      /^started$/i,
      /^completed$/i,
      /duration \(ms\)/i,
      /^input layers$/i,
      /^result layer$/i,
      /^parameters$/i,
      /^result data$/i,
      /^error$/i,
      /^batch$/i,
      /^preset$/i,
      /^run id$/i,
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it("renders values readably: arrays joined, objects serialized, nulls as a dash", async () => {
    useAnalysisPanelStore.setState({ selectedHistoryRunId: "run-1" })
    render(<PropertyPanel />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText("clip")).toBeTruthy())
    expect(screen.getByText("layer-a, layer-b")).toBeTruthy()
    expect(screen.getByText('{"tolerance":0.01}')).toBeTruthy()
    // errorMessage, batchId, presetId and cancelRequestedAt are all null here.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4)
  })

  it("shows a failed run's error message", async () => {
    mockedService.getRun.mockResolvedValue({
      run: { ...RUN, status: "failed", errorMessage: "Geometry could not be repaired" },
    } as never)
    useAnalysisPanelStore.setState({ selectedHistoryRunId: "run-1" })
    render(<PropertyPanel />, { wrapper: createWrapper() })

    await waitFor(() => expect(screen.getByText(/geometry could not be repaired/i)).toBeTruthy())
  })
})
