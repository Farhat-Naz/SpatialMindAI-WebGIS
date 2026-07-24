import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import type { Map as LeafletMap } from "leaflet"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FeatureLayer } from "../components/FeatureLayer"
import { SelectionActions } from "../components/SelectionActions"
import { SelectionBox } from "../components/SelectionBox"
import { featureService } from "../services/featureService"
import { useDatabaseStore } from "../store/databaseStore"
import { useEditingStore } from "../store/editingStore"
import type { Feature } from "@/shared/contracts/feature.schema"

vi.mock("../services/featureService", () => ({
  featureService: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const mockedFeatureService = vi.mocked(featureService)

function square(id: string, offset: number): Feature {
  const p = (dx: number, dy: number): [number, number] => [offset + dx, offset + dy]
  return {
    id,
    layerId: "l1",
    geometry: {
      type: "Polygon",
      coordinates: [[p(0, 0), p(1, 0), p(1, 1), p(0, 1), p(0, 0)]],
    },
    attributes: [],
    style: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const squareA = square("f1", 0)
const squareB = square("f2", 10)

function MapRefCapture({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MapContainer center={[0, 0]} zoom={2} className="h-64 w-64">
          <TileLayer url="https://example.test/{z}/{x}/{y}.png" />
          {children}
        </MapContainer>
      </QueryClientProvider>
    )
  }
  return Wrapper
}

describe("Multi-select and bulk actions (US5)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFeatureService.list.mockResolvedValue({
      features: [squareA, squareB],
      nextCursor: null,
    })
    useDatabaseStore.setState({
      selectedProjectId: null,
      selectedLayerId: "l1",
      selectedFeatureId: null,
      selectedFeatureIds: [],
    })
    useEditingStore.setState({
      tool: null,
      draftGeometry: null,
      targetLayerId: null,
      targetFeatureId: null,
      undoSnapshot: null,
      measurementResult: null,
      importResult: null,
      lockedLayerIds: new Set(),
      layerDisplay: {},
      clipboard: null,
      lastError: null,
      contextMenuTarget: null,
    })
  })

  it("shift-click adds a second feature to the multi-selection without deselecting the first", async () => {
    render(<FeatureLayer layerId="l1" />, { wrapper: createWrapper() })

    const paths = await waitFor(() => {
      const overlayPane = document.querySelector(".leaflet-overlay-pane")
      const elements = overlayPane?.querySelectorAll("path") ?? []
      expect(elements.length).toBeGreaterThanOrEqual(2)
      return elements
    })

    fireEvent.click(paths[0])
    expect(useDatabaseStore.getState().selectedFeatureIds).toEqual(["f1"])

    fireEvent.click(paths[1], { shiftKey: true })
    expect(useDatabaseStore.getState().selectedFeatureIds).toEqual(["f1", "f2"])
  })

  it("box-select (Shift+drag) selects every feature intersecting the drawn box", async () => {
    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <FeatureLayer layerId="l1" />
        <SelectionBox layerId="l1" />
      </>,
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(capturedMap).not.toBeNull())
    await waitFor(() => {
      const overlayPane = document.querySelector(".leaflet-overlay-pane")
      expect(overlayPane?.querySelectorAll("path").length ?? 0).toBeGreaterThanOrEqual(2)
    })
    const map = capturedMap as unknown as LeafletMap

    map.fire("mousedown", {
      latlng: { lat: -1, lng: -1 },
      originalEvent: { shiftKey: true },
    })
    map.fire("mousemove", { latlng: { lat: 2, lng: 2 } })
    map.fire("mouseup", {})

    await waitFor(() =>
      expect(useDatabaseStore.getState().selectedFeatureIds).toEqual(["f1"]),
    )
  })

  it("deletes exactly the multi-selected set and nothing else", async () => {
    mockedFeatureService.remove.mockResolvedValue(undefined)
    useDatabaseStore.setState({ selectedFeatureIds: ["f1", "f2"], selectedFeatureId: "f2" })

    render(<SelectionActions />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Delete selected features" }))

    await waitFor(() => {
      expect(mockedFeatureService.remove).toHaveBeenCalledWith("f1")
      expect(mockedFeatureService.remove).toHaveBeenCalledWith("f2")
    })
    expect(mockedFeatureService.remove).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(useDatabaseStore.getState().selectedFeatureIds).toEqual([]))
  })
})
