"use client"

import { useCallback, useEffect, useId, useMemo, useState } from "react"
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
import { useExport } from "../hooks/useExport"
import { CRS_CATALOG } from "../services/crsCatalog"
import { inspectShapeClasses } from "../services/exportWriters"
import { LARGE_EXPORT_FEATURE_THRESHOLD } from "../types/exportConstants"
import type { ExportFormat, ExportScope, ExportSource } from "../types/importExport.types"
import {
  selectExportError,
  selectFormat,
  selectHasMixedGeometryWarning,
  selectOutputCrs,
  selectScope,
  selectShapeClasses,
  useExportStore,
} from "../store/exportStore"
import { exportErrorMessages } from "../utils/exportErrors"

/**
 * Export configuration (specs/005-import-export, Phase 12; FR-034–FR-043).
 *
 * Presentational: scope, format, and output CRS are `exportStore` fields, and the
 * work is `useExport`'s. The dialog performs no fetch and runs no writer itself
 * (Constitution Principle I).
 *
 * The export **runs entirely in the browser**; the server only logs the finished
 * attempt (007 research Decision 10, preserved by research.md Decision 21).
 */

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  layerId: string
  layerName: string
  projectId: string
  projectName?: string
  /**
   * Currently selected feature ids, read from Map Editing's selection store by
   * the caller. Passed in rather than duplicated into `exportStore`, so the two
   * cannot disagree while the dialog is open (contracts/client-api.md).
   */
  selectedFeatureIds?: string[]
  /** Rough feature count for the large-export warning, when the caller knows it. */
  featureCount?: number
}

const FORMAT_LABELS: Record<Exclude<ExportFormat, "pdf">, string> = {
  geojson: "GeoJSON",
  shapefile: "Shapefile (zipped)",
  csv: "CSV",
  kml: "KML",
}

