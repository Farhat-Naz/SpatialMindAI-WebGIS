"use client"

import type { ReactNode } from "react"
import { pageDimensions } from "../services/pdfExport"
import type { PrintLayout } from "../types/importExport.types"

/**
 * Exact page-area preview (specs/005-import-export, Phase 13; FR-044).
 *
 * Renders a box with the **page's real aspect ratio**, so what the user sees is
 * the shape of the output rather than an approximation of it. FR-044 asks for the
 * page area to be previewable before printing, and an A4-landscape preview drawn
 * in a square box would show a crop that will not happen.
 *
 * The margin and title band are laid out with the same proportions
 * `exportMapAsPdf` uses, so the preview's map area corresponds to the PDF's.
 */

/** Millimetres of margin, matching `pdfExport`'s `PAGE_MARGIN_MM`. */
const PAGE_MARGIN_MM = 10

/** Title band height, matching `pdfExport`'s `TITLE_BAND_MM`. */
const TITLE_BAND_MM = 12

export interface PrintPreviewProps {
  layout: PrintLayout
  /** Rendered inside the map area — usually a static map thumbnail or placeholder. */
  children?: ReactNode
  /** Preview width in CSS pixels; the height follows from the page ratio. */
  width?: number
}

export function PrintPreview({ layout, children, width = 320 }: PrintPreviewProps) {
  const page = pageDimensions(layout)
  const scale = width / page.width
  const height = page.height * scale

  const margin = PAGE_MARGIN_MM * scale
  const titleBand = layout.title ? TITLE_BAND_MM * scale : 0

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative shrink-0 border bg-white shadow-sm"
        style={{ width: `${width}px`, height: `${height}px` }}
        role="img"
        aria-label={`Preview of a ${layout.pageSize} ${layout.orientation} page${
          layout.title ? ` titled ${layout.title}` : ""
        }`}
      >
        {layout.title && (
          <div
            className="absolute flex items-center justify-center overflow-hidden"
            style={{ left: margin, right: margin, top: margin * 0.4, height: titleBand }}
          >
            <span className="truncate text-[10px] font-semibold text-neutral-900">
              {layout.title}
            </span>
          </div>
        )}

        {/* The map area, positioned exactly as `exportMapAsPdf` positions it. */}
        <div
          className="absolute overflow-hidden bg-neutral-100"
          style={{
            left: margin,
            top: margin + titleBand,
            right: margin,
            bottom: margin,
          }}
        >
          {children}

          {layout.showNorthArrow && (
            <span
              className="absolute right-1 top-1 text-[9px] font-bold text-neutral-900"
              aria-hidden="true"
            >
              ▲N
            </span>
          )}

          {layout.showScaleBar && (
            <span
              className="absolute bottom-1 left-1 border-x border-b border-neutral-900 text-[8px] text-neutral-900"
              style={{ width: "28%", height: "4px" }}
              aria-hidden="true"
            />
          )}

          {layout.showLegend && (
            <span
              className="absolute left-1 top-1 border border-neutral-400 bg-white/90"
              style={{ width: "24%", height: "22%" }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {layout.pageSize} {layout.orientation} — {page.width} × {page.height} mm
      </p>
    </div>
  )
}
