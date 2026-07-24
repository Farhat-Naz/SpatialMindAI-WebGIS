import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AttributeForm } from "../components/AttributeForm"
import { featureService } from "../services/featureService"
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
  geometry: { type: "Point" as const, coordinates: [1, 2] as [number, number] },
  attributes: [{ key: "name", value: "Main St" }],
  style: { color: "#2563eb", strokeWidth: 2, fillOpacity: 0.3 },
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

describe("AttributeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFeatureService.list.mockResolvedValue({ features: [feature], nextCursor: null })
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

  it("renders every attribute currently on the feature", async () => {
    render(<AttributeForm layerId="l1" featureId="f1" />, { wrapper: createWrapper() })

    expect(await screen.findByLabelText("Value for name")).toHaveProperty("value", "Main St")
  })

  it("editing a value updates only that key, leaving geometry/style untouched", async () => {
    mockedFeatureService.update.mockResolvedValue({ feature: { ...feature, attributes: [{ key: "name", value: "Elm St" }] } })
    render(<AttributeForm layerId="l1" featureId="f1" />, { wrapper: createWrapper() })

    const input = await screen.findByLabelText("Value for name")
    fireEvent.change(input, { target: { value: "Elm St" } })

    await waitFor(() =>
      expect(mockedFeatureService.update).toHaveBeenCalledWith("f1", {
        attributes: [{ key: "name", value: "Elm St" }],
      }),
    )
  })

  it("rejects adding a duplicate attribute key without calling the API", async () => {
    render(<AttributeForm layerId="l1" featureId="f1" />, { wrapper: createWrapper() })
    await screen.findByLabelText("Value for name")

    fireEvent.change(screen.getByLabelText("New attribute key"), { target: { value: "name" } })
    fireEvent.change(screen.getByLabelText("New attribute value"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }))

    expect(mockedFeatureService.update).not.toHaveBeenCalled()
    expect(useEditingStore.getState().lastError).toContain("already exists")
  })

  it("adds a new attribute key/value pair", async () => {
    mockedFeatureService.update.mockResolvedValue({
      feature: { ...feature, attributes: [...feature.attributes, { key: "type", value: "residential" }] },
    })
    render(<AttributeForm layerId="l1" featureId="f1" />, { wrapper: createWrapper() })
    await screen.findByLabelText("Value for name")

    fireEvent.change(screen.getByLabelText("New attribute key"), { target: { value: "type" } })
    fireEvent.change(screen.getByLabelText("New attribute value"), { target: { value: "residential" } })
    fireEvent.click(screen.getByRole("button", { name: "Add attribute" }))

    await waitFor(() =>
      expect(mockedFeatureService.update).toHaveBeenCalledWith("f1", {
        attributes: [...feature.attributes, { key: "type", value: "residential" }],
      }),
    )
  })

  it("updates style independently of attributes/geometry", async () => {
    mockedFeatureService.update.mockResolvedValue({
      feature: { ...feature, style: { ...feature.style, color: "#ff0000" } },
    })
    render(<AttributeForm layerId="l1" featureId="f1" />, { wrapper: createWrapper() })
    await screen.findByLabelText("Value for name")

    fireEvent.change(screen.getByLabelText("Feature color"), { target: { value: "#ff0000" } })

    await waitFor(() =>
      expect(mockedFeatureService.update).toHaveBeenCalledWith("f1", {
        style: { color: "#ff0000", strokeWidth: 2, fillOpacity: 0.3 },
      }),
    )
  })
})
