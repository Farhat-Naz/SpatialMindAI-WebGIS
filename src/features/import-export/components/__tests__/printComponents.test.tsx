import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { analysisService } from "@/features/analysis/services/analysisService"
import { MapLegend } from "../MapLegend"
import { PrintDialog } from "../PrintDialog"
import { PrintPreview } from "../PrintPreview"
import { ScaleBar } from "../ScaleBar"
import { DEFAULT_PRINT_LAYOUT, useExportStore } from "../../store/exportStore"

/**
 * Print & PDF component tests (specs/005-import-export, Phase 13/16;
 * FR-044–FR-050).
 */

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

beforeEach(() => {
  useExportStore.getState().reset()
  vi.spyOn(analysisService, "logExport").mockResolvedValue({} as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ScaleBar (FR-047)", () => {
  it("labels a round ground distance, derived from metres-per-pixel", () => {
    // ~38 m/px (zoom ~12 at mid-latitude): the widest round distance fitting
    // 160px is 5 km (131px); 6 km isn't on the ladder and 10 km wouldn't fit.
    render(<ScaleBar metersPerPixel={38} />)
    expect(screen.getByRole("img", { name: "Scale bar: 5 km" })).toBeTruthy()
  })

  it("sizes the bar from the distance, not the other way around", () => {
    render(<ScaleBar metersPerPixel={10} maxWidthPx={160} />)
    // 1 km at 10 m/px = 100px — a round label with a derived width, never a
    // fixed bar labelled with whatever it happens to span.
    const bar = screen.getByRole("img", { name: "Scale bar: 1 km" })
    const line = bar.querySelector("span[aria-hidden]") as HTMLElement
    expect(line.style.width).toBe("100px")
  })

  it("switches to metres below the kilometre threshold", () => {
    render(<ScaleBar metersPerPixel={1} maxWidthPx={160} />)
    expect(screen.getByRole("img", { name: "Scale bar: 100 m" })).toBeTruthy()
  })

  it("renders nothing rather than an inaccurate bar for a broken scale", () => {
    const { container } = render(<ScaleBar metersPerPixel={0} />)
    expect(container.firstChild).toBeNull()
  })
})

describe("MapLegend (FR-048)", () => {
  it("lists each visible layer with its swatch", () => {
    render(
      <MapLegend
        entries={[
          { label: "Parcels", color: "#22c55e" },
          { label: "Roads", color: "#3b82f6" },
        ]}
      />,
    )

    const legend = screen.getByRole("region", { name: "Legend" })
    expect(legend).toBeTruthy()
    expect(screen.getByText("Parcels")).toBeTruthy()
    expect(screen.getByText("Roads")).toBeTruthy()
  })

  it("renders nothing for an empty layer set", () => {
    const { container } = render(<MapLegend entries={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe("PrintPreview (FR-044)", () => {
  it("previews the page at its real aspect ratio", () => {
    render(<PrintPreview layout={{ ...DEFAULT_PRINT_LAYOUT, orientation: "portrait" }} width={210} />)

    // A4 portrait is 210×297mm; at width 210px the height must be 297px — the
    // preview shows the shape of the output, not an approximation.
    const page = screen.getByRole("img", { name: /A4 portrait page/ })
    expect(page.style.width).toBe("210px")
    expect(page.style.height).toBe("297px")
  })

  it("swaps dimensions for landscape", () => {
    render(<PrintPreview layout={DEFAULT_PRINT_LAYOUT} width={297} />)
    const page = screen.getByRole("img", { name: /A4 landscape page/ })
    expect(page.style.height).toBe("210px")
  })

  it("names the title in the accessible description", () => {
    render(<PrintPreview layout={{ ...DEFAULT_PRINT_LAYOUT, title: "Site plan" }} />)
    expect(screen.getByRole("img", { name: /titled Site plan/ })).toBeTruthy()
    expect(screen.getByText("Site plan")).toBeTruthy()
  })

  it("states the physical page size", () => {
    render(<PrintPreview layout={{ ...DEFAULT_PRINT_LAYOUT, pageSize: "A3" }} />)
    expect(screen.getByText(/A3 landscape — 420 × 297 mm/)).toBeTruthy()
  })
})

describe("PrintDialog (FR-044–FR-046, FR-050)", () => {
  function renderDialog(onOpenChange = vi.fn()) {
    render(
      <PrintDialog
        open
        onOpenChange={onOpenChange}
        projectId="p1"
        name="Parcels"
        getMapElement={() => null}
      />,
      { wrapper: wrapper() },
    )
    return { onOpenChange }
  }

  it("offers page size, orientation, and the three element toggles", () => {
    renderDialog()

    expect(screen.getByLabelText("Page size")).toBeTruthy()
    expect(screen.getByLabelText("Orientation")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "North arrow" })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Scale bar" })).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Legend" })).toBeTruthy()
  })

  it("updates the live preview when the layout changes (FR-044)", () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText("Page size"), { target: { value: "A3" } })
    // Both read exportStore.printLayout, so agreement is by construction — this
    // asserts the wiring actually flows through the store.
    expect(useExportStore.getState().printLayout.pageSize).toBe("A3")
    expect(screen.getByText(/A3 landscape/)).toBeTruthy()
  })

  it("cancel closes without producing anything and keeps the page setup (FR-050)", () => {
    const { onOpenChange } = renderDialog()

    fireEvent.change(screen.getByLabelText("Page size"), { target: { value: "Letter" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    // No download, no logExport call...
    expect(analysisService.logExport).not.toHaveBeenCalled()
    // ...and the configured layout survives an accidental close.
    expect(useExportStore.getState().printLayout.pageSize).toBe("Letter")
  })

  it("reports the print fallback path instead of an export button when rasterization is unavailable", () => {
    // jsdom's canvas has no 2d context, so canRasterize() is false here — which
    // is exactly the tainted-canvas environment the fallback exists for.
    renderDialog()

    expect(screen.getByText(/browser’s own print dialog/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open print dialog" })).toBeTruthy()
  })
})
