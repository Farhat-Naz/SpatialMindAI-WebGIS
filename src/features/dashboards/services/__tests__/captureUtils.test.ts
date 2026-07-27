import { describe, expect, it, vi } from "vitest"
import { buildPdfFromImages, buildXlsxWorkbook, captureElementAsPng } from "../captureUtils"

// jsdom has no real canvas support ("Not implemented: HTMLCanvasElement's
// getContext()"), so html2canvas itself is mocked — this test asserts our
// wrapper's contract (calls html2canvas, returns its canvas's data URL), not
// html2canvas's own internal rendering.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: () => TINY_PNG_DATA_URL,
  }),
}))

describe("captureElementAsPng", () => {
  it("returns the mocked canvas's data URL", async () => {
    const node = document.createElement("div")
    const result = await captureElementAsPng(node)
    expect(result).toBe(TINY_PNG_DATA_URL)
  })
})

describe("buildPdfFromImages", () => {
  it("assembles a non-empty PDF Blob from one image", async () => {
    const blob = await buildPdfFromImages([TINY_PNG_DATA_URL])
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe("application/pdf")
  })

  it("assembles a multi-page PDF from more than one image", async () => {
    const blob = await buildPdfFromImages([TINY_PNG_DATA_URL, TINY_PNG_DATA_URL])
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe("buildXlsxWorkbook", () => {
  it("builds a non-empty xlsx Blob from one sheet", async () => {
    const blob = await buildXlsxWorkbook([{ name: "Data", rows: [{ a: 1, b: "x" }] }])
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })

  it("truncates a sheet name longer than 31 characters (Excel's limit)", async () => {
    const longName = "a".repeat(50)
    await expect(buildXlsxWorkbook([{ name: longName, rows: [{ a: 1 }] }])).resolves.toBeInstanceOf(Blob)
  })
})