export function ExportDialog({
  open,
  onOpenChange,
  layerId,
  layerName,
  projectId,
  projectName,
  selectedFeatureIds = [],
  featureCount,
}: ExportDialogProps) {
  const scope = useExportStore(selectScope)
  const format = useExportStore(selectFormat)
  const outputCrs = useExportStore(selectOutputCrs)
  const shapeClasses = useExportStore(selectShapeClasses)
  const hasMixedGeometry = useExportStore(selectHasMixedGeometryWarning)
  const storeError = useExportStore(selectExportError)

  const exportMutation = useExport(projectId)
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  /**
   * The completed export, shown as a summary instead of closing the dialog
   * (T244; FR-076). Built from the same values `useExport` logged to history,
   * so the two cannot disagree.
   */
  const [outcome, setOutcome] = useState<{
    format: ExportFormat
    scope: ExportScope
    featureCount: number
    layerCount?: number
    outputCrs: string
    filename: string
  } | null>(null)
  const scopeId = useId()
  const formatId = useId()
  const crsId = useId()

  /**
   * The source the writers read from, per the chosen scope (FR-035).
   *
   * Memoized so it is a stable dependency for the inspection effect and the
   * export callback below. Keyed on the joined selection rather than its array
   * identity, because the caller reads that array from Map Editing's selection
   * store and re-creates it on every selection change.
   */
  const selectionKey = selectedFeatureIds.join(",")
  const source: ExportSource = useMemo(
    () =>
      scope === "project"
        ? { kind: "project", projectId, projectName: projectName ?? "project" }
        : scope === "selection"
          ? { kind: "selection", featureIds: selectionKey ? selectionKey.split(",") : [], layerId, layerName }
          : { kind: "layer", layerId, layerName },
    [scope, projectId, projectName, selectionKey, layerId, layerName],
  )

  // Geometry classes are inspected when Shapefile is chosen, so the
  // mixed-geometry warning appears **before** the download rather than being
  // discovered when the archive is opened (FR-038).
  useEffect(() => {
    if (!open || format !== "shapefile" || scope === "project") return
    let cancelled = false

    void inspectShapeClasses(source)
      .then((classes) => {
        if (!cancelled) useExportStore.getState().setShapeClasses(classes)
      })
      .catch(() => {
        // A failed inspection only costs the advance warning; the export itself
        // is unaffected, so this must not surface as an error.
      })

    return () => {
      cancelled = true
    }
  }, [open, format, scope, source])

  const selectionEmpty = scope === "selection" && selectedFeatureIds.length === 0
  const isLarge = (featureCount ?? 0) > LARGE_EXPORT_FEATURE_THRESHOLD

  const handleExport = useCallback(async () => {
    setProgress(null)
    try {
      const result = await exportMutation.mutateAsync({
        source,
        format,
        scope,
        outputCrs,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      })
      setOutcome({
        format,
        scope,
        featureCount: result.featureCount,
        layerCount: result.layerCount,
        outputCrs,
        filename: result.filename,
      })
    } catch (error) {
      useExportStore
        .getState()
        .setError(error instanceof Error ? error.message : exportErrorMessages.writerFailed(format))
    } finally {
      setProgress(null)
    }
  }, [exportMutation, source, format, scope, outputCrs])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            The file is produced in your browser and downloaded directly — nothing is uploaded.
          </DialogDescription>
        </DialogHeader>

        {outcome && (
          <div className="flex flex-col gap-3 py-2" role="status" aria-live="polite">
            <p className="text-sm font-medium">Export complete</p>
            <dl className="divide-y rounded-md border text-sm">
              <div className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted-foreground">File</dt>
                <dd className="font-mono text-xs">{outcome.filename}</dd>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted-foreground">Format / scope</dt>
                <dd>
                  {outcome.format.toUpperCase()} · {outcome.scope}
                </dd>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted-foreground">Features</dt>
                <dd className="tabular-nums font-medium">{outcome.featureCount.toLocaleString()}</dd>
              </div>
              {outcome.layerCount !== undefined && (
                <div className="flex items-center justify-between px-3 py-2">
                  <dt className="text-muted-foreground">Layers in archive</dt>
                  <dd className="tabular-nums">{outcome.layerCount}</dd>
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted-foreground">Coordinate system</dt>
                <dd className="font-mono text-xs">{outcome.outputCrs}</dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOutcome(null)}>
                Export another
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}

        {!outcome && (
        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-1">
            <label htmlFor={scopeId} className="text-sm font-medium">
              What to export
            </label>
            <select
              id={scopeId}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={scope}
              onChange={(event) => useExportStore.getState().setScope(event.target.value as ExportScope)}
            >
              <option value="layer">This layer — {layerName}</option>
              <option value="selection">
                Current selection ({selectedFeatureIds.length} feature
                {selectedFeatureIds.length === 1 ? "" : "s"})
              </option>
              <option value="project">Every layer in this project</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor={formatId} className="text-sm font-medium">
              Format
            </label>
            <select
              id={formatId}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={format}
              disabled={scope === "project"}
              onChange={(event) =>
                useExportStore.getState().setFormat(event.target.value as ExportFormat)
              }
            >
              {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {scope === "project" && (
              <p className="text-xs text-muted-foreground">
                A project export is a ZIP of one GeoJSON file per layer, plus a manifest.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor={crsId} className="text-sm font-medium">
              Output coordinate system
            </label>
            <select
              id={crsId}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={outputCrs}
              onChange={(event) => useExportStore.getState().setOutputCrs(event.target.value)}
            >
              {CRS_CATALOG.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.code} — {entry.name}
                </option>
              ))}
            </select>
            {outputCrs !== WGS84_CODE && (
              <p className="text-xs text-muted-foreground">
                Coordinates are transformed on export. The stored data stays in {WGS84_CODE}.
              </p>
            )}
          </div>

          {hasMixedGeometry && shapeClasses && (
            <p role="status" className="rounded-md bg-muted p-3 text-xs">
              {exportErrorMessages.mixedGeometryWarning(shapeClasses)}
            </p>
          )}

          {isLarge && (
            <p role="status" className="rounded-md bg-muted p-3 text-xs">
              This export covers more than {LARGE_EXPORT_FEATURE_THRESHOLD.toLocaleString()} features
              and may take a while. The page stays usable while it runs.
            </p>
          )}

          {selectionEmpty && (
            <p role="alert" className="text-sm text-destructive">
              {exportErrorMessages.nothingToExport("selection")}
            </p>
          )}

          {progress && (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              Reading page {progress.loaded} of at least {progress.total}…
            </p>
          )}

          {storeError && !selectionEmpty && (
            <p role="alert" className="text-sm text-destructive">
              {storeError}
            </p>
          )}
        </div>
        )}

        {!outcome && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleExport()}
              disabled={exportMutation.isPending || selectionEmpty}
            >
              {exportMutation.isPending ? "Exporting…" : "Export"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
