import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { analysisService } from "@/features/analysis/services/analysisService"
import { featureService } from "@/features/database/services/featureService"
import * as download from "../../services/downloadBlob"
import type { ExportSource } from "../../types/importExport.types"
import { useExport } from "../useExport"

/**
 * `useExport` tests (specs/005-import-export, T099).
 *
 * The both-outcomes logging assertions are the important ones: FR-043 requires
 * history to record failed attempts too, and a user whose export failed needs it
 * there most of all.
 */

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const layerSource: ExportSource = { kind: "layer", layerId: "layer-1", layerName: "Parcels" }

let logExport: ReturnType<typeof vi.spyOn>
let downloadSpy: ReturnType<typeof vi.spyOn>
let list: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logExport = vi.spyOn(analysisService, "logExport").mockResolvedValue({} as never)
  downloadSpy = vi.spyOn(download, "downloadBlob").mockImplementation(() => undefined)
  list = vi.spyOn(featureService, "list").mockResolvedValue({
    features: [
      { id: "f1", geometry: { type: "Point", coordinates: [1, 1] }, attributes: [{ key: "a", value: "1" }] },
    ],
    nextCursor: null,
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useExport", () => {
  it("writes the file, downloads it, and logs success", async () => {
    const { result } = renderHook(() => useExport("proj-1"), { wrapper: wrapper() })

    const outcome = await result.current.mutateAsync({
      source: layerSource,
      format: "geojson",
      scope: "layer",
    })

    expect(outcome.featureCount).toBe(1)
    expect(outcome.filename).toBe("Parcels.geojson")
    expect(downloadSpy).toHaveBeenCalledWith(expect.any(Blob), "Parcels.geojson")
    expect(logExport).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ format: "geojson", scope: "layer", status: "succeeded", featureCount: 1 }),
    )
  })

  it("logs a failed attempt and rethrows (FR-043)", async () => {
    list.mockRejectedValue(new Error("network down"))
    const { result } = renderHook(() => useExport("proj-1"), { wrapper: wrapper() })

    await expect(
      result.current.mutateAsync({ source: layerSource, format: "geojson", scope: "layer" }),
    ).rejects.toThrow(/network down/)

    // History must not silently omit failures.
    expect(logExport).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ status: "failed", errorMessage: "network down" }),
    )
    expect(downloadSpy).not.toHaveBeenCalled()
  })

  it("refuses an empty scope with no file at all (FR-042)", async () => {
    list.mockResolvedValue({ features: [], nextCursor: null } as never)
    const { result } = renderHook(() => useExport("proj-1"), { wrapper: wrapper() })

    await expect(
      result.current.mutateAsync({ source: layerSource, format: "csv", scope: "layer" }),
    ).rejects.toThrow(/nothing to export/i)

    // An empty CSV or shapefile looks like a successful export of nothing, which
    // is worse than being told.
    expect(downloadSpy).not.toHaveBeenCalled()
    expect(logExport).toHaveBeenCalledWith("proj-1", expect.objectContaining({ status: "failed" }))
  })

  it("records the output CRS on the log entry (FR-041)", async () => {
    const { result } = renderHook(() => useExport("proj-1"), { wrapper: wrapper() })

    await result.current.mutateAsync({
      source: layerSource,
      format: "geojson",
      scope: "layer",
      outputCrs: "EPSG:27700",
    })

    expect(logExport).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ outputCrs: "EPSG:27700" }),
    )
  })

  it("marks a selection export in its filename", async () => {
    const { result } = renderHook(() => useExport("proj-1"), { wrapper: wrapper() })

    const outcome = await result.current.mutateAsync({
      source: { kind: "selection", featureIds: ["f1"], layerId: "layer-1", layerName: "Parcels" },
      format: "geojson",
      scope: "selection",
    })

    expect(outcome.filename).toBe("Parcels_selection.geojson")
  })

  it("routes PDF to the print dialog rather than producing a file here", async () => {
    const { result } = renderHook(() => useExport("proj-1"), { wrapper: wrapper() })

    await expect(
      result.current.mutateAsync({ source: layerSource, format: "pdf", scope: "layer" }),
    ).rejects.toThrow(/produced from the map view/)

    expect(downloadSpy).not.toHaveBeenCalled()
  })

  it("omits a source layer id for a project-scope log (contracts §9)", async () => {
    vi.spyOn(
      await import("@/features/database/services/layerService"),
      "layerService",
      "get",
    ).mockReturnValue({ list: vi.fn().mockResolvedValue({ layers: [] }) } as never)

    const { result } = renderHook(() => useExport("proj-1"), { wrapper: wrapper() })

    await result.current.mutateAsync({
      source: { kind: "project", projectId: "proj-1", projectName: "City" },
      format: "geojson",
      scope: "project",
    })

    const logged = logExport.mock.calls.at(-1)?.[1] as { sourceLayerId?: string }
    expect(logged.sourceLayerId).toBeUndefined()
  })

  it("invalidates export history on settle, using the shared prefix key", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const keys: unknown[] = []
    vi.spyOn(client, "invalidateQueries").mockImplementation((filters) => {
      keys.push((filters as { queryKey?: unknown })?.queryKey)
      return Promise.resolve()
    })
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useExport("proj-1"), { wrapper: Wrapper })
    await result.current.mutateAsync({ source: layerSource, format: "geojson", scope: "layer" })

    // Identical to 007's key, so the Analysis panel's history refreshes too.
    expect(keys).toContainEqual(["projects", "proj-1", "exportHistory"])
  })
})
