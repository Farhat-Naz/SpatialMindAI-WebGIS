import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ImportExportControls } from "../components/ImportExportControls"
import { featureService } from "../services/featureService"
import { useEditingStore } from "../store/editingStore"

vi.mock("../services/featureService", () => ({
  featureService: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    importFeatureCollection: vi.fn(),
  },
}))

const mockedFeatureService = vi.mocked(featureService)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return Wrapper
}

function geoJsonFile(featureCount: number): File {
  const collection = {
    type: "FeatureCollection",
    features: Array.from({ length: featureCount }, (_, i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [i * 0.001, i * 0.001] },
      properties: {},
    })),
  }
  return new File([JSON.stringify(collection)], "data.geojson", { type: "application/geo+json" })
}

describe("ImportExportControls", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it("renders import and export controls", () => {
    render(<ImportExportControls layerId="l1" layerName="Roads" />, { wrapper: createWrapper() })

    expect(screen.getByRole("button", { name: "Import GeoJSON" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Import Shapefile" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Export layer" })).toBeTruthy()
  })

  it("imports a small GeoJSON file directly, without a confirmation dialog", async () => {
    mockedFeatureService.importFeatureCollection.mockResolvedValue({ importedCount: 3 })
    render(<ImportExportControls layerId="l1" layerName="Roads" />, { wrapper: createWrapper() })

    const input = screen.getByLabelText("Import GeoJSON file")
    fireEvent.change(input, { target: { files: [geoJsonFile(3)] } })

    await waitFor(() =>
      expect(mockedFeatureService.importFeatureCollection).toHaveBeenCalledTimes(1),
    )
    expect(screen.queryByText(/cannot be reversed/)).toBeNull()
  })

  it("requires confirmation for a large import, and does nothing if canceled", async () => {
    render(<ImportExportControls layerId="l1" layerName="Roads" />, { wrapper: createWrapper() })

    const input = screen.getByLabelText("Import GeoJSON file")
    fireEvent.change(input, { target: { files: [geoJsonFile(150)] } })

    await screen.findByText(/cannot be reversed/)
    expect(mockedFeatureService.importFeatureCollection).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(mockedFeatureService.importFeatureCollection).not.toHaveBeenCalled()
  })

  it("proceeds with a large import once confirmed", async () => {
    mockedFeatureService.importFeatureCollection.mockResolvedValue({ importedCount: 150 })
    render(<ImportExportControls layerId="l1" layerName="Roads" />, { wrapper: createWrapper() })

    const input = screen.getByLabelText("Import GeoJSON file")
    fireEvent.change(input, { target: { files: [geoJsonFile(150)] } })

    fireEvent.click(await screen.findByRole("button", { name: "Import" }))

    await waitFor(() =>
      expect(mockedFeatureService.importFeatureCollection).toHaveBeenCalledTimes(1),
    )
  })

  it("rejects a malformed file before any network call", async () => {
    render(<ImportExportControls layerId="l1" layerName="Roads" />, { wrapper: createWrapper() })

    const input = screen.getByLabelText("Import GeoJSON file")
    const badFile = new File(["not json"], "bad.geojson")
    fireEvent.change(input, { target: { files: [badFile] } })

    await screen.findByRole("alert")
    expect(mockedFeatureService.importFeatureCollection).not.toHaveBeenCalled()
  })

  it("shows a loading indicator and disables the import buttons while an import is in flight", async () => {
    let resolveImport!: (value: { importedCount: number }) => void
    mockedFeatureService.importFeatureCollection.mockReturnValue(
      new Promise((resolve) => {
        resolveImport = resolve
      }),
    )
    render(<ImportExportControls layerId="l1" layerName="Roads" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText("Import GeoJSON file"), {
      target: { files: [geoJsonFile(3)] },
    })

    await screen.findByText("Importing…")
    expect((screen.getByRole("button", { name: "Import GeoJSON" }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      (screen.getByRole("button", { name: "Import Shapefile" }) as HTMLButtonElement).disabled,
    ).toBe(true)

    resolveImport({ importedCount: 3 })
    await waitFor(() => expect(screen.queryByText("Importing…")).toBeNull())
  })

  it("disables the export button while an export is in flight", async () => {
    mockedFeatureService.list.mockReturnValue(new Promise(() => {}))
    render(<ImportExportControls layerId="l1" layerName="Roads" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole("button", { name: "Export layer" }))

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Export layer" }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    )
  })
})
