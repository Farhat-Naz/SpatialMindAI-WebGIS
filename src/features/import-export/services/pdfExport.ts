import { EXPORT_MIME_TYPES, PAGE_SIZES, PDF_RASTER_SCALE } from "../types/exportConstants"
import type { PrintLayout } from "../types/importExport.types"

/**
 * Map-to-PDF export (specs/005-import-export, T081 + Phase 13; FR-044–FR-050).
 *
 * `html2canvas` rasterizes the map pane; `jsPDF` places that raster and then
 * draws the title, north arrow, scale bar, and legend as **vectors on top**, so
 * their text stays crisp and selectable at print resolution instead of being
 * baked into a screen-resolution bitmap (FR-047, FR-049).
 *
 * Both libraries are behind `await import()` (Constitution Principle V) — a user
 * who never prints downloads neither.
 *
 * ## Tainted canvas (research.md Decision 11)
 *
 * Basemap tiles come from `tile.openstreetmap.org` and `server.arcgisonline.com`.
 * Both send `Access-Control-Allow-Origin: *`, but a browser only *records* that
 * approval if the image was requested with the CORS attribute — hence
 * `crossOrigin="anonymous"` on the `TileLayer`, which is this feature's only
 * change to an already-implemented feature.
 *
 * If rasterization still throws `SecurityError` — most likely because tiles were
 * cached before that attribute existed — `canRasterize()` reports false and the
 * dialog falls back to `window.print()` against a print stylesheet. The fallback
 * is not a degraded afterthought: it produces a correct printed page through the
 * browser's own pipeline, which has no same-origin restriction at all.
 */

/** Millimetres of margin around the map area on every side. */
const PAGE_MARGIN_MM = 10

/** Height reserved for the title band when a title is set. */
const TITLE_BAND_MM = 12

/** One legend row: a swatch and its label (FR-048). */
export interface LegendEntry {
  label: string
  /** CSS colour of the layer's symbology swatch. */
  color: string
}

/** Everything the vector overlays need that cannot be read off the map element. */
export interface PrintContext {
  /**
   * Ground metres per screen pixel at the map's current centre and zoom, used to
   * size the scale bar accurately (FR-047). Supplied by the caller because only
   * the live Leaflet instance knows it.
   */
  metersPerPixel?: number
  /** Visible layers with their symbology, for the legend (FR-048). */
  legend?: LegendEntry[]
  /** Attribution text required by the basemap's licence. */
  attribution?: string
}

/**
 * Reports whether the map pane can be rasterized without a `SecurityError`.
 *
 * Probes by drawing a 1×1 pixel and reading it back: `getImageData` on a tainted
 * canvas throws, which is the same failure `html2canvas` would hit, but detected
 * in microseconds instead of after a multi-second render.
 *
 * A false result is not an error state — it selects the `window.print()` path.
 */
export function canRasterize(): boolean {
  if (typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext("2d")
    if (!context) return false
    context.fillRect(0, 0, 1, 1)
    context.getImageData(0, 0, 1, 1)
    return true
  } catch {
    return false
  }
}

/** Page dimensions in millimetres for a layout, accounting for orientation. */
export function pageDimensions(layout: PrintLayout): { width: number; height: number } {
  const { width, height } = PAGE_SIZES[layout.pageSize]
  return layout.orientation === "landscape" ? { width: height, height: width } : { width, height }
}

/**
 * Chooses a scale-bar length that is a "nice" round ground distance and fits the
 * available width (FR-047).
 *
 * Round numbers are the point of a scale bar: "500 m" is readable and
 * verifiable, "473 m" is neither. The candidate ladder is walked from largest to
 * smallest so the bar is as long as will fit, which is what makes it accurate to
 * read against.
 */
export function chooseScaleBar(
  metersPerPixel: number,
  maxWidthPx: number,
): { meters: number; widthPx: number; label: string } | null {
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0 || maxWidthPx <= 0) return null

  const candidates = [
    5_000_000, 2_000_000, 1_000_000, 500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000,
    2_000, 1_000, 500, 200, 100, 50, 20, 10, 5, 2, 1,
  ]

  for (const meters of candidates) {
    const widthPx = meters / metersPerPixel
    if (widthPx <= maxWidthPx) {
      const label = meters >= 1000 ? `${(meters / 1000).toLocaleString()} km` : `${meters} m`
      return { meters, widthPx, label }
    }
  }
  return null
}

/**
 * Renders the map element and its decorations to a PDF blob.
 *
 * Throws if rasterization fails, so the caller can fall back to
 * `window.print()`. It does not fall back internally: the fallback opens the
 * browser's print dialog, which is a user-visible side effect that a function
 * returning a `Blob` must not perform on its own.
 */
