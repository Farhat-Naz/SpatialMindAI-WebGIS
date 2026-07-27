"use client"

import type { ColumnMapping } from "@/shared/contracts/importJob.schema"

/**
 * First-rows preview with resulting coordinates (specs/005-import-export,
 * Phase 11; FR-031).
 *
 * Shows the mapping's *effect*, not just its configuration: the two coordinate
 * columns are called out, and the resulting position is displayed beside them. A
 * user who has swapped latitude and longitude can see it here — the numbers will
 * be obviously the wrong way round — which is far more reliable than expecting
 * them to reason about it from two dropdowns.
 */

export interface ImportPreviewTableProps {
  id?: string
  columns: string[]
  rows: Record<string, string>[]
  mapping: Pick<ColumnMapping, "latitudeColumn" | "longitudeColumn">
  maxRows?: number
}

/** Parses a preview cell the same way the parser will, including comma decimals. */
function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const candidate = trimmed.includes(",") && !trimmed.includes(".") ? trimmed.replace(",", ".") : trimmed
  const value = Number(candidate)
  return Number.isFinite(value) ? value : null
}

export function ImportPreviewTable({
  id,
  columns,
  rows,
  mapping,
  maxRows = 5,
}: ImportPreviewTableProps) {
  const shown = rows.slice(0, maxRows)

  if (shown.length === 0) {
    return (
      <p id={id} className="text-sm text-muted-foreground">
        This file has no data rows to preview.
      </p>
    )
  }

  return (
    <div id={id} className="space-y-1">
      <p className="text-sm font-medium">
        First {shown.length} row{shown.length === 1 ? "" : "s"}
      </p>

      {/* Scrolls inside its own container so a wide CSV never makes the dialog
          scroll horizontally. */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-xs" aria-label="Preview of the first rows">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              {columns.map((column) => {
                const isCoordinate =
                  column === mapping.latitudeColumn || column === mapping.longitudeColumn
                return (
                  <th
                    key={column}
                    scope="col"
                    className={`whitespace-nowrap px-2 py-1 font-medium ${
                      isCoordinate ? "text-primary" : ""
                    }`}
                  >
                    {column}
                    {column === mapping.latitudeColumn && (
                      <span className="ml-1 font-normal text-muted-foreground">(lat)</span>
                    )}
                    {column === mapping.longitudeColumn && (
                      <span className="ml-1 font-normal text-muted-foreground">(lon)</span>
                    )}
                  </th>
                )
              })}
              <th scope="col" className="whitespace-nowrap px-2 py-1 font-medium">
                Resulting position
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => {
              const lat = toNumber(row[mapping.latitudeColumn])
              const lon = toNumber(row[mapping.longitudeColumn])

              return (
                <tr key={index} className="border-b last:border-0">
                  {columns.map((column) => (
                    <td key={column} className="max-w-[12rem] truncate px-2 py-1 font-mono">
                      {row[column] ?? ""}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-1 font-mono">
                    {lat !== null && lon !== null ? (
                      // Displayed lon, lat — GeoJSON's own order — so the preview
                      // matches what actually gets stored.
                      `${lon}, ${lat}`
                    ) : (
                      <span className="text-destructive">no coordinate</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
