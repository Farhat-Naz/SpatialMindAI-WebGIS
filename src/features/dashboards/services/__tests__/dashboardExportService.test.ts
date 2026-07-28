import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { featureService } from "@/features/database/services/featureService"
import { dashboardExportService } from "../dashboardExportService"

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({ toDataURL: () => TINY_PNG_DATA_URL }),
}))

let anchorClicked = false
let capturedBlob: Blob | null = null

beforeEach(() => {
  anchorClicked = false
  capturedBlob = null
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    anchorClicked = true
  })
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => {
      capturedBlob = blob
      return "blob:mock"
    }),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("dashboardExportService", () => {
  it("exportDashboardAsImage: captures and triggers a download", async () => {
    const node = document.createElement("div")
    await dashboardExportService.exportDashboardAsImage(node, "dash.png")
    expect(anchorClicked).toBe(true)
  })

  it("exportWidgetAsImage: captures and triggers a download", async () => {
    const node = document.createElement("div")
    await dashboardExportService.exportWidgetAsImage(node, "widget.png")
    expect(anchorClicked).toBe(true)
  })

  it("exportTableWidgetData: pages through every feature and downloads a CSV", async () => {
    vi.spyOn(featureService, "list").mockResolvedValueOnce({
      features: [
        {
          id: "f1",
          layerId: "layer-1",
          geometry: { type: "Point", coordinates: [1, 1] },
          attributes: [{ key: "name", value: "A" }],
          createdAt: "",
          updatedAt: "",
        } as never,
      ],
      nextCursor: null,
    })

    await dashboardExportService.exportTableWidgetData("layer-1", "csv")
    expect(anchorClicked).toBe(true)
  })

  it("exportTableWidgetData: aggregates across cursor pages before downloading Excel", async () => {
    vi.spyOn(featureService, "list")
      .mockResolvedValueOnce({
        features: [
          { id: "f1", layerId: "layer-1", geometry: { type: "Point", coordinates: [1, 1] }, attributes: [], createdAt: "", updatedAt: "" } as never,
        ],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        features: [
          { id: "f2", layerId: "layer-1", geometry: { type: "Point", coordinates: [2, 2] }, attributes: [], createdAt: "", updatedAt: "" } as never,
        ],
        nextCursor: null,
      })

    await dashboardExportService.exportTableWidgetData("layer-1", "excel")
    expect(featureService.list).toHaveBeenCalledTimes(2)
    expect(anchorClicked).toBe(true)
    expect(capturedBlob?.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })

  it("T267 — CSV output is structurally valid: a header row plus one row per feature, values quoted/escaped", async () => {
    vi.spyOn(featureService, "list").mockResolvedValueOnce({
      features: [
        {
          id: "f1",
          layerId: "layer-1",
          geometry: { type: "Point", coordinates: [1, 1] },
          attributes: [{ key: "name", value: 'A "quoted" value' }],
          createdAt: "",
          updatedAt: "",
        } as never,
      ],
      nextCursor: null,
    })

    await dashboardExportService.exportTableWidgetData("layer-1", "csv")

    expect(capturedBlob?.type).toBe("text/csv")
    const text = await capturedBlob?.text()
    const lines = text?.trimEnd().split("\r\n") ?? []
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('"id","geometry","name"')
    expect(lines[1]).toContain('"A ""quoted"" value"')
  })

  it("T267 — an empty table still downloads a valid CSV with just an (empty) header row, not a silent failure", async () => {
    vi.spyOn(featureService, "list").mockResolvedValueOnce({ features: [], nextCursor: null })

    await dashboardExportService.exportTableWidgetData("layer-1", "csv")

    expect(anchorClicked).toBe(true)
    const text = await capturedBlob?.text()
    expect(text?.trimEnd()).toBe("")
  })
})
