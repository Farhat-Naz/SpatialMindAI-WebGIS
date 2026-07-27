"use client"

import { useId } from "react"
import type { ColumnMapping } from "@/shared/contracts/importJob.schema"

/**
 * CSV column mapping (specs/005-import-export, Phase 11; FR-029–FR-031, FR-091).
 *
 * Every control is a labelled native element with `aria-describedby` pointing at
 * the preview, because SC-014 requires the whole CSV flow to be completable by
 * keyboard and screen reader alone. That is not incidental: a CSV import is the
 * one path where the user, not the file, decides what the geometry *is*, so
 * getting the mapping wrong is not a cosmetic failure.
 */

export interface CsvColumnMapperProps {
  columns: string[]
  value: ColumnMapping
  onChange: (mapping: ColumnMapping) => void
  /** Id of the preview table, associated so the mapping's effect is announced. */
  previewId?: string
  disabled?: boolean
}

const DELIMITERS: { value: string; label: string }[] = [
  { value: ",", label: "Comma  ,  " },
  { value: ";", label: "Semicolon  ;  " },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe  |  " },
]

export function CsvColumnMapper({
  columns,
  value,
  onChange,
  previewId,
  disabled = false,
}: CsvColumnMapperProps) {
  const latId = useId()
  const lonId = useId()
  const delimiterId = useId()
  const headerId = useId()
  const attributesId = useId()

  const patch = (changes: Partial<ColumnMapping>) => onChange({ ...value, ...changes })

  // Guarding against the single most damaging mistake this form allows: picking
  // the same column for both axes silently produces a diagonal line of features.
  const sameColumn =
    value.latitudeColumn !== "" && value.latitudeColumn === value.longitudeColumn

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={latId} className="text-sm font-medium">
            Latitude column
          </label>
          <select
            id={latId}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={value.latitudeColumn}
            disabled={disabled}
            aria-describedby={previewId}
            aria-invalid={sameColumn}
            onChange={(event) => patch({ latitudeColumn: event.target.value })}
          >
            <option value="">Choose a column…</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor={lonId} className="text-sm font-medium">
            Longitude column
          </label>
          <select
            id={lonId}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={value.longitudeColumn}
            disabled={disabled}
            aria-describedby={previewId}
            aria-invalid={sameColumn}
            onChange={(event) => patch({ longitudeColumn: event.target.value })}
          >
            <option value="">Choose a column…</option>
            {columns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sameColumn && (
        <p role="alert" className="text-sm text-destructive">
          Latitude and longitude cannot be the same column — every feature would sit on a diagonal
          line.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={delimiterId} className="text-sm font-medium">
            Column separator
          </label>
          <select
            id={delimiterId}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={value.delimiter}
            disabled={disabled}
            onChange={(event) => patch({ delimiter: event.target.value })}
          >
            {DELIMITERS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label.trim()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <label htmlFor={headerId} className="flex items-center gap-2 text-sm">
            <input
              id={headerId}
              type="checkbox"
              checked={value.hasHeaderRow}
              disabled={disabled}
              onChange={(event) => patch({ hasHeaderRow: event.target.checked })}
            />
            First row is column names
          </label>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend id={attributesId} className="text-sm font-medium">
          Columns to import as attributes
        </legend>
        <p className="text-xs text-muted-foreground">
          Leave all unchecked to import every column except the two coordinate columns.
        </p>
        <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2">
          {columns
            .filter((column) => column !== value.latitudeColumn && column !== value.longitudeColumn)
            .map((column) => (
              <label key={column} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.attributeColumns.includes(column)}
                  disabled={disabled}
                  onChange={(event) =>
                    patch({
                      attributeColumns: event.target.checked
                        ? [...value.attributeColumns, column]
                        : value.attributeColumns.filter((name) => name !== column),
                    })
                  }
                />
                <span className="truncate font-mono text-xs">{column}</span>
              </label>
            ))}
        </div>
      </fieldset>
    </div>
  )
}
