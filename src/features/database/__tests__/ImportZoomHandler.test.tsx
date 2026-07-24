import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, waitFor } from "@testing-library/react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import type { Map as LeafletMap } from "leaflet"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ImportZoomHandler } from "../components/MapEditingLayer"
import { featureService } from "../services/featureService"
import { useDatabaseStore } from "../store/databaseStore"
import { useEditingStore } from "../store/editingStore"

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

const feature = {
  id: "f1",
  layerId: "l1",
  geometry: { type: "Point" as const, coordinates: [30, 40] as [number, number] },
  attributes: [],
  style: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

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

describe("ImportZoomHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFeatureService.list.mockResolvedValue({ features: [feature], nextCursor: null })
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

  it("frames the layer's extent once a successful import result arrives", async () => {
    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <ImportZoomHandler />
      </>,
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    useEditingStore.getState().setImportResult({ status: "success", importedCount: 1 })

    await waitFor(() => expect(fitBoundsSpy).toHaveBeenCalledTimes(1))
  })

  it("does not zoom again on an unrelated re-render of the same result", async () => {
    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <ImportZoomHandler />
      </>,
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    useEditingStore.getState().setImportResult({ status: "success", importedCount: 1 })
    await waitFor(() => expect(fitBoundsSpy).toHaveBeenCalledTimes(1))

    // A second, unrelated data refresh with the SAME importResult object must not re-zoom.
    mockedFeatureService.list.mockResolvedValue({ features: [feature], nextCursor: null })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fitBoundsSpy).toHaveBeenCalledTimes(1)
  })

  it("does not zoom on an import error", async () => {
    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <ImportZoomHandler />
      </>,
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    useEditingStore.getState().setImportResult({ status: "error", errorMessage: "Bad file" })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fitBoundsSpy).not.toHaveBeenCalled()
  })
})
