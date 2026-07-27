"use client"

import { useCallback, useId, useState } from "react"
import { Button } from "@/shared/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog"
import { WGS84_CODE } from "@/shared/contracts/crs.schema"
import type { ColumnMapping } from "@/shared/contracts/importJob.schema"
import { useImport } from "../hooks/useImport"
import { isBboxPlausible } from "../services/crsCatalog"
import { previewForCrs } from "../services/importPipeline"
import { guessCoordinateColumns } from "../services/parsers/csvParser"
import type {
  ImportMode,
  ImportSourceFormat,
  Position,
  PreflightResult,
} from "../types/importExport.types"
import {
  selectColumnMapping,
  selectCrs,
  selectImportDuplicates,
  selectImportError,
  selectMode,
  selectPreflight,
  selectProgress,
  selectStep,
  selectSummary,
  useImportStore,
} from "../store/importStore"
import { CrsPreview } from "./CrsPreview"
import { CrsSelector } from "./CrsSelector"
import { CsvColumnMapper } from "./CsvColumnMapper"
import { FileDropZone } from "./FileDropZone"
import { ImportPreviewTable } from "./ImportPreviewTable"
import { ImportProgress } from "./ImportProgress"
import { ImportSummaryPanel } from "./ImportSummaryPanel"

/**
 * A starting column mapping, pre-filled from the header names (FR-029).
 * Only ever a default — `CsvColumnMapper` always shows it and lets the user
 * change it, because a guess that silently became the mapping would be the
 * lat/lng swap this feature works hardest to prevent.
 */
function defaultMapping(columns: string[]): ColumnMapping {
  const guessed = guessCoordinateColumns(columns)
  return {
    latitudeColumn: guessed.latitudeColumn ?? "",
    longitudeColumn: guessed.longitudeColumn ?? "",
    delimiter: ",",
    hasHeaderRow: true,
    attributeColumns: [],
  }
}

/** The first position of each sampled feature, paired with `previewForCrs`'s output. */
function samplePreviewPositions(preflight: PreflightResult, limit = 3): Position[] {
  const positions: Position[] = []
  for (const feature of preflight.features) {
    const coordinates = feature.geometry.coordinates as unknown
    const first = firstPosition(coordinates)
    if (first) positions.push(first)
    if (positions.length >= limit) break
  }
  return positions
}

function firstPosition(coordinates: unknown): Position | null {
  if (!Array.isArray(coordinates)) return null
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    return [coordinates[0], coordinates[1]]
  }
  for (const child of coordinates) {
    const found = firstPosition(child)
    if (found) return found
  }
  return null
}

/**
 * The import stepper (specs/005-import-export, T118–T120; FR-005, FR-011).
 *
 * A shadcn `Dialog` driving `importStore`'s step machine:
 * file → (CSV mapping) → (CRS) → confirm → progress → summary.
 *
 * Presentational: every decision is a store action or a `useImport` call. The
 * dialog contains no `fetch`, no parsing, and no sequencing of its own
 * (Constitution Principle I).
 *
 * ## The confirmation gate (FR-005, FR-011)
 *
 * The `confirming` step is the gate, and it matters that it comes *after* the
 * whole file has been validated and *before* anything is written. Closing the
 * dialog here writes nothing — not because anything is cleaned up, but because no
 * request has been issued at all. That is why `preflight` and `confirm` are
 * separate calls rather than one.
 */

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  layerId: string
  layerName: string
  projectId: string
}

