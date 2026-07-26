import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ResultPanel } from "../components/ResultPanel"
import { analysisService } from "../services/analysisService"
import { exportAnalysisResult } from "../services/exportService"
import { useAnalysisStore } from "../store/analysisStore"

vi.mock("../services/analysisService", () => ({
  analysisService: {
    getRun: vi.fn(),
    discardResult: vi.fn(),
    logExport: vi.fn(),
    listExports: vi.fn(),
  },
}))

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))
const useFeaturesMock = vi.fn()

vi.mock("@/features/database", () => ({
  queryKeys: { layers: (projectId: string) => ["projects", projectId, "layers"] },
  useFeatures: (layerId: string) => useFeaturesMock(layerId),
  featureService: { list: listMock },
}))
vi.mock("@/features/database/services/featureService", () => ({ featureService: { list: listMock } }))

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

const FIXTURE_FEATURES = [
  {
    id: "f1",
    geometry: { type: "Point", coordinates: [1, 2] },
    attributes: [{ key: "name", value: "Depot" }],
  },
  {
    id: "f2",
    geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
    attributes: [{ key: "name", value: "Yard" }],
  },
]

/**
 * T237 — quickstart.md §9 end to end: export a completed run's result in
 * each of the four formats and see the attempt recorded in history.
 *
 * SC-008 (each file opens correctly in an external tool such as QGIS) is a
 * documented **manual** verification step, not automated here: asserting a
 * file's bytes is not the same as asserting a third-party GIS accepts it,
 * and pretending otherwise would give false confidence. The structural
 * assertions in exportService.test.ts are the automated half; opening the
 * four downloads in QGIS is the manual half.
 */
describe("Export integration (US9)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listMock.mockResolvedValue({ features: FIXTURE_FEATURES, nextCursor: null })
    mockedService.getRun.mockResolvedValue({ run: RUN } as never)
    mockedService.logExport.mockResolvedValue({ exportJob: {} } as never)
    mockedService.listExports.mockResolvedValue({ exports: [], nextCursor: null } as never)
    useFeaturesMock.mockReturnValue({ data: { features: FIXTURE_FEATURES } })
    useAnalysisStore.setState({ activeRunId: "run-1", lastError: null })
  })

  it("§9.1 GeoJSON: a valid FeatureCollection carrying the result's attributes", async () => {
    const { blob, featureCount } = await exportAnalysisResult(RUN, "geojson")
    const parsed = JSON.parse(await blob.text())

    expect(parsed.type).toBe("FeatureCollection")
    expect(parsed.features.map((f: { properties: Record<string, string> }) => f.properties.name)).toEqual([
      "Depot",
      "Yard",
    ])
    expect(featureCount).toBe(2)
  })

  it("§9.3 CSV: one row per feature with attribute columns", async () => {
    const { blob } = await exportAnalysisResult(RUN, "csv")
    const [header, ...rows] = (await blob.text()).split("\r\n")

    expect(header).toBe("name,geometry")
    expect(rows).toHaveLength(2)
    expect(rows[0].startsWith("Depot,")).toBe(true)
  })

  it("§9.4 KML: a Document with one Placemark per feature", async () => {
    const { blob } = await exportAnalysisResult(RUN, "kml")
    const text = await blob.text()

    expect(text).toContain("<Document>")
    expect(text.match(/<Placemark>/g)).toHaveLength(2)
    expect(text).toContain("<name>Depot</name>")
  })

  it("§9.2 Shapefile: a zip archive containing the standard component files", async () => {
    const { blob, featureCount } = await exportAnalysisResult(RUN, "shapefile")

    expect(blob.size).toBeGreaterThan(0)
    expect(featureCount).toBe(2)

    // A zip's local file header magic is "PK\x03\x04" - asserted on the
    // bytes rather than trusting the writer's declared MIME type.
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 4)
    expect(Array.from(head)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it("every export attempt is logged with its format and size (T233)", async () => {
    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.change(await screen.findByLabelText(/export format/i), { target: { value: "csv" } })
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }))

    await waitFor(() =>
      expect(mockedService.logExport).toHaveBeenCalledWith("p1", {
        sourceAnalysisRunId: "run-1",
        format: "csv",
        status: "succeeded",
        featureCount: 2,
      }),
    )
  })

  it("a failed export is logged too, so history never hides an attempt (T233)", async () => {
    listMock.mockRejectedValue(new Error("network died mid-export"))
    render(<ResultPanel projectId="p1" />, { wrapper: createWrapper() })

    fireEvent.click(await screen.findByRole("button", { name: /^export$/i }))

    await waitFor(() =>
      expect(mockedService.logExport).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ format: "geojson", status: "failed" }),
      ),
    )
  })

  it("§9.5 a statistics run with no result layer still exports its payload", async () => {
    const statisticsRun = { resultLayerId: null, resultData: { featureCount: 7, totalAreaSquareMeters: 1000 } }

    const { blob } = await exportAnalysisResult(statisticsRun, "geojson")

    expect(JSON.parse(await blob.text())).toEqual({ featureCount: 7, totalAreaSquareMeters: 1000 })
    // No layer means no feature paging at all.
    expect(listMock).not.toHaveBeenCalled()
  })
})
