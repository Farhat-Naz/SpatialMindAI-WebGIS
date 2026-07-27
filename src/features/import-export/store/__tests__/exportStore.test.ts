import { beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_PRINT_LAYOUT,
  selectHasMixedGeometryWarning,
  selectPrintLayout,
  useExportStore,
} from "../exportStore"

/**
 * `exportStore` tests (specs/005-import-export, T111).
 */

beforeEach(() => {
  useExportStore.getState().reset()
})

describe("initial state", () => {
  it("defaults to a layer-scope GeoJSON export in WGS84", () => {
    const state = useExportStore.getState()
    expect(state.scope).toBe("layer")
    expect(state.format).toBe("geojson")
    expect(state.outputCrs).toBe("EPSG:4326")
    expect(state.isDialogOpen).toBe(false)
  })
})

describe("scope and format", () => {
  it.each(["selection", "layer", "project"] as const)("accepts the %s scope", (scope) => {
    useExportStore.getState().setScope(scope)
    expect(useExportStore.getState().scope).toBe(scope)
  })

  it.each(["geojson", "shapefile", "csv", "kml", "pdf"] as const)("accepts the %s format", (format) => {
    useExportStore.getState().setFormat(format)
    expect(useExportStore.getState().format).toBe(format)
  })

  it("discards a stale geometry inspection when the scope changes", () => {
    useExportStore.getState().setShapeClasses(["point", "polygon"])
    useExportStore.getState().setScope("project")
    // The inspection was computed against the previous source.
    expect(useExportStore.getState().shapeClasses).toBeNull()
  })

  it("clears a stale error when the format changes", () => {
    useExportStore.getState().setError("nothing to export")
    useExportStore.getState().setFormat("csv")
    expect(useExportStore.getState().error).toBeNull()
  })
})

describe("output CRS", () => {
  it("records the chosen authority code (FR-041)", () => {
    useExportStore.getState().setOutputCrs("EPSG:27700")
    expect(useExportStore.getState().outputCrs).toBe("EPSG:27700")
  })
})

describe("print layout", () => {
  it("merges a partial change without restating every field", () => {
    useExportStore.getState().setPrintLayout({ pageSize: "A3" })

    const layout = selectPrintLayout(useExportStore.getState())
    expect(layout.pageSize).toBe("A3")
    // Untouched fields keep their values.
    expect(layout.orientation).toBe(DEFAULT_PRINT_LAYOUT.orientation)
    expect(layout.showScaleBar).toBe(true)
  })

  it("toggles individual elements", () => {
    useExportStore.getState().setPrintLayout({ showLegend: false, showNorthArrow: false })
    const layout = selectPrintLayout(useExportStore.getState())
    expect(layout.showLegend).toBe(false)
    expect(layout.showNorthArrow).toBe(false)
    expect(layout.showScaleBar).toBe(true)
  })

  it("restores the default layout on request", () => {
    useExportStore.getState().setPrintLayout({ pageSize: "Letter", orientation: "portrait" })
    useExportStore.getState().resetPrintLayout()
    expect(selectPrintLayout(useExportStore.getState())).toEqual(DEFAULT_PRINT_LAYOUT)
  })

  it("keeps the layout when the print dialog is closed (FR-050)", () => {
    useExportStore.getState().openPrintDialog()
    useExportStore.getState().setPrintLayout({ pageSize: "A3", title: "Site plan" })
    useExportStore.getState().closePrintDialog()

    const state = useExportStore.getState()
    expect(state.isPrintDialogOpen).toBe(false)
    // Closing produces no download and must not discard the page setup.
    expect(state.printLayout.pageSize).toBe("A3")
    expect(state.printLayout.title).toBe("Site plan")
  })
})

describe("dialog open/close", () => {
  it("opens and closes the export dialog", () => {
    useExportStore.getState().openDialog()
    expect(useExportStore.getState().isDialogOpen).toBe(true)

    useExportStore.getState().closeDialog()
    expect(useExportStore.getState().isDialogOpen).toBe(false)
  })

  it("clears a transient error and inspection on close", () => {
    useExportStore.getState().openDialog()
    useExportStore.getState().setError("failed")
    useExportStore.getState().setShapeClasses(["point"])
    useExportStore.getState().closeDialog()

    const state = useExportStore.getState()
    expect(state.error).toBeNull()
    expect(state.shapeClasses).toBeNull()
  })

  it("tracks the print dialog independently of the export dialog", () => {
    useExportStore.getState().openPrintDialog()
    const state = useExportStore.getState()
    expect(state.isPrintDialogOpen).toBe(true)
    expect(state.isDialogOpen).toBe(false)
  })
})

describe("mixed-geometry warning (FR-038)", () => {
  it("warns for a shapefile export of mixed geometry", () => {
    useExportStore.getState().setFormat("shapefile")
    useExportStore.getState().setShapeClasses(["point", "polygon"])
    expect(selectHasMixedGeometryWarning(useExportStore.getState())).toBe(true)
  })

  it("does not warn for a single geometry class", () => {
    useExportStore.getState().setFormat("shapefile")
    useExportStore.getState().setShapeClasses(["point"])
    expect(selectHasMixedGeometryWarning(useExportStore.getState())).toBe(false)
  })

  it("does not warn for a format that handles mixed geometry", () => {
    useExportStore.getState().setFormat("geojson")
    useExportStore.getState().setShapeClasses(["point", "polygon"])
    // Only the shapefile header is single-geometry-type.
    expect(selectHasMixedGeometryWarning(useExportStore.getState())).toBe(false)
  })

  it("does not warn before the source has been inspected", () => {
    useExportStore.getState().setFormat("shapefile")
    expect(selectHasMixedGeometryWarning(useExportStore.getState())).toBe(false)
  })
})

describe("the selection itself is not duplicated here", () => {
  it("holds a scope choice but no feature-id list", () => {
    useExportStore.getState().setScope("selection")
    const state = useExportStore.getState() as unknown as Record<string, unknown>

    expect(state.scope).toBe("selection")
    // Selection membership is read from Map Editing's selection store at export
    // time; a copy here would disagree the moment the user clicks the map.
    for (const key of ["featureIds", "selectedFeatureIds", "selection"]) {
      expect(state[key]).toBeUndefined()
    }
  })
})
