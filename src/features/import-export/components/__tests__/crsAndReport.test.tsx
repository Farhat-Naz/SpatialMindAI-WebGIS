import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CrsPreview } from "../CrsPreview"
import { CrsSelector } from "../CrsSelector"
import { ValidationReport } from "../ValidationReport"
import * as download from "../../services/downloadBlob"

/**
 * CRS selection/preview and validation-report component tests
 * (specs/005-import-export, Phases 5/14/16; FR-057–FR-065, FR-090, FR-091).
 */

describe("CrsSelector (FR-060–FR-063, FR-091)", () => {
  it("offers the catalog plus a custom option in a labelled combobox", () => {
    render(<CrsSelector value="EPSG:4326" onChange={vi.fn()} />)

    const select = screen.getByLabelText("Source coordinate system") as HTMLSelectElement
    const values = Array.from(select.options).map((option) => option.value)

    expect(values).toContain("EPSG:4326")
    expect(values).toContain("EPSG:3857")
    expect(values).toContain("EPSG:27700")
    expect(values[values.length - 1]).toBe("CUSTOM")
    // A real select — keyboard operable by construction (FR-091).
    expect(select.tagName).toBe("SELECT")
  })

  it("states the provenance of a file-detected system (FR-061)", () => {
    render(<CrsSelector value="EPSG:27700" detectedFrom="file" onChange={vi.fn()} />)
    expect(screen.getByText(/Read from the file's projection information|Read from the file/i)).toBeTruthy()
  })

  it("asks the user to choose when nothing was detected (FR-062)", () => {
    render(<CrsSelector value="EPSG:4326" detectedFrom={null} onChange={vi.fn()} />)
    expect(screen.getByText(/does not say what coordinate system/i)).toBeTruthy()
  })

  it("reports a plain catalog selection immediately", () => {
    const onChange = vi.fn()
    render(<CrsSelector value="EPSG:4326" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText("Source coordinate system"), {
      target: { value: "EPSG:27700" },
    })
    expect(onChange).toHaveBeenCalledWith("EPSG:27700")
  })

  it("accepts a valid custom proj4 definition (FR-063)", () => {
    const onChange = vi.fn()
    render(<CrsSelector value="CUSTOM" onChange={onChange} />)

    const textarea = screen.getByLabelText("Custom definition (proj4 or WKT)")
    fireEvent.change(textarea, {
      target: { value: "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +datum=OSGB36 +units=m +no_defs" },
    })
    fireEvent.blur(textarea)

    expect(onChange).toHaveBeenLastCalledWith("CUSTOM", expect.stringContaining("+proj=tmerc"))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("rejects garbage with an alert tied to the field, before any job exists (FR-090)", () => {
    const onChange = vi.fn()
    render(<CrsSelector value="CUSTOM" onChange={onChange} />)

    const textarea = screen.getByLabelText("Custom definition (proj4 or WKT)")
    fireEvent.change(textarea, { target: { value: "not a projection" } })
    fireEvent.blur(textarea)

    // Caught while the user is looking at the field — not as a failed create.
    expect(screen.getByRole("alert").textContent).toMatch(/could not be read/i)
    expect(textarea.getAttribute("aria-invalid")).toBe("true")
    expect(onChange).not.toHaveBeenCalledWith("CUSTOM", "not a projection")
  })
})

describe("CrsPreview (FR-064, FR-065)", () => {
  const sample = {
    source: [[530034, 180381] as [number, number]],
    transformed: [[-0.1277, 51.5074] as [number, number]],
    bbox: [-0.13, 51.5, -0.12, 51.51] as [number, number, number, number],
  }

  it("shows source and transformed coordinates side by side (FR-064)", () => {
    render(<CrsPreview {...sample} plausible crsCode="EPSG:27700" />)

    // Where it was in the file, and where it will land on the map.
    expect(screen.getByText(/530034\.0, 180381\.0/)).toBeTruthy()
    expect(screen.getByText(/-0\.127700, 51\.507400/)).toBeTruthy()
    expect(screen.getByRole("table", { name: /transformed from EPSG:27700/i })).toBeTruthy()
  })

  it("confirms a plausible extent quietly", () => {
    render(<CrsPreview {...sample} plausible crsCode="EPSG:27700" />)
    expect(screen.getByRole("status").textContent).toMatch(/inside valid geographic bounds/i)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("raises the wrong-CRS alarm for an implausible extent (FR-065)", () => {
    render(
      <CrsPreview
        source={[[530034, 180381]]}
        transformed={[[530034, 180381]]}
        bbox={[529000, 180000, 531000, 181000]}
        plausible={false}
        crsCode="EPSG:4326"
      />,
    )

    // The classic disaster — projected values read as degrees — is called out
    // as an alert, not a hint.
    expect(screen.getByRole("alert").textContent).toMatch(/outside valid geographic bounds/i)
  })

  it("reports an unusable transform rather than an empty table", () => {
    render(<CrsPreview source={[]} transformed={[]} bbox={null} plausible={false} crsCode="CUSTOM" />)
    expect(screen.getByRole("alert").textContent).toMatch(/could not be transformed/i)
  })
})

describe("ValidationReport (FR-057, FR-058)", () => {
  const issues = Array.from({ length: 150 }, (_, index) => ({
    sourcePosition: index + 2,
    category: (index % 3 === 0 ? "missing_coordinate" : "duplicate_in_file") as
      | "missing_coordinate"
      | "duplicate_in_file",
    message: `Issue on row ${index + 2}`,
  }))

  it("shows exact totals even when only a sample is displayed (FR-057)", () => {
    render(
      <ValidationReport
        issues={issues}
        counts={{ rejected: 50, duplicate: 100, repaired: 3 }}
      />,
    )

    // Scoped to the totals row — the category chips repeat the numbers.
    const rejected = screen.getByText("Rejected").parentElement!
    expect(rejected.textContent).toContain("50")
    const duplicates = screen.getByText("Duplicates").parentElement!
    expect(duplicates.textContent).toContain("100")
    // 100 inline of 150 — stated, not hidden.
    expect(screen.getByText(/Showing 100 of 150 issues/)).toBeTruthy()
  })

  it("caps the inline table at the FR-058 limit", () => {
    render(<ValidationReport issues={issues} />)
    // Header row + 100 issue rows.
    expect(screen.getAllByRole("row")).toHaveLength(101)
  })

  it("downloads the complete report, not the displayed sample (FR-058)", async () => {
    const downloadSpy = vi.spyOn(download, "downloadBlob").mockImplementation(() => undefined)
    render(<ValidationReport issues={issues} fileName="parcels-issues" />)

    fireEvent.click(screen.getByRole("button", { name: /Download full report \(150\)/ }))

    expect(downloadSpy).toHaveBeenCalledTimes(1)
    const [blob, filename] = downloadSpy.mock.calls[0]
    expect(filename).toBe("parcels-issues.csv")
    const text = await (blob as Blob).text()
    // All 150 rows plus the header — the uncapped in-session list.
    expect(text.split("\r\n")).toHaveLength(151)
    downloadSpy.mockRestore()
  })

  it("states the history cap honestly when reading back a truncated set", () => {
    render(<ValidationReport issues={issues.slice(0, 100)} truncated />)
    expect(screen.getByText(/produced more than were stored/i)).toBeTruthy()
  })

  it("says so plainly when there is nothing to report", () => {
    render(<ValidationReport issues={[]} />)
    expect(screen.getByRole("status").textContent).toMatch(/No validation issues/i)
  })
})
