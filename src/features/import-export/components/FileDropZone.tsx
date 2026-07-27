"use client"

import { useId, useRef, useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { IMPORT_MAX_FILE_BYTES } from "../types/importExport.constants"
import type { ImportSourceFormat } from "../types/importExport.types"
import { assertFileSize, detectFormat, formatBytes } from "../utils/fileGuards"

/**
 * File selection for import (specs/005-import-export, T113, T114; FR-004,
 * FR-081, FR-087).
 *
 * Presentational: it validates, then hands the caller a file and the format
 * detected from its **content**. It performs no parse, no fetch, and touches no
 * store (Constitution Principle I).
 *
 * ## Keyboard operability (FR-087)
 *
 * The hidden-`<input type="file">` behind a labelled `<Button>` pattern is
 * carried over from `ImportExportControls`, deliberately rather than
 * reinvented: a native file input styled as a drop zone is not reliably
 * keyboard-activatable across browsers, whereas a real `<button>` that clicks a
 * hidden input is. The drop zone is an *additional* affordance layered on top,
 * never the only one.
 */

interface FileDropZoneProps {
  /** Called with a validated file and its content-detected format. */
  onFileAccepted: (file: File, format: ImportSourceFormat) => void
  /** Called when a file is rejected, with a message safe to display. */
  onFileRejected?: (message: string) => void
  disabled?: boolean
  /** Server-configured limit, when known; falls back to the client mirror constant. */
  maxBytes?: number
}

/** Extensions offered in the picker. Advisory only — the content check is authoritative. */
const ACCEPTED_EXTENSIONS = ".geojson,.json,.zip,.kml,.kmz,.csv,.tsv,.txt"

export function FileDropZone({
  onFileAccepted,
  onFileRejected,
  disabled = false,
  maxBytes = IMPORT_MAX_FILE_BYTES,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const errorId = useId()

  function reject(text: string): void {
    setMessage(text)
    onFileRejected?.(text)
  }

  async function handleFile(file: File): Promise<void> {
    setMessage(null)

    // Size first, before any read: a 200 MB file must be refused in
    // milliseconds rather than after being loaded (FR-081).
    const sizeGuard = assertFileSize(file, maxBytes)
    if (!sizeGuard.ok) {
      reject(sizeGuard.message ?? "This file cannot be imported.")
      return
    }

    // Format by content, never by extension: a `.txt` renamed `.geojson`, or a
    // `.geojson` holding XML, is caught here rather than failing confusingly
    // inside a parser (FR-004). No network request is issued either way.
    const format = await detectFormat(file)
    if (!format) {
      reject(
        `"${file.name}" is not a format this platform can read. ` +
          "Supported formats are GeoJSON, zipped Shapefile, KML, KMZ, and CSV.",
      )
      return
    }

    onFileAccepted(file, format)
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        // A drop target is not an interactive control — the button below is.
        // Giving this a role/tabindex would put a keyboard stop on something a
        // keyboard user cannot drop onto.
        onDragOver={(event) => {
          if (disabled) return
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          if (disabled) return
          const file = event.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        className={[
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          disabled ? "opacity-50" : "",
        ].join(" ")}
      >
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden="true" />

        <div className="space-y-1">
          <p className="text-sm font-medium">Drag a file here, or choose one</p>
          <p className="text-xs text-muted-foreground">
            GeoJSON, zipped Shapefile, KML, KMZ, or CSV — up to {formatBytes(maxBytes)}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          aria-label="Choose a file to import"
          aria-describedby={message ? errorId : undefined}
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Cleared so choosing the same file twice in a row still fires.
            event.target.value = ""
            if (file) void handleFile(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
      </div>

      {message && (
        // `role="alert"` because this message blocks progress to the next step
        // (FR-090), and `aria-describedby` ties it back to the input above.
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}
