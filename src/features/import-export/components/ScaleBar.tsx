"use client"

import { chooseScaleBar } from "../services/pdfExport"

/**
 * Ground-distance-accurate scale bar (specs/005-import-export, Phase 13; FR-047).
 *
 * The bar's **width is derived from the ground distance**, not the reverse: a
 * round distance is chosen that fits the available width, and the bar is drawn
 * that many pixels long. Doing it the other way — fixing the width and labelling
 * whatever distance it happens to represent — produces labels like "473 m" that
 * are unusable for measuring anything.
 *
 * The same `chooseScaleBar` helper drives the PDF's vector scale bar, so the
 * printed page and the screen agree by construction rather than by coincidence.
 */

export interface ScaleBarProps {
  /** Ground metres per screen pixel at the map's current centre and zoom. */
  metersPerPixel: number
  /** Widest the bar may be, in pixels. */
  maxWidthPx?: number
  className?: string
}

export function ScaleBar({ metersPerPixel, maxWidthPx = 160, className }: ScaleBarProps) {
  const bar = chooseScaleBar(metersPerPixel, maxWidthPx)

  if (!bar) {
    // No plausible round distance fits — better to render nothing than a bar that
    // misrepresents distance.
    return null
  }

  return (
    <div
      className={`inline-flex flex-col gap-0.5 rounded bg-background/80 px-2 py-1 ${className ?? ""}`}
      // One accessible name carrying the whole fact, so a screen reader gets the
      // measurement rather than a decorative graphic.
      role="img"
      aria-label={`Scale bar: ${bar.label}`}
    >
      <span className="text-[10px] leading-none tabular-nums">{bar.label}</span>
      <span
        className="relative block border-x-2 border-b-2 border-foreground"
        style={{ width: `${Math.round(bar.widthPx)}px`, height: "6px" }}
        aria-hidden="true"
      />
    </div>
  )
}