export function ImportDialog({
  open,
  onOpenChange,
  layerId,
  layerName,
  projectId,
}: ImportDialogProps) {
  const step = useImportStore(selectStep)
  const preflight = useImportStore(selectPreflight)
  const progress = useImportStore(selectProgress)
  const summary = useImportStore(selectSummary)
  const error = useImportStore(selectImportError)
  const crs = useImportStore(selectCrs)
  const mode = useImportStore(selectMode)
  const importDuplicates = useImportStore(selectImportDuplicates)

  const { preflight: runPreflight, confirm, cancel, rollback, reset } = useImport(layerId, projectId)

  const [isBusy, setIsBusy] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  /** Second acknowledgement required when the transformed extent looks wrong (SC-010). */
  const [crsAcknowledged, setCrsAcknowledged] = useState(false)

  const close = useCallback(() => {
    reset()
    setCrsAcknowledged(false)
    setIsBusy(false)
    setIsCancelling(false)
    // Releases the archive's `File` reference along with everything else, so a
    // large ZIP does not stay pinned after the dialog closes.
    setArchive(null)
    setChosenShapefile("")
    setEncoding("")
    setCsvPreview(null)
    onOpenChange(false)
  }, [reset, onOpenChange])

  /**
   * Shapefile-only choices, surfaced before the parse when an archive turns out
   * to hold more than one shapefile (FR-021) or to need an explicit encoding
   * (FR-020). Held locally rather than in the store because they are inputs to
   * one parse, not session state the rest of the flow reads.
   */
  const [archive, setArchive] = useState<{ file: File; shapefiles: string[] } | null>(null)
  const [chosenShapefile, setChosenShapefile] = useState<string>("")
  const [encoding, setEncoding] = useState<string>("")
  const shapefileSelectId = useId()
  const encodingSelectId = useId()

  /**
   * First rows of a CSV, read once when the file is chosen so the mapper and the
   * preview table have something to show before the full parse runs (FR-031).
   */
  const [csvPreview, setCsvPreview] = useState<{
    headers: string[]
    rows: Record<string, string>[]
  } | null>(null)
  const previewTableId = useId()

  const columnMapping = useImportStore(selectColumnMapping)
  /**
   * Columns available to the mapper. The pre-parse header preview is preferred:
   * for CSV the mapper is reached *before* any parse, because `parseCsv` cannot
   * run until it knows which columns hold the coordinates.
   */
  const mappableColumns = csvPreview?.headers ?? preflight?.columns ?? null
  const effectiveMapping = columnMapping ?? (mappableColumns ? defaultMapping(mappableColumns) : null)
  const isMappingComplete =
    effectiveMapping !== null &&
    effectiveMapping.latitudeColumn !== "" &&
    effectiveMapping.longitudeColumn !== "" &&
    effectiveMapping.latitudeColumn !== effectiveMapping.longitudeColumn

  const startPreflight = useCallback(
    async (
      file: File,
      format: ImportSourceFormat,
      archiveOptions: { shapefileName?: string; encoding?: string } = {},
      csvOptions: { columnMapping?: ColumnMapping } = {},
    ) => {
      setIsBusy(true)
      try {
        await runPreflight(file, { format, ...archiveOptions, ...csvOptions })
      } catch {
        // `useImport` has already written a user-facing message to the store.
      } finally {
        setIsBusy(false)
      }
    },
    [runPreflight],
  )

  const handleFileAccepted = useCallback(
    async (file: File, format: ImportSourceFormat) => {
      // A CSV's first rows are read up front so `CsvColumnMapper` and
      // `ImportPreviewTable` can show the mapping's effect before the full parse
      // (FR-029, FR-031). Only a 64 KB prefix is read, so this is cheap even for
      // a 50 MB file.
      if (format === "csv") {
        setIsBusy(true)
        try {
          const { previewCsv } = await import("../services/parsers/csvParser")
          const preview = await previewCsv(file)

          useImportStore.getState().setFile(file, "csv")
          setCsvPreview(preview)
          useImportStore.getState().setColumnMapping({
            ...defaultMapping(preview.headers),
            delimiter: preview.delimiter,
          })
          // Straight to the mapper: no parse has happened yet, and none can until
          // the coordinate columns are settled.
          useImportStore.getState().setStep("mapping")
        } catch (error) {
          useImportStore
            .getState()
            .setError(error instanceof Error ? error.message : "The file could not be read.")
        } finally {
          setIsBusy(false)
        }
        return
      }

      // A ZIP is inspected before parsing so the user can be asked which
      // shapefile to read, rather than silently getting the first one (FR-021).
      if (format === "shapefile") {
        setIsBusy(true)
        try {
          const { listShapefilesInArchive } = await import("../services/parsers/shapefileParser")
          const shapefiles = await listShapefilesInArchive(file)
          if (shapefiles.length > 1) {
            setArchive({ file, shapefiles })
            setChosenShapefile(shapefiles[0])
            setIsBusy(false)
            return
          }
        } catch (error) {
          useImportStore
            .getState()
            .setError(error instanceof Error ? error.message : "The archive could not be read.")
          setIsBusy(false)
          return
        }
        setIsBusy(false)
      }

      await startPreflight(file, format)
    },
    [startPreflight],
  )

  const handleConfirm = useCallback(async () => {
    setIsBusy(true)
    try {
      await confirm()
    } catch {
      // Reported through the store; the summary step explains what happened.
    } finally {
      setIsBusy(false)
    }
  }, [confirm])

  const handleCancel = useCallback(async () => {
    setIsCancelling(true)
    try {
      await cancel()
    } finally {
      setIsCancelling(false)
    }
  }, [cancel])

  // An implausible transformed extent blocks Confirm until acknowledged: this is
  // the guard against the classic wrong-CRS disaster, where projected
  // coordinates are imported as if they were degrees (FR-065, SC-010).
  const needsCrsAcknowledgement = crs !== null && !crs.bboxPlausible
  const canConfirm = preflight !== null && crs !== null && (!needsCrsAcknowledgement || crsAcknowledged)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A running import is not abandoned by clicking away — Cancel is the
        // explicit affordance, and it has to tell the server.
        if (!next && step === "running") return
        if (!next) close()
        else onOpenChange(true)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import into “{layerName}”</DialogTitle>
          <DialogDescription>
            Features are <strong>added</strong> to this layer. Nothing already in it is changed or
            removed.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {step === "idle" && !archive && (
            <FileDropZone
              onFileAccepted={(file, format) => void handleFileAccepted(file, format)}
              disabled={isBusy}
            />
          )}

          {step === "idle" && archive && (
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                <strong>{archive.file.name}</strong> contains {archive.shapefiles.length} shapefiles.
                Choose which one to import.
              </p>

              <div className="space-y-1">
                <label htmlFor={shapefileSelectId} className="text-sm font-medium">
                  Shapefile
                </label>
                <select
                  id={shapefileSelectId}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={chosenShapefile}
                  onChange={(event) => setChosenShapefile(event.target.value)}
                >
                  {archive.shapefiles.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor={encodingSelectId} className="text-sm font-medium">
                  Attribute text encoding
                </label>
                <select
                  id={encodingSelectId}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={encoding}
                  onChange={(event) => setEncoding(event.target.value)}
                >
                  {/* Empty means "use the archive's own .cpg", which is right
                      whenever one is present (FR-020). */}
                  <option value="">Use the archive&rsquo;s declared encoding</option>
                  <option value="UTF-8">UTF-8</option>
                  <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
                  <option value="windows-1252">Windows-1252</option>
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close} disabled={isBusy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isBusy || !chosenShapefile}
                  onClick={() => {
                    const target = archive
                    setArchive(null)
                    void startPreflight(target.file, "shapefile", {
                      shapefileName: chosenShapefile,
                      encoding: encoding || undefined,
                    })
                  }}
                >
                  {isBusy ? "Reading…" : "Read this shapefile"}
                </Button>
              </div>
            </div>
          )}

          {step === "parsing" && (
            <ImportProgress progress={progress ?? { processed: 0, total: 0 }} />
          )}

          {step === "mapping" && mappableColumns && effectiveMapping && (
            <div className="flex flex-col gap-4">
              <CsvColumnMapper
                columns={mappableColumns}
                value={effectiveMapping}
                previewId={previewTableId}
                onChange={(mapping) => useImportStore.getState().setColumnMapping(mapping)}
              />
              <ImportPreviewTable
                id={previewTableId}
                columns={mappableColumns}
                rows={csvPreview?.rows ?? []}
                mapping={effectiveMapping}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close} disabled={isBusy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isBusy || !isMappingComplete}
                  onClick={() => {
                    const file = useImportStore.getState().file
                    const mapping = useImportStore.getState().columnMapping
                    if (file && mapping) {
                      void startPreflight(file, "csv", {}, { columnMapping: mapping })
                    }
                  }}
                >
                  {isBusy ? "Reading…" : "Read these columns"}
                </Button>
              </div>
            </div>
          )}

          {step === "crs" && preflight && (
            <div className="flex flex-col gap-4">
              <CrsSelector
                value={crs?.code ?? WGS84_CODE}
                customDefinition={crs?.custom}
                detectedFrom={preflight.detectedCrs ? "file" : null}
                disabled={isBusy}
                onChange={(code, custom) => {
                  // Re-previewing on every change is what makes the plausibility
                  // warning responsive rather than a one-shot check at parse time.
                  const preview = previewForCrs(preflight.features, code, custom)
                  useImportStore.getState().setCrs({
                    code,
                    custom,
                    bboxPlausible: isBboxPlausible(preview.bbox),
                  })
                }}
              />

              {crs && (
                <CrsPreview
                  source={samplePreviewPositions(preflight)}
                  transformed={previewForCrs(preflight.features, crs.code, crs.custom).positions}
                  bbox={previewForCrs(preflight.features, crs.code, crs.custom).bbox}
                  plausible={crs.bboxPlausible}
                  crsCode={crs.code}
                />
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close} disabled={isBusy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isBusy || !crs}
                  onClick={() => useImportStore.getState().setStep("confirming")}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === "confirming" && preflight && (
            <ConfirmationGate
              counts={{
                totalRead: preflight.totalFeatures,
                toImport:
                  preflight.totalFeatures -
                  preflight.counts.rejected -
                  (importDuplicates ? 0 : preflight.counts.duplicate),
                rejected: preflight.counts.rejected,
                duplicate: preflight.counts.duplicate,
                repaired: preflight.counts.repaired,
              }}
              crsCode={crs?.code ?? "unknown"}
              mode={mode}
              onModeChange={(next) => useImportStore.getState().setMode(next)}
              importDuplicates={importDuplicates}
              onImportDuplicatesChange={(next) =>
                useImportStore.getState().setImportDuplicates(next)
              }
              needsCrsAcknowledgement={needsCrsAcknowledgement}
              crsAcknowledged={crsAcknowledged}
              onCrsAcknowledgedChange={setCrsAcknowledged}
            />
          )}

          {step === "running" && (
            <ImportProgress
              progress={progress ?? { processed: 0, total: preflight?.totalFeatures ?? 0 }}
              onCancel={() => void handleCancel()}
              isCancelling={isCancelling}
            />
          )}

          {step === "done" && summary && (
            <ImportSummaryPanel
              summary={summary}
              notice={error}
              onUndo={(jobId) => rollback(jobId)}
              onDone={close}
            />
          )}

          {step === "idle" && error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        {step === "confirming" && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={isBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={!canConfirm || isBusy}>
              {isBusy ? "Starting…" : "Import features"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// The confirmation gate (T119)
// ---------------------------------------------------------------------------

interface ConfirmationGateProps {
  counts: {
    totalRead: number
    toImport: number
    rejected: number
    duplicate: number
    repaired: number
  }
  crsCode: string
  mode: ImportMode
  onModeChange: (mode: ImportMode) => void
  importDuplicates: boolean
  onImportDuplicatesChange: (value: boolean) => void
  needsCrsAcknowledgement: boolean
  crsAcknowledged: boolean
  onCrsAcknowledgedChange: (value: boolean) => void
}

/**
 * What is about to happen, stated before anything is written (FR-005, FR-010).
 *
 * The counts shown are the preflight's exact counts, not estimates: the whole
 * file has already been read and validated by the time this renders, which is
 * what makes the gate worth having.
 */
function ConfirmationGate({
  counts,
  crsCode,
  mode,
  onModeChange,
  importDuplicates,
  onImportDuplicatesChange,
  needsCrsAcknowledgement,
  crsAcknowledged,
  onCrsAcknowledgedChange,
}: ConfirmationGateProps) {
  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y rounded-md border text-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <dt>Features read</dt>
          <dd className="tabular-nums font-medium">{counts.totalRead.toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <dt>Will be imported</dt>
          <dd className="tabular-nums font-medium">{counts.toImport.toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <dt className={counts.rejected > 0 ? "text-destructive" : "text-muted-foreground"}>
            Rejected
          </dt>
          <dd className="tabular-nums">{counts.rejected.toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <dt className="text-muted-foreground">
            {importDuplicates ? "Duplicates (will be imported)" : "Duplicates (will be skipped)"}
          </dt>
          <dd className="tabular-nums">{counts.duplicate.toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <dt className="text-muted-foreground">Geometry repaired</dt>
          <dd className="tabular-nums">{counts.repaired.toLocaleString()}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <dt className="text-muted-foreground">Coordinate system</dt>
          <dd className="font-mono text-xs">{crsCode}</dd>
        </div>
      </dl>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">If some features are invalid</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="import-mode"
            className="mt-1"
            checked={mode === "lenient"}
            onChange={() => onModeChange("lenient")}
          />
          <span>
            <span className="font-medium">Import what is valid</span>
            <span className="block text-xs text-muted-foreground">
              Valid features are imported; the rest are reported. Recommended.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="import-mode"
            className="mt-1"
            checked={mode === "strict"}
            onChange={() => onModeChange("strict")}
          />
          <span>
            <span className="font-medium">Import nothing unless everything is valid</span>
            <span className="block text-xs text-muted-foreground">
              If any feature is rejected, the whole import is undone.
            </span>
          </span>
        </label>
      </fieldset>

      {counts.duplicate > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={importDuplicates}
            onChange={(event) => onImportDuplicatesChange(event.target.checked)}
          />
          <span>
            <span className="font-medium">
              Import the {counts.duplicate.toLocaleString()} duplicate
              {counts.duplicate === 1 ? "" : "s"} anyway
            </span>
            <span className="block text-xs text-muted-foreground">
              Duplicates are skipped by default (FR-056). Tick this to import every copy.
            </span>
          </span>
        </label>
      )}

      {needsCrsAcknowledgement && (
        <div role="alert" className="space-y-2 rounded-md bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">
            These coordinates do not look like they are in {crsCode}.
          </p>
          <p className="text-xs text-destructive/90">
            After transforming, the data falls outside valid geographic bounds — usually a sign the
            coordinate system is wrong. Importing anyway will place the features in the wrong place
            on the map.
          </p>
          <label className="flex items-center gap-2 text-sm text-destructive">
            <input
              type="checkbox"
              checked={crsAcknowledged}
              onChange={(event) => onCrsAcknowledgedChange(event.target.checked)}
            />
            I have checked the coordinate system and want to continue.
          </label>
        </div>
      )}
    </div>
  )
}
