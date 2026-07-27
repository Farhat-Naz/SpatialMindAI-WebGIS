"use client"

import { useState } from "react"
import { Download, Upload } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
// Deep imports, never through `@/features/import-export`'s barrel: the barrel
// exports the whole feature, and this launcher is mounted in the layer tree
// where pulling parsers and writers in eagerly would be wasted bytes. The same
// hazard `features/analysis/services/exportService.ts` documents.
import { ImportDialog } from "@/features/import-export/components/ImportDialog"
import { ExportDialog } from "@/features/import-export/components/ExportDialog"

/**
 * Import/Export launcher for the selected layer.
 *
 * **Rewritten by specs/005-import-export (T124).** It previously held the GeoJSON
 * and loose-file Shapefile import handlers inline plus a single-format export.
 * All of that now lives in `src/features/import-export/`, which handles five
 * source formats, five output formats, coordinate systems, validation reporting,
 * progress, and rollback — so this file is a launcher and nothing more.
 *
 * The spec sanctions the replacement explicitly: the existing Map Editing
 * import/export controls are "replaced with the fuller interchange interface
 * rather than duplicated."
 *
 * **No import or export logic remains in this file.** Two behaviours of the old
 * version are deliberately not reimplemented here, because the new dialogs
 * supersede rather than drop them:
 *
 * - the >100-feature confirmation, replaced by the confirmation gate, which
 *   states exact counts for *every* import instead of a bare warning past an
 *   arbitrary threshold (FR-005);
 * - the inline success/error text, replaced by `ImportSummaryPanel`'s full
 *   accounting plus "Undo this import" (FR-010, FR-072).
 *
 * `POST /api/layers/:layerId/features/import` — the endpoint the old handlers
 * called — is **not** removed and keeps working unchanged for any other caller
 * (research.md Decision 5).
 */

interface ImportExportControlsProps {
  layerId: string
  layerName: string
  projectId: string
  /** Selected feature ids, so "export current selection" has something to read (FR-035). */
  selectedFeatureIds?: string[]
}

export function ImportExportControls({
  layerId,
  layerName,
  projectId,
  selectedFeatureIds,
}: ImportExportControlsProps) {
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setImportOpen(true)} aria-label="Import features">
        <Upload className="h-4 w-4" aria-hidden="true" />
        Import
      </Button>

      <Button variant="outline" onClick={() => setExportOpen(true)} aria-label="Export layer">
        <Download className="h-4 w-4" aria-hidden="true" />
        Export
      </Button>

      {/*
        Mounted only while open so neither dialog's dynamically imported
        dependencies are requested until a user actually opens one
        (Constitution Principle V).
      */}
      {importOpen && (
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          layerId={layerId}
          layerName={layerName}
          projectId={projectId}
        />
      )}

      {exportOpen && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          layerId={layerId}
          layerName={layerName}
          projectId={projectId}
          selectedFeatureIds={selectedFeatureIds}
        />
      )}
    </div>
  )
}
