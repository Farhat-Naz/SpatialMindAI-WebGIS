import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MapContainer, TileLayer } from "react-leaflet"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MeasureToolbar } from "../MeasureToolbar"
import { analysisService } from "../../services/analysisService"
import { useAnalysisStore } from "../../store/analysisStore"

vi.mock("../../services/analysisService", () => ({
  analysisService: { saveMeasurement: vi.fn() },
}))

const mockedService = vi.mocked(analysisService)

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <MapContainer center={[0, 0]} zoom={2} className="h-64 w-64">
        <TileLayer url="https://example.test/{z}/{x}/{y}.png" />
        {children}
      </MapContainer>
    </QueryClientProvider>
  )
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
    // The active tool now lives in the store rather than in component
    // state (T245, so the Analysis panel can arm the same tool), which
    // means it survives unmount and must be reset between tests.
    measurementMode: null,
  })
}

describe("MeasureToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it("renders every measurement mode plus a disabled Elevation placeholder (FR-009)", () => {
    render(<MeasureToolbar projectId="p1" />, { wrapper: Wrapper })
    expect(screen.getByRole("radio", { name: "Measure distance" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Measure area" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Measure radius" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Read coordinates" })).toBeTruthy()

    const elevation = screen.getByRole("radio", { name: /elevation/i }) as HTMLButtonElement
    expect(elevation.disabled).toBe(true)
  })

  it("shows no readout until enough points exist for the active mode", () => {
    useAnalysisStore.setState({ measurementDraft: { type: "distance", points: [{ lat: 0, lng: 0 }] } })
    render(<MeasureToolbar projectId="p1" />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole("radio", { name: "Measure distance" }))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("distance mode: shows Distance/Bearing/Azimuth readouts for a 2-point draw", () => {
    // Activate the mode first, then seed the draft under that same mode.
    render(<MeasureToolbar projectId="p1" />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole("radio", { name: "Measure distance" }))
    act(() => {
      useAnalysisStore.setState({
        measurementDraft: { type: "distance", points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }] },
      })
    })

    const status = screen.getByRole("status")
    expect(status.textContent).toMatch(/Distance:/)
    expect(status.textContent).toMatch(/Bearing:/)
    expect(status.textContent).toMatch(/Azimuth:/)
  })

  it("area mode: shows Area/Perimeter readouts for a 3-point draw", () => {
    render(<MeasureToolbar projectId="p1" />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole("radio", { name: "Measure area" }))
    act(() => {
      useAnalysisStore.setState({
        measurementDraft: {
          type: "area",
          points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }, { lat: 0.01, lng: 0.01 }],
        },
      })
    })

    const status = screen.getByRole("status")
    expect(status.textContent).toMatch(/Area:/)
    expect(status.textContent).toMatch(/Perimeter:/)
  })

  it("coordinates mode: shows the formatted lat/lng of the clicked point", () => {
    render(<MeasureToolbar projectId="p1" />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole("radio", { name: "Read coordinates" }))
    act(() => {
      useAnalysisStore.setState({ measurementDraft: { type: "coordinates", points: [{ lat: 12.3456, lng: -7.891 }] } })
    })

    expect(screen.getByRole("status").textContent).toMatch(/12\.3456.*-7\.8910/)
  })

  it("switching modes clears the previous draft", () => {
    useAnalysisStore.setState({
      measurementDraft: { type: "distance", points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }] },
    })
    render(<MeasureToolbar projectId="p1" />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole("radio", { name: "Measure area" }))
    expect(useAnalysisStore.getState().measurementDraft).toBeNull()
  })

  it("Save calls analysisService.saveMeasurement with the recomputed geometry", async () => {
    mockedService.saveMeasurement.mockResolvedValue({
      measurement: {
        id: "m1",
        projectId: "p1",
        userId: "u1",
        measurementType: "distance",
        geometry: { type: "LineString", coordinates: [] },
        value: 111195,
        unit: "meters",
        label: null,
        createdAt: "t",
      },
    })
    render(<MeasureToolbar projectId="p1" />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole("radio", { name: "Measure distance" }))
    act(() => {
      useAnalysisStore.setState({
        measurementDraft: { type: "distance", points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }] },
      })
    })

    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[0])

    await waitFor(() =>
      expect(mockedService.saveMeasurement).toHaveBeenCalledWith("p1", {
        measurementType: "distance",
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
      }),
    )
  })
})
