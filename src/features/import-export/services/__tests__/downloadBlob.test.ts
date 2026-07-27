import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { downloadBlob, toDownloadFilename } from "../downloadBlob"

/**
 * Download-side-effect tests (specs/005-import-export, T084).
 *
 * The revocation assertion is the one that matters: an un-revoked object URL
 * pins its blob's memory for the tab's lifetime, and a user exporting several
 * large layers in a session would leak all of them.
 */

let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  createObjectURL = vi.fn(() => "blob:mock-url")
  revokeObjectURL = vi.fn()
  vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("downloadBlob", () => {
  it("clicks an anchor carrying the filename, then cleans up", () => {
    const clicks: string[] = []
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreate(tag) as HTMLAnchorElement
      if (tag === "a") {
        element.click = () => clicks.push(element.download)
      }
      return element
    })

    downloadBlob(new Blob(["x"]), "parcels.geojson")

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicks).toEqual(["parcels.geojson"])
    // The anchor must not be left in the document.
    expect(document.querySelector("a")).toBeNull()
  })

  it("revokes the object URL, but only after the click's task", () => {
    downloadBlob(new Blob(["x"]), "a.csv")

    // Revoking synchronously with the click makes some browsers abandon the
    // in-flight download, so it is deferred by a tick.
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
  })

  it("still revokes the URL when the click throws", () => {
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreate(tag) as HTMLAnchorElement
      if (tag === "a") {
        element.click = () => {
          throw new Error("blocked")
        }
      }
      return element
    })

    expect(() => downloadBlob(new Blob(["x"]), "a.csv")).toThrow("blocked")
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url")
  })
})

describe("toDownloadFilename", () => {
  it.each([
    ["Parcels 2026", "geojson", undefined, "Parcels_2026.geojson"],
    ["Parcels 2026", "csv", "export", "Parcels_2026_export.csv"],
    ["a/b:c", "kml", undefined, "a_b_c.kml"],
    // A name of only unsafe characters must still produce a usable filename.
    ["///", "zip", undefined, "export.zip"],
    // A leading dot would otherwise download as a hidden dotfile.
    [".hidden", "csv", undefined, "hidden.csv"],
  ])("turns %s into %s", (base, extension, suffix, expected) => {
    expect(toDownloadFilename(base, extension, suffix)).toBe(expected)
  })
})
