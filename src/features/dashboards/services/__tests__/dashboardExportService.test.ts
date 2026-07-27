import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { featureService } from "@/features/database/services/featureService"
import { dashboardExportService } from "../dashboardExportService"

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({ toDataURL: () => TINY_PNG_DATA_URL }),
}))

let anchorClicked = false

beforeEach(() => {
  anchorClicked = false
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
    anchorClicked = true
  })
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() })
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
  })
})
