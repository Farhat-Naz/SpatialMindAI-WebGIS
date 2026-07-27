import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ColumnMapping } from "@/shared/contracts/importJob.schema"
import { CsvColumnMapper } from "../../components/CsvColumnMapper"
import { ImportPreviewTable } from "../../components/ImportPreviewTable"

/**
 * Keyboard + screen-reader CSV walkthrough (specs/005-import-export, Phase 18;
 * FR-091, SC-014).
 *
 * SC-014 requires the entire CSV mapping flow to be completable with keyboard
 * and screen reader alone. jsdom cannot literally drive a screen reader, so
 * this suite asserts the two things that make that possible and that regress
 * silently:
 *
 * 1. every decision point is a **native, focusable, labelled control** — real
 *    `<select>`/`<input>` elements reachable in tab order, never a styled div
 *    with a click handler;
 * 2. the accessible relationships hold — labels programmatically associated,
 *    the mapping described by the preview via `aria-describedby`, and an
 *    invalid state expressed through `aria-invalid` + `role="alert"`, not
 *    colour.
 *
 * The visual/manual half of SC-014 stays in quickstart.md's walkthrough.
 */

const COLUMNS = ["site_id", "name", "lat", "lon", "population", "notes"]

function mapping(overrides: Partial<ColumnMapping> = {}): ColumnMapping {
  return {
    latitudeColumn: "lat",
    longitudeColumn: "lon",
    delimiter: ",",
    hasHeaderRow: true,
    attributeColumns: [],
    ...overrides,
  }
}

describe("CSV flow — keyboard operability (SC-014)", () => {
  it("exposes every decision as a native focusable control", () => {
    render(<CsvColumnMapper columns={COLUMNS} value={mapping()} onChange={vi.fn()} />)

    // The four decisions: latitude, longitude, delimiter, header row.
    const latitude = screen.getByLabelText("Latitude column")
    const longitude = screen.getByLabelText("Longitude column")
    const delimiter = screen.getByLabelText("Column separator")
    const header = screen.getByLabelText("First row is column names")

    // Native elements are what makes keyboard activation reliable — a styled
    // div with a click handler would pass a click test and fail a keyboard user.
    expect(latitude.tagName).toBe("SELECT")
    expect(longitude.tagName).toBe("SELECT")
    expect(delimiter.tagName).toBe("SELECT")
    expect((header as HTMLInputElement).type).toBe("checkbox")

    // All reachable in tab order (no tabindex=-1).
    for (const control of [latitude, longitude, delimiter, header]) {
      expect(control.getAttribute("tabindex")).not.toBe("-1")
    }
  })

  it("lists every column as a real option a keyboard user can reach", () => {
    render(<CsvColumnMapper columns={COLUMNS} value={mapping()} onChange={vi.fn()} />)

    const latitude = screen.getByLabelText("Latitude column") as HTMLSelectElement
    const values = Array.from(latitude.options).map((option) => option.value)

    // The empty "choose" option plus all six columns — selection happens with
    // arrow keys on a native select, no pointer needed.
    expect(values).toEqual(["", ...COLUMNS])
  })

  it("completes the whole mapping via change events alone (no pointer)", () => {
    const onChange = vi.fn()
    render(
      <CsvColumnMapper
        columns={COLUMNS}
        value={mapping({ latitudeColumn: "", longitudeColumn: "" })}
        onChange={onChange}
      />,
    )

    // A keyboard user operates a native select by focusing it and pressing
    // arrows, which fires `change` — the same event dispatched here.
    fireEvent.change(screen.getByLabelText("Latitude column"), { target: { value: "lat" } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ latitudeColumn: "lat" }))

    fireEvent.change(screen.getByLabelText("Longitude column"), { target: { value: "lon" } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ longitudeColumn: "lon" }))

    fireEvent.change(screen.getByLabelText("Column separator"), { target: { value: ";" } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ delimiter: ";" }))

    fireEvent.click(screen.getByLabelText("First row is column names"))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hasHeaderRow: false }))
  })

  it("associates the coordinate selects with the preview (FR-091)", () => {
    render(
      <CsvColumnMapper
        columns={COLUMNS}
        value={mapping()}
        onChange={vi.fn()}
        previewId="csv-preview"
      />,
    )

    // `aria-describedby` is what lets a screen reader announce the mapping's
    // effect — the preview — when the select is focused.
    expect(screen.getByLabelText("Latitude column").getAttribute("aria-describedby")).toBe(
      "csv-preview",
    )
    expect(screen.getByLabelText("Longitude column").getAttribute("aria-describedby")).toBe(
      "csv-preview",
    )
  })

  it("announces a same-column mistake as an alert tied to both selects (FR-090)", () => {
    render(
      <CsvColumnMapper
        columns={COLUMNS}
        value={mapping({ latitudeColumn: "lat", longitudeColumn: "lat" })}
        onChange={vi.fn()}
      />,
    )

    // The blocking error is a role="alert" (announced immediately), and the
    // offending controls carry aria-invalid — never colour alone.
    expect(screen.getByRole("alert").textContent).toMatch(/cannot be the same column/i)
    expect(screen.getByLabelText("Latitude column").getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByLabelText("Longitude column").getAttribute("aria-invalid")).toBe("true")
  })

  it("keeps attribute checkboxes as labelled native inputs", () => {
    render(<CsvColumnMapper columns={COLUMNS} value={mapping()} onChange={vi.fn()} />)

    // Non-coordinate columns each get a real checkbox with the column name as
    // its accessible name.
    const checkbox = screen.getByRole("checkbox", { name: "site_id" })
    expect((checkbox as HTMLInputElement).type).toBe("checkbox")
  })

  it("renders the preview as a real table a screen reader can navigate", () => {
    render(
      <ImportPreviewTable
        id="csv-preview"
        columns={COLUMNS}
        rows={[
          {
            site_id: "1",
            name: "Depot",
            lat: "51.5072",
            lon: "-0.1276",
            population: "1200",
            notes: "Main site",
          },
        ]}
        mapping={{ latitudeColumn: "lat", longitudeColumn: "lon" }}
      />,
    )

    // A real <table> with column headers gives table-navigation semantics for
    // free; the resulting position is a cell, not a tooltip.
    const table = screen.getByRole("table", { name: /preview of the first rows/i })
    expect(table).toBeTruthy()
    expect(screen.getAllByRole("columnheader").length).toBe(COLUMNS.length + 1)
    expect(screen.getByText("-0.1276, 51.5072")).toBeTruthy()
  })
})
