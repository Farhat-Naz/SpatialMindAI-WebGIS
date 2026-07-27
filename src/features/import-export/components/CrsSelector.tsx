"use client"

import { useId, useState } from "react"
import { CUSTOM_CRS_CODE } from "@/shared/contracts/crs.schema"
import { CRS_CATALOG, parseCustomCrs } from "../services/crsCatalog"

/**
 * Coordinate-system chooser (specs/005-import-export, Phase 14; FR-060–FR-063,
 * FR-091).
 *
 * Presentational: it reports a selection and never transforms anything itself.
 * The transformation *preview* is `CrsPreview`'s job, and the persisted transform
 * is PostGIS's.
 *
 * A detected system is shown as the current value with its provenance stated
 * (FR-061), because "we read this from your `.prj`" and "we guessed" need to be
 * distinguishable — a user who knows the file is mislabelled has to be able to
 * see that the value came from the file rather than from them.
 */

export interface CrsSelectorProps {
  /** The currently selected authority code, or `"CUSTOM"`. */
  value: string
  /** The custom definition — proj4 or WKT — when `value` is `"CUSTOM"`. */
  customDefinition?: string
  /** Where the current value came from, so the UI can say so (FR-061). */
  detectedFrom?: "file" | "default" | null
  onChange: (code: string, customDefinition?: string) => void
  disabled?: boolean
}

export function CrsSelector({
  value,
  customDefinition,
  detectedFrom = null,
  onChange,
  disabled = false,
}: CrsSelectorProps) {
  const selectId = useId()
  const customId = useId()
  const helpId = useId()

  const [draft, setDraft] = useState(customDefinition ?? "")
  const [customError, setCustomError] = useState<string | null>(null)

  const isCustom = value === CUSTOM_CRS_CODE

  /**
   * Validates a custom definition before accepting it (FR-063).
   *
   * Parse-checked on the client first so an unusable definition is caught while
   * the user is still looking at the field, rather than surfacing as a failed job
   * creation after they have confirmed. The server re-checks it against PostGIS
   * regardless — that check is the guarantee, this one is the courtesy.
   */
  function commitCustom(definition: string): void {
    const trimmed = definition.trim()
    if (trimmed.length === 0) {
      setCustomError("Enter a proj4 string or a WKT definition.")
      return
    }
    if (!parseCustomCrs(trimmed)) {
      setCustomError(
        "This definition could not be read as either a proj4 string or WKT. " +
          "A proj4 string starts with “+proj=”.",
      )
      return
    }
    setCustomError(null)
    onChange(CUSTOM_CRS_CODE, trimmed)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <label htmlFor={selectId} className="text-sm font-medium">
          Source coordinate system
        </label>
        <select
          id={selectId}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={value}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(event) => {
            const next = event.target.value
            if (next === CUSTOM_CRS_CODE) {
              // Held until a definition is supplied, so the parent never sees a
              // CUSTOM selection with nothing to transform with.
              setCustomError(null)
              onChange(CUSTOM_CRS_CODE, draft.trim() || undefined)
            } else {
              onChange(next)
            }
          }}
        >
          {CRS_CATALOG.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.code} — {entry.name}
            </option>
          ))}
          <option value={CUSTOM_CRS_CODE}>Custom definition…</option>
        </select>

        <p id={helpId} className="text-xs text-muted-foreground">
          {detectedFrom === "file"
            ? "Read from the file’s own projection information. Change it if the file is mislabelled."
            : detectedFrom === "default"
              ? "This format does not record a coordinate system, so this is the usual default. Check it before importing."
              : "This file does not say what coordinate system it uses — choose the one it was created in."}
        </p>
      </div>

      {isCustom && (
        <div className="space-y-1">
          <label htmlFor={customId} className="text-sm font-medium">
            Custom definition (proj4 or WKT)
          </label>
          <textarea
            id={customId}
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder="+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 …"
            value={draft}
            disabled={disabled}
            aria-invalid={customError !== null}
            aria-describedby={customError ? `${customId}-error` : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commitCustom(draft)}
          />
          {customError && (
            <p id={`${customId}-error`} role="alert" className="text-sm text-destructive">
              {customError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
