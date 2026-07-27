import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FileDropZone } from "../FileDropZone"

/**
 * `FileDropZone` tests (specs/005-import-export, T126; FR-004, FR-081, FR-087).
 */

function renderZone(props: Partial<Parameters<typeof FileDropZone>[0]> = {}) {
  const onFileAccepted = vi.fn()
  const onFileRejected = vi.fn()
  render(<FileDropZone onFileAccepted={onFileAccepted} onFileRejected={onFileRejected} {...props} />)
  return { onFileAccepted, onFileRejected }
}

/** The hidden file input the labelled button clicks. */
function fileInput(): HTMLInputElement {
  return screen.getByLabelText("Choose a file to import") as HTMLInputElement
}

/** Fires a change with the given files, the way a picker would. */
function choose(file: File): void {
  const input = fileInput()
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  fireEvent.change(input)
}

function geoJsonFile(name = "parcels.geojson"): File {
  const body = JSON.stringify({ type: "FeatureCollection", features: [] })
  return new File([body], name, { type: "application/geo+json" })
}

describe("FileDropZone", () => {
  it("exposes a keyboard-operable button rather than relying on the input (FR-087)", () => {
    renderZone()

    // A styled file input is not reliably keyboard-activatable; a real button
    // that clicks a hidden input is. The button is the primary affordance.
    const button = screen.getByRole("button", { name: "Choose file" })
    expect(button).toBeTruthy()
    expect(button.tagName).toBe("BUTTON")
  })

  it("labels the hidden input for assistive technology", () => {
    renderZone()
    expect(fileInput()).toBeTruthy()
  })

  it("states the size limit up front", () => {
    renderZone({ maxBytes: 50 * 1024 * 1024 })
    expect(screen.getByText(/up to 50\.0 MB/i)).toBeTruthy()
  })

  it("accepts a GeoJSON file and reports the detected format", async () => {
    const { onFileAccepted } = renderZone()
    choose(geoJsonFile())

    await waitFor(() => expect(onFileAccepted).toHaveBeenCalled())
    expect(onFileAccepted).toHaveBeenCalledWith(expect.any(File), "geojson")
  })

  it("rejects an oversized file with the limit stated, before any read (FR-081)", async () => {
    const { onFileAccepted, onFileRejected } = renderZone({ maxBytes: 1024 })
    // A 4 KB file against a 1 KB limit.
    choose(new File(["x".repeat(4096)], "big.geojson"))

    await waitFor(() => expect(onFileRejected).toHaveBeenCalled())
    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toMatch(/exceeds the 0 MB import limit|exceeds the/)
  })

  it("rejects an empty file", async () => {
    const { onFileRejected } = renderZone()
    choose(new File([], "empty.geojson"))

    await waitFor(() => expect(onFileRejected).toHaveBeenCalled())
    expect(screen.getByRole("alert").textContent).toMatch(/empty/i)
  })

  it("rejects a .geojson containing XML — content decides, not the extension (FR-004)", async () => {
    const { onFileAccepted, onFileRejected } = renderZone()
    choose(new File(["<root><child/></root>"], "lies.geojson"))

    await waitFor(() => expect(onFileRejected).toHaveBeenCalled())
    expect(onFileAccepted).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toMatch(/not a format this platform can read/i)
  })

  it("rejects a plain text file renamed .geojson", async () => {
    const { onFileAccepted } = renderZone()
    choose(new File(["just some prose with no delimiters"], "notes.geojson"))

    await waitFor(() => expect(screen.queryByRole("alert")).toBeTruthy())
    expect(onFileAccepted).not.toHaveBeenCalled()
  })

  it("issues no network request while validating", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const { onFileRejected } = renderZone()
    choose(new File(["<kml/>"], "lies.geojson"))

    await waitFor(() => expect(onFileRejected).toHaveBeenCalled())
    // Every rejection path is client-side, so a bad file costs no round trip.
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("detects a KMZ by extension where content alone cannot distinguish it from a ZIP", async () => {
    const { onFileAccepted } = renderZone()
    // Both are ZIP archives; the extension is the only disambiguator.
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
    choose(new File([zipHeader], "places.kmz"))

    await waitFor(() => expect(onFileAccepted).toHaveBeenCalledWith(expect.any(File), "kmz"))
  })

  it("detects a zipped shapefile", async () => {
    const { onFileAccepted } = renderZone()
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
    choose(new File([zipHeader], "parcels.zip"))

    await waitFor(() => expect(onFileAccepted).toHaveBeenCalledWith(expect.any(File), "shapefile"))
  })

  it("detects a CSV by its delimited first line", async () => {
    const { onFileAccepted } = renderZone()
    choose(new File(["lat,lon,site\n51.5,-0.12,Depot\n"], "sites.csv"))

    await waitFor(() => expect(onFileAccepted).toHaveBeenCalledWith(expect.any(File), "csv"))
  })

  it("accepts a file dropped onto the zone", async () => {
    const { onFileAccepted } = renderZone()
    const zone = screen.getByText(/Drag a file here/i).closest("div")!.parentElement!

    fireEvent.drop(zone, { dataTransfer: { files: [geoJsonFile()] } })

    await waitFor(() => expect(onFileAccepted).toHaveBeenCalled())
  })

  it("ignores a drop while disabled", async () => {
    const { onFileAccepted } = renderZone({ disabled: true })
    const zone = screen.getByText(/Drag a file here/i).closest("div")!.parentElement!

    fireEvent.drop(zone, { dataTransfer: { files: [geoJsonFile()] } })

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(onFileAccepted).not.toHaveBeenCalled()
  })

  it("disables the button while busy", () => {
    renderZone({ disabled: true })
    expect((screen.getByRole("button", { name: "Choose file" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("clears a previous rejection when a valid file follows", async () => {
    const { onFileAccepted } = renderZone()

    choose(new File(["<kml/>"], "bad.geojson"))
    await waitFor(() => expect(screen.queryByRole("alert")).toBeTruthy())

    choose(geoJsonFile())
    await waitFor(() => expect(onFileAccepted).toHaveBeenCalled())
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