export async function exportMapAsPdf(
  layout: PrintLayout,
  mapEl: HTMLElement,
  context: PrintContext = {},
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ])

  const canvas = await html2canvas(mapEl, {
    scale: PDF_RASTER_SCALE,
    useCORS: true,
    // Leaflet positions tiles with transforms inside a scrolling pane; letting
    // html2canvas apply the page's scroll offset shifts the capture.
    scrollX: 0,
    scrollY: 0,
    backgroundColor: "#ffffff",
    logging: false,
  })

  const { width: pageWidth, height: pageHeight } = pageDimensions(layout)
  const pdf = new jsPDF({
    unit: "mm",
    format: [pageWidth, pageHeight],
    orientation: layout.orientation,
  })

  const titleOffset = layout.title ? TITLE_BAND_MM : 0
  const mapX = PAGE_MARGIN_MM
  const mapY = PAGE_MARGIN_MM + titleOffset
  const mapWidth = pageWidth - PAGE_MARGIN_MM * 2
  const mapHeight = pageHeight - PAGE_MARGIN_MM * 2 - titleOffset

  // Preserve the map's aspect ratio inside the available area rather than
  // stretching it: a distorted map is a wrong map, and distances read off it
  // would be wrong in one axis.
  const sourceRatio = canvas.width / canvas.height
  const areaRatio = mapWidth / mapHeight
  const drawWidth = sourceRatio > areaRatio ? mapWidth : mapHeight * sourceRatio
  const drawHeight = sourceRatio > areaRatio ? mapWidth / sourceRatio : mapHeight
  const drawX = mapX + (mapWidth - drawWidth) / 2
  const drawY = mapY + (mapHeight - drawHeight) / 2

  pdf.addImage(canvas.toDataURL("image/png"), "PNG", drawX, drawY, drawWidth, drawHeight)

  // ---- Vector overlays ----------------------------------------------------

  if (layout.title) {
    pdf.setFontSize(16)
    pdf.setTextColor(17, 17, 17)
    pdf.text(layout.title, pageWidth / 2, PAGE_MARGIN_MM + 6, { align: "center" })
  }

  pdf.setDrawColor(17, 17, 17)
  pdf.setFillColor(17, 17, 17)
  pdf.setLineWidth(0.3)

  if (layout.showNorthArrow) {
    // A filled triangle plus an "N": drawn as vectors so it stays sharp, rather
    // than rasterizing the on-screen NorthArrow component.
    const cx = drawX + drawWidth - 12
    const cy = drawY + 14
    pdf.triangle(cx, cy - 6, cx - 3.5, cy + 4, cx + 3.5, cy + 4, "F")
    pdf.setFontSize(9)
    pdf.text("N", cx, cy + 9, { align: "center" })
  }

  if (layout.showScaleBar && context.metersPerPixel !== undefined) {
    // The raster was captured at PDF_RASTER_SCALE, so one CSS pixel of the live
    // map corresponds to `drawWidth / (canvas.width / PDF_RASTER_SCALE)` mm.
    const mmPerCssPixel = drawWidth / (canvas.width / PDF_RASTER_SCALE)
    const bar = chooseScaleBar(context.metersPerPixel, (mapWidth * 0.3) / mmPerCssPixel)

    if (bar) {
      const barWidthMm = bar.widthPx * mmPerCssPixel
      const barX = drawX + 8
      const barY = drawY + drawHeight - 10

      pdf.setFillColor(255, 255, 255)
      pdf.rect(barX - 2, barY - 6, barWidthMm + 4, 11, "F")
      pdf.setFillColor(17, 17, 17)
      pdf.rect(barX, barY, barWidthMm, 1.5, "F")
      pdf.rect(barX, barY - 1.5, 0.4, 4.5, "F")
      pdf.rect(barX + barWidthMm - 0.4, barY - 1.5, 0.4, 4.5, "F")
      pdf.setFontSize(8)
      pdf.setTextColor(17, 17, 17)
      pdf.text(bar.label, barX, barY - 2.5)
    }
  }

  if (layout.showLegend && context.legend && context.legend.length > 0) {
    const rowHeight = 5
    const boxWidth = 34
    const boxHeight = context.legend.length * rowHeight + 6
    const boxX = drawX + 8
    const boxY = drawY + 8

    pdf.setFillColor(255, 255, 255)
    pdf.setDrawColor(120, 120, 120)
    pdf.rect(boxX, boxY, boxWidth, boxHeight, "FD")

    pdf.setFontSize(8)
    context.legend.forEach((entry, index) => {
      const rowY = boxY + 5 + index * rowHeight
      const [r, g, b] = parseColor(entry.color)
      pdf.setFillColor(r, g, b)
      pdf.rect(boxX + 2, rowY - 2.4, 3, 3, "F")
      pdf.setTextColor(17, 17, 17)
      pdf.text(truncate(entry.label, 28), boxX + 7, rowY)
    })
  }

  if (context.attribution) {
    pdf.setFontSize(6)
    pdf.setTextColor(90, 90, 90)
    pdf.text(context.attribution, pageWidth - PAGE_MARGIN_MM, pageHeight - 4, { align: "right" })
  }

  return pdf.output("blob") as Blob
}

/** PDF MIME type, so a caller need not reach into the constants module. */
export const PDF_MIME_TYPE = EXPORT_MIME_TYPES.pdf

/**
 * Parses a CSS colour to an `[r, g, b]` triple for jsPDF, which accepts only
 * numeric channels. Handles `#rgb`, `#rrggbb`, and `rgb()/rgba()`; anything else
 * falls back to mid-grey rather than throwing, because a legend swatch of the
 * wrong colour is a far better outcome than a failed export.
 */
function parseColor(color: string): [number, number, number] {
  const value = color.trim()

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) {
    return [
      parseInt(short[1] + short[1], 16),
      parseInt(short[2] + short[2], 16),
      parseInt(short[3] + short[3], 16),
    ]
  }

  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (long) {
    return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)]
  }

  const functional = /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/i.exec(value)
  if (functional) {
    return [Number(functional[1]), Number(functional[2]), Number(functional[3])]
  }

  return [128, 128, 128]
}

/** Shortens a legend label that would overflow its box. */
function truncate(label: string, max: number): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`
}
