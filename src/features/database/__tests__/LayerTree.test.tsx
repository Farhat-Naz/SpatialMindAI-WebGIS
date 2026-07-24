import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LayerTree } from "../components/LayerTree"
import { layerService } from "../services/layerService"
import { useDatabaseStore } from "../store/databaseStore"
import { useEditingStore } from "../store/editingStore"

vi.mock("../services/layerService", () => ({
  layerService: {
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
  },
}))

const mockedLayerService = vi.mocked(layerService)

const roads = {
  id: "l1",
  name: "Roads",
  order: 0,
  projectId: "p1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}
const rivers = {
  id: "l2",
  name: "Rivers",
  order: 1,
  projectId: "p1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

describe("LayerTree", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedLayerService.list.mockResolvedValue({ layers: [roads, rivers] })
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

  it("renders layers in persisted order", async () => {
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })

    const items = await screen.findAllByRole("button", { name: /Select layer/ })
    expect(items.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Select layer Roads",
      "Select layer Rivers",
    ])
  })

  it("creates a new layer on Enter", async () => {
    mockedLayerService.create.mockResolvedValue({
      layer: { ...roads, id: "l3", name: "Parks", order: 2 },
    })
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    await screen.findAllByRole("button", { name: /Select layer/ })

    const input = screen.getByLabelText("New layer name")
    fireEvent.change(input, { target: { value: "Parks" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() =>
      expect(mockedLayerService.create).toHaveBeenCalledWith("p1", { name: "Parks" }),
    )
  })

  it("selects a layer on click", async () => {
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    const item = await screen.findByRole("button", { name: "Select layer Roads" })

    fireEvent.click(item)

    expect(useDatabaseStore.getState().selectedLayerId).toBe("l1")
  })

  it("renames a layer", async () => {
    mockedLayerService.rename.mockResolvedValue({ layer: { ...roads, name: "Highways" } })
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    await screen.findAllByRole("button", { name: /Select layer/ })

    const [renameButton] = screen.getAllByRole("button", { name: "Rename layer" })
    fireEvent.click(renameButton)
    const input = screen.getByLabelText("Rename layer Roads")
    fireEvent.change(input, { target: { value: "Highways" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() =>
      expect(mockedLayerService.rename).toHaveBeenCalledWith("l1", { name: "Highways" }),
    )
  })

  it("does not nest the rename input inside a role=button container (invalid ARIA nesting)", async () => {
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    await screen.findAllByRole("button", { name: /Select layer/ })

    const [renameButton] = screen.getAllByRole("button", { name: "Rename layer" })
    fireEvent.click(renameButton)

    expect(screen.queryByRole("button", { name: "Select layer Roads" })).toBeNull()
    expect(screen.getByLabelText("Rename layer Roads")).toBeTruthy()
  })

  it("deletes a layer after confirming", async () => {
    mockedLayerService.remove.mockResolvedValue(undefined)
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    await screen.findAllByRole("button", { name: /Select layer/ })

    const [deleteButton] = screen.getAllByRole("button", { name: "Delete layer" })
    fireEvent.click(deleteButton)
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }))

    await waitFor(() => expect(mockedLayerService.remove).toHaveBeenCalledWith("l1"))
  })

  it("toggles layer lock", async () => {
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    await screen.findAllByRole("button", { name: /Select layer/ })

    const [lockButton] = screen.getAllByRole("button", { name: "Lock layer" })
    fireEvent.click(lockButton)

    expect(useEditingStore.getState().isLayerLocked("l1")).toBe(true)
  })

  it("toggles layer visibility", async () => {
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    await screen.findAllByRole("button", { name: /Select layer/ })

    const [hideButton] = screen.getAllByRole("button", { name: "Hide layer" })
    fireEvent.click(hideButton)

    expect(useEditingStore.getState().getLayerDisplay("l1").visible).toBe(false)
  })

  it("changes layer opacity", async () => {
    render(<LayerTree projectId="p1" />, { wrapper: createWrapper() })
    await screen.findAllByRole("button", { name: /Select layer/ })

    useEditingStore.getState().setLayerOpacity("l1", 0.4)

    expect(useEditingStore.getState().getLayerDisplay("l1").opacity).toBe(0.4)
  })
})
