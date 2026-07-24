"use client"

import { useRef, useState } from "react"
import { Download, Upload } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog"
import { useImportFeatures, useExportLayer } from "@/features/database/hooks/useFeatureEditing"
import { convertShapefileToFeatures } from "@/features/database/services/shapefileImport"
import { validateFeatureCollectionStructure } from "@/features/database/utils/validateGeoJson"
import { useEditingStore } from "@/features/database/store/editingStore"
import type { ImportFeatureCollectionInput } from "@/shared/contracts/geoJsonImport.schema"

const LARGE_IMPORT_THRESHOLD = 100

interface ImportExportControlsProps {
  layerId: string
  layerName: string
}

/**
 * Import/Export Controls (US7) — a GeoJSON file input, a Shapefile file-set
 * input (.shp + .dbf + optional .prj, selected together), and an Export
 * button. Every rejection path validates client-side, before any network
 * call (FR-034/FR-037); imports above `LARGE_IMPORT_THRESHOLD` features
 * require confirmation, since Undo is single-step only and can't reverse a
 * bulk import.
 */
export function ImportExportControls({ layerId, layerName }: ImportExportControlsProps) {
  const geoJsonInputRef = useRef<HTMLInputElement>(null)
  const shapefileInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<ImportFeatureCollectionInput | null>(null)

  const importFeatures = useImportFeatures(layerId)
  const exportLayer = useExportLayer(layerId, layerName)
  const importResult = useEditingStore((s) => s.importResult)
  const setImportResult = useEditingStore((s) => s.setImportResult)

  function commitOrConfirm(collection: ImportFeatureCollectionInput) {
    if (collection.features.length > LARGE_IMPORT_THRESHOLD) {
      setPendingImport(collection)
      return
    }
    importFeatures.mutate(collection)
  }

  async function handleGeoJsonChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setImportResult({ status: "error", errorMessage: "The file is not valid JSON." })
      return
    }

    const validation = validateFeatureCollectionStructure(parsed)
    if (!validation.valid) {
      setImportResult({ status: "error", errorMessage: validation.message })
      return
    }

    commitOrConfirm(parsed as ImportFeatureCollectionInput)
  }

  async function handleShapefileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (files.length === 0) return

    const shp = files.find((file) => file.name.toLowerCase().endsWith(".shp"))
    const dbf = files.find((file) => file.name.toLowerCase().endsWith(".dbf"))
    const prj = files.find((file) => file.name.toLowerCase().endsWith(".prj"))
    if (!shp) {
      setImportResult({ status: "error", errorMessage: "Select a .shp file to import." })
      return
    }

    const result = await convertShapefileToFeatures({ shp, dbf, prj })
    if (result.status === "error" || !result.features) {
      setImportResult({ status: "error", errorMessage: result.errorMessage })
      return
    }

    commitOrConfirm({ type: "FeatureCollection", features: result.features })
  }

  function handleConfirmLargeImport() {
    if (!pendingImport) return
    importFeatures.mutate(pendingImport)
    setPendingImport(null)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={geoJsonInputRef}
        type="file"
        accept=".geojson,.json"
        aria-label="Import GeoJSON file"
        className="hidden"
        onChange={handleGeoJsonChange}
      />
      <Button
        variant="outline"
        onClick={() => geoJsonInputRef.current?.click()}
        aria-label="Import GeoJSON"
        disabled={importFeatures.isPending}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Import GeoJSON
      </Button>

      <input
        ref={shapefileInputRef}
        type="file"
        accept=".shp,.dbf,.prj"
        multiple
        aria-label="Import Shapefile files"
        className="hidden"
        onChange={handleShapefileChange}
      />
      <Button
        variant="outline"
        onClick={() => shapefileInputRef.current?.click()}
        aria-label="Import Shapefile"
        disabled={importFeatures.isPending}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Import Shapefile
      </Button>

      {importFeatures.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Importing…
        </p>
      )}

      <Button
        variant="outline"
        onClick={() => exportLayer.mutate()}
        aria-label="Export layer"
        disabled={exportLayer.isPending}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export
      </Button>

      {importResult?.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {importResult.errorMessage}
        </p>
      )}
      {importResult?.status === "success" && (
        <p role="status" className="text-sm text-muted-foreground">
          Imported {importResult.importedCount} feature
          {importResult.importedCount === 1 ? "" : "s"}.
        </p>
      )}

      <AlertDialog open={pendingImport !== null} onOpenChange={(open) => !open && setPendingImport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import {pendingImport?.features.length} features?</AlertDialogTitle>
            <AlertDialogDescription>
              This is a large import. It cannot be reversed with Undo (single-step only). Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLargeImport}>Import</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
