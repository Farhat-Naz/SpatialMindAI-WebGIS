import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MapContainer, TileLayer } from "react-leaflet"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DrawingToolbar } from "../components/DrawingToolbar"
import { useDatabaseStore } from "../store/databaseStore"
import { useEditingStore } from "../store/editingStore"

vi.mock("../services/featureService", () => ({
  featureService: {
    list: vi.fn().mockResolvedValue({ features: [], nextCursor: null }),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

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

describe("DrawingToolbar", () => {
  beforeEach(() => {
    useDatabaseStore.setState({
      selectedProjectId: null,
      selectedLayerId: "layer-1",
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

  it("renders a tool button for every supported drawing shape", () => {
    render(<DrawingToolbar />, { wrapper: createWrapper() })

    expect(screen.getByRole("radio", { name: "Draw point" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Draw line" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Draw polygon" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Draw rectangle" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Draw circle" })).toBeTruthy()
  })

  it("disables drawing tools when no layer is selected", () => {
    useDatabaseStore.setState({ selectedLayerId: null })
    render(<DrawingToolbar />, { wrapper: createWrapper() })

    const button = screen.getByRole("radio", { name: "Draw point" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("disables drawing tools when the selected layer is locked", () => {
    useEditingStore.getState().lockLayer("layer-1")
    render(<DrawingToolbar />, { wrapper: createWrapper() })

    const button = screen.getByRole("radio", { name: "Draw point" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("disables the delete button when no feature is selected", () => {
    render(<DrawingToolbar />, { wrapper: createWrapper() })
    const button = screen.getByRole("button", { name: "Delete selected feature" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("disables the undo button when there is nothing to undo", () => {
    render(<DrawingToolbar />, { wrapper: createWrapper() })
    const button = screen.getByRole("button", { name: "Undo last edit" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("enables the undo button once an undo snapshot exists", () => {
    useEditingStore.getState().setUndoSnapshot({
      kind: "geometry",
      featureId: "f1",
      previousValue: { type: "Point", coordinates: [1, 2] },
    })
    render(<DrawingToolbar />, { wrapper: createWrapper() })
    const button = screen.getByRole("button", { name: "Undo last edit" }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})
