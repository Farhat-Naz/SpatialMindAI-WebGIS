import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import type { Map as LeafletMap } from "leaflet"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FeatureContextMenu } from "../components/FeatureContextMenu"
import { LayerContextMenu } from "../components/LayerContextMenu"
import { FitToDataButton } from "../components/FitToDataButton"
import { featureService } from "../services/featureService"
import { layerService } from "../services/layerService"
import { queryKeys } from "../services/queryKeys"
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

vi.mock("../services/layerService", () => ({
  layerService: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
  },
}))

const mockedFeatureService = vi.mocked(featureService)
const mockedLayerService = vi.mocked(layerService)

function point(id: string, lng: number, lat: number, layerId = "l1") {
  return {
    id,
    layerId,
    geometry: { type: "Point" as const, coordinates: [lng, lat] as [number, number] },
    attributes: [],
    style: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function MapRefCapture({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => {
    onReady(map)
  }, [map, onReady])
  return null
}

function createWrapper(queryClient: QueryClient) {
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

describe("Map navigation: zoom-to-feature / zoom-to-layer / fit-to-data", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDatabaseStore.setState({
      selectedProjectId: "p1",
      selectedLayerId: null,
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

  it("zoom-to-feature frames just that feature's position", async () => {
    const feature = point("f1", 10, 20)
    mockedFeatureService.list.mockResolvedValue({ features: [feature], nextCursor: null })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <FeatureContextMenu layerId="l1" />
      </>,
      { wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    useEditingStore.getState().setContextMenuTarget({ kind: "feature", id: "f1", clientX: 0, clientY: 0 })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Zoom to feature" }))

    await waitFor(() => expect(fitBoundsSpy).toHaveBeenCalledWith([[20, 10], [20, 10]]))
  })

  it("zoom-to-layer frames every feature in that one layer", async () => {
    const a = point("f1", 0, 0)
    const b = point("f2", 5, 5)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    // Pre-populate the cache directly (rather than relying on the mocked
    // service's async resolution) so the menu action's data dependency is
    // satisfied from the very first render — clicking a Radix menu item
    // closes the menu and detaches it, so a retry-until-loaded strategy
    // isn't available here the way it is for a persistent button.
    queryClient.setQueryData(queryKeys.features("l1"), { features: [a, b], nextCursor: null })

    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <LayerContextMenu />
      </>,
      { wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    useEditingStore.getState().setContextMenuTarget({ kind: "layer", id: "l1", clientX: 0, clientY: 0 })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Zoom to layer" }))

    await waitFor(() => expect(fitBoundsSpy).toHaveBeenCalledWith([[0, 0], [5, 5]]))
  })

  it("zoom-to-layer shows a clear message instead of moving the view when the layer has no features", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(queryKeys.features("l1"), { features: [], nextCursor: null })

    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <LayerContextMenu />
      </>,
      { wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    useEditingStore.getState().setContextMenuTarget({ kind: "layer", id: "l1", clientX: 0, clientY: 0 })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Zoom to layer" }))

    await waitFor(() => expect(useEditingStore.getState().lastError).toBeTruthy())
    expect(fitBoundsSpy).not.toHaveBeenCalled()
  })

  it("fit-to-data frames the combined extent of every visible layer", async () => {
    mockedLayerService.list.mockResolvedValue({
      layers: [
        { id: "l1", name: "Roads", order: 0, projectId: "p1", createdAt: "", updatedAt: "" },
        { id: "l2", name: "Rivers", order: 1, projectId: "p1", createdAt: "", updatedAt: "" },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(queryKeys.features("l1"), {
      features: [point("f1", 0, 0, "l1")],
      nextCursor: null,
    })
    queryClient.setQueryData(queryKeys.features("l2"), {
      features: [point("f2", 8, 8, "l2")],
      nextCursor: null,
    })

    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <FitToDataButton />
      </>,
      { wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    fireEvent.click(await screen.findByRole("button", { name: "Fit to data" }))

    expect(fitBoundsSpy).toHaveBeenCalledWith([[0, 0], [8, 8]])
  })

  it("fit-to-data excludes hidden layers from the combined extent", async () => {
    mockedLayerService.list.mockResolvedValue({
      layers: [
        { id: "l1", name: "Roads", order: 0, projectId: "p1", createdAt: "", updatedAt: "" },
        { id: "l2", name: "Rivers", order: 1, projectId: "p1", createdAt: "", updatedAt: "" },
      ],
    })
    useEditingStore.getState().setLayerVisibility("l2", false)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(queryKeys.features("l1"), {
      features: [point("f1", 1, 1, "l1")],
      nextCursor: null,
    })
    queryClient.setQueryData(queryKeys.features("l2"), {
      features: [point("f2", 50, 50, "l2")],
      nextCursor: null,
    })

    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <FitToDataButton />
      </>,
      { wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    fireEvent.click(await screen.findByRole("button", { name: "Fit to data" }))

    expect(fitBoundsSpy).toHaveBeenCalledWith([[1, 1], [1, 1]])
  })

  it("fit-to-data leaves the view unchanged and explains why when nothing is visible", async () => {
    mockedLayerService.list.mockResolvedValue({ layers: [] })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    let capturedMap: LeafletMap | null = null
    render(
      <>
        <MapRefCapture onReady={(map) => (capturedMap = map)} />
        <FitToDataButton />
      </>,
      { wrapper: createWrapper(queryClient) },
    )
    await waitFor(() => expect(capturedMap).not.toBeNull())
    const map = capturedMap as unknown as LeafletMap
    const fitBoundsSpy = vi.spyOn(map, "fitBounds")

    fireEvent.click(screen.getByRole("button", { name: "Fit to data" }))

    expect(fitBoundsSpy).not.toHaveBeenCalled()
    expect(useEditingStore.getState().lastError).toBeTruthy()
  })
})
