"use client"

import type { LegendEntry } from "../services/pdfExport"

/**
 * Visible-layer legend (specs/005-import-export, Phase 13; FR-048).
 *
 * Takes the entries it renders rather than reading a layer store, for two
 * reasons: it is drawn both on screen and — as vectors — into the PDF, and the
 * PDF path has no React context to read from; and keeping it presentational means
 * the printed legend and the on-screen one are fed from one list, so they cannot
 * disagree about which layers were visible.
 *
 * Each swatch carries its colour in the accessible name as well as the visual, so
 * the legend is not colour-only information.
 */

export interface MapLegendProps {
  entries: LegendEntry[]
  title?: string
  className?: string
}

export function MapLegend({ entries, title = "Legend", className }: MapLegendProps) {
  if (entries.length === 0) return null

  return (
    <section
      aria-label={title}
      className={`inline-block rounded border bg-background/90 px-3 py-2 text-xs ${className ?? ""}`}
    >
      <h3 className="mb-1 font-medium">{title}</h3>
      <ul className="flex flex-col gap-1">
        {entries.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm border border-foreground/20"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            <span className="truncate">{entry.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
