import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts"
import { useFeatures } from "../hooks/useFeatures"
import { featureService } from "../services/featureService"
import { useDatabaseStore } from "../store/databaseStore"
import { useEditingStore } from "../store/editingStore"

function useTestHarness() {
  useKeyboardShortcuts()
  return useFeatures("l1")
}

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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function dispatchKey(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFeatureService.list.mockResolvedValue({ features: [feature], nextCursor: null })
    useDatabaseStore.setState({
      selectedProjectId: null,
      selectedLayerId: "l1",
      selectedFeatureId: "f1",
      selectedFeatureIds: ["f1"],
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
    document.body.innerHTML = ""
  })

  it("ignores every shortcut while a text input is focused", async () => {
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    renderHook(() => useKeyboardShortcuts(), { wrapper: createWrapper() })

    dispatchKey({ key: "Delete" })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockedFeatureService.remove).not.toHaveBeenCalled()
  })

  it("deletes the single selected feature on Delete", async () => {
    mockedFeatureService.remove.mockResolvedValue(undefined)
    renderHook(() => useKeyboardShortcuts(), { wrapper: createWrapper() })

    dispatchKey({ key: "Delete" })

    await waitFor(() => expect(mockedFeatureService.remove).toHaveBeenCalledWith("f1"))
  })

  it("bulk-deletes every selected feature on Delete when more than one is selected", async () => {
    useDatabaseStore.setState({ selectedFeatureIds: ["f1", "f2"] })
    mockedFeatureService.remove.mockResolvedValue(undefined)
    renderHook(() => useKeyboardShortcuts(), { wrapper: createWrapper() })

    dispatchKey({ key: "Delete" })

    await waitFor(() => {
      expect(mockedFeatureService.remove).toHaveBeenCalledWith("f1")
      expect(mockedFeatureService.remove).toHaveBeenCalledWith("f2")
    })
  })

  it("cancels the active tool on Escape when no context menu is open", () => {
    useEditingStore.getState().setTool("draw-point")
    renderHook(() => useKeyboardShortcuts(), { wrapper: createWrapper() })

    dispatchKey({ key: "Escape" })

    expect(useEditingStore.getState().tool).toBeNull()
  })

  it("dismisses an open context menu on Escape, without touching the active tool", () => {
    useEditingStore.getState().setTool("draw-point")
    useEditingStore.getState().setContextMenuTarget({ kind: "feature", id: "f1", clientX: 0, clientY: 0 })
    renderHook(() => useKeyboardShortcuts(), { wrapper: createWrapper() })

    dispatchKey({ key: "Escape" })

    expect(useEditingStore.getState().contextMenuTarget).toBeNull()
    expect(useEditingStore.getState().tool).toBe("draw-point")
  })

  it("undoes the last edit on Ctrl+Z", async () => {
    mockedFeatureService.update.mockResolvedValue({ feature })
    useEditingStore.getState().setUndoSnapshot({
      kind: "geometry",
      featureId: "f1",
      previousValue: { type: "Point", coordinates: [9, 9] },
    })
    renderHook(() => useKeyboardShortcuts(), { wrapper: createWrapper() })

    dispatchKey({ key: "z", ctrlKey: true })

    await waitFor(() =>
      expect(mockedFeatureService.update).toHaveBeenCalledWith("f1", {
        geometry: { type: "Point", coordinates: [9, 9] },
      }),
    )
  })

  it("copies the selected feature into the clipboard on Ctrl+C", async () => {
    const { result } = renderHook(() => useTestHarness(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.data).toBeDefined())

    dispatchKey({ key: "c", ctrlKey: true })

    await waitFor(() =>
      expect(useEditingStore.getState().clipboard?.geometry).toEqual(feature.geometry),
    )
  })

  it("pastes the clipboard's feature on Ctrl+V", async () => {
    mockedFeatureService.create.mockResolvedValue({ feature })
    useEditingStore.getState().copyFeature({
      geometry: { type: "Point", coordinates: [5, 5] },
      attributes: [],
      style: null,
    })
    renderHook(() => useKeyboardShortcuts(), { wrapper: createWrapper() })

    dispatchKey({ key: "v", ctrlKey: true })

    await waitFor(() =>
      expect(mockedFeatureService.create).toHaveBeenCalledWith("l1", {
        geometry: { type: "Point", coordinates: [5, 5] },
        attributes: [],
        style: undefined,
      }),
    )
  })
})
