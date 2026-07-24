import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MapContainer, TileLayer } from "react-leaflet"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FeatureContextMenu } from "../components/FeatureContextMenu"
import { LayerContextMenu } from "../components/LayerContextMenu"
import { featureService } from "../services/featureService"
import { layerService } from "../services/layerService"
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

const feature = {
  id: "f1",
  layerId: "l1",
  geometry: { type: "Point" as const, coordinates: [1, 2] as [number, number] },
  attributes: [],
  style: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
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

describe("FeatureContextMenu", () => {
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

  it("opens with the expected actions when a feature is right-clicked", async () => {
    render(<FeatureContextMenu layerId="l1" />, { wrapper: createWrapper() })

    useEditingStore.getState().setContextMenuTarget({ kind: "feature", id: "f1", clientX: 10, clientY: 10 })

    expect(await screen.findByRole("menuitem", { name: "Copy" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Zoom to feature" })).toBeTruthy()
  })

  it("deletes the target feature when Delete is chosen", async () => {
    mockedFeatureService.remove.mockResolvedValue(undefined)
    render(<FeatureContextMenu layerId="l1" />, { wrapper: createWrapper() })
    useEditingStore.getState().setContextMenuTarget({ kind: "feature", id: "f1", clientX: 10, clientY: 10 })

    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }))

    await waitFor(() => expect(mockedFeatureService.remove).toHaveBeenCalledWith("f1"))
  })

  it("dismisses with no side effects on Escape", async () => {
    render(<FeatureContextMenu layerId="l1" />, { wrapper: createWrapper() })
    useEditingStore.getState().setContextMenuTarget({ kind: "feature", id: "f1", clientX: 10, clientY: 10 })
    await screen.findByRole("menuitem", { name: "Copy" })

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

    await waitFor(() => expect(useEditingStore.getState().contextMenuTarget).toBeNull())
    expect(mockedFeatureService.remove).not.toHaveBeenCalled()
  })
})

describe("LayerContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedLayerService.list.mockResolvedValue({ layers: [] })
    mockedFeatureService.list.mockResolvedValue({ features: [feature], nextCursor: null })
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

  it("opens with the expected actions when a Layer Tree row is right-clicked", async () => {
    render(<LayerContextMenu />, { wrapper: createWrapper() })

    useEditingStore.getState().setContextMenuTarget({ kind: "layer", id: "l1", clientX: 10, clientY: 10 })

    expect(await screen.findByRole("menuitem", { name: "Select layer" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Zoom to layer" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Lock layer" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy()
  })

  it("toggles the lock state when Lock layer is chosen", async () => {
    render(<LayerContextMenu />, { wrapper: createWrapper() })
    useEditingStore.getState().setContextMenuTarget({ kind: "layer", id: "l1", clientX: 10, clientY: 10 })

    fireEvent.click(await screen.findByRole("menuitem", { name: "Lock layer" }))

    expect(useEditingStore.getState().isLayerLocked("l1")).toBe(true)
  })

  it("dismisses with no side effects on Escape", async () => {
    render(<LayerContextMenu />, { wrapper: createWrapper() })
    useEditingStore.getState().setContextMenuTarget({ kind: "layer", id: "l1", clientX: 10, clientY: 10 })
    await screen.findByRole("menuitem", { name: "Select layer" })

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })

    await waitFor(() => expect(useEditingStore.getState().contextMenuTarget).toBeNull())
    expect(useEditingStore.getState().isLayerLocked("l1")).toBe(false)
  })

  it("deletes the target layer, not a stale/empty id, when Delete is confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    mockedLayerService.remove.mockResolvedValue(undefined)
    useDatabaseStore.setState({ selectedProjectId: "p1" })
    render(<LayerContextMenu />, { wrapper: createWrapper() })
    useEditingStore.getState().setContextMenuTarget({ kind: "layer", id: "l1", clientX: 10, clientY: 10 })

    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }))

    await waitFor(() => expect(mockedLayerService.remove).toHaveBeenCalledWith("l1"))
  })

  it("renames the target layer, not a stale/empty id, when Rename is confirmed", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Highways")
    mockedLayerService.rename.mockResolvedValue({
      layer: {
        id: "l1",
        name: "Highways",
        order: 0,
        projectId: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    })
    useDatabaseStore.setState({ selectedProjectId: "p1" })
    render(<LayerContextMenu />, { wrapper: createWrapper() })
    useEditingStore.getState().setContextMenuTarget({ kind: "layer", id: "l1", clientX: 10, clientY: 10 })

    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }))

    await waitFor(() =>
      expect(mockedLayerService.rename).toHaveBeenCalledWith("l1", { name: "Highways" }),
    )
  })
})
