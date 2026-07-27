"use client"

import { useId } from "react"
import { Button } from "@/shared/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog"
import { usePrintExport } from "../hooks/usePrintExport"
import type { PrintContext } from "../services/pdfExport"
import { PAGE_SIZES, type PageSize } from "../types/exportConstants"
import { selectExportError, useExportStore } from "../store/exportStore"
import { PrintPreview } from "./PrintPreview"

/**
 * Print / PDF configuration (specs/005-import-export, Phase 13; FR-044–FR-050).
 *
 * Every control updates `exportStore.printLayout`, which `PrintPreview` reads —
 * so the preview reflects the configuration by construction rather than by being
 * kept in sync (FR-044).
 *
 * Cancelling closes the dialog, produces nothing, and **leaves both the map view
 * and the page setup exactly as they were** (FR-050). Discarding a layout the user
 * had just configured would punish an accidental close, so `cancel` deliberately
 * does not reset it.
 */

export interface PrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Base name for the download when no title is set. */
  name: string
  /** Returns the live map element to rasterize, resolved at print time. */
  getMapElement: () => HTMLElement | null
  /** Scale and legend data only the live map knows (FR-047, FR-048). */
  context?: PrintContext
}

export function PrintDialog({
  open,
  onOpenChange,
  projectId,
  name,
  getMapElement,
  context,
}: PrintDialogProps) {
  const { layout, updateLayout, exportPdf, isExporting, usedPrintFallback, canRasterize, cancel } =
    usePrintExport(projectId)
  const storeError = useExportStore(selectExportError)

  const titleId = useId()
  const sizeId = useId()
  const orientationId = useId()

  async function handleExport(): Promise<void> {
    const mapEl = getMapElement()
    if (!mapEl) {
      useExportStore.getState().setError("The map is not ready to print yet. Try again in a moment.")
      return
    }
    try {
      const { fellBack } = await exportPdf({ mapEl, name, context })
      // A fallback opened the browser's print dialog, so the user is looking at
      // that — closing this one behind it would be disorienting.
      if (!fellBack) onOpenChange(false)
    } catch {
      // `usePrintExport` has written a user-facing message to the store.
    }
  }

  function handleCancel(): void {
    cancel()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleCancel())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Print or export the map as PDF</DialogTitle>
          <DialogDescription>
            The page is rendered from the current map view, in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-2 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <label htmlFor={titleId} className="text-sm font-medium">
                Title (optional)
              </label>
              <input
                id={titleId}
                type="text"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={layout.title ?? ""}
                placeholder={name}
                onChange={(event) => updateLayout({ title: event.target.value || undefined })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor={sizeId} className="text-sm font-medium">
                  Page size
                </label>
                <select
                  id={sizeId}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={layout.pageSize}
                  onChange={(event) => updateLayout({ pageSize: event.target.value as PageSize })}
                >
                  {Object.keys(PAGE_SIZES).map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor={orientationId} className="text-sm font-medium">
                  Orientation
                </label>
                <select
                  id={orientationId}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={layout.orientation}
                  onChange={(event) =>
                    updateLayout({ orientation: event.target.value as "portrait" | "landscape" })
                  }
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Include on the page</legend>
              {(
                [
                  ["showNorthArrow", "North arrow"],
                  ["showScaleBar", "Scale bar"],
                  ["showLegend", "Legend"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={layout[key]}
                    onChange={(event) => updateLayout({ [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {!canRasterize && (
              <p role="status" className="rounded-md bg-muted p-3 text-xs">
                This map cannot be captured directly, so printing will open your browser&rsquo;s own
                print dialog instead. Choose &ldquo;Save as PDF&rdquo; there.
              </p>
            )}

            {usedPrintFallback && (
              <p role="status" className="rounded-md bg-muted p-3 text-xs">
                Your browser&rsquo;s print dialog was opened. Choose &ldquo;Save as PDF&rdquo; to keep
                a copy.
              </p>
            )}

            {storeError && !usedPrintFallback && (
              <p role="alert" className="text-sm text-destructive">
                {storeError}
              </p>
            )}
          </div>

          <PrintPreview layout={layout}>
            <div className="flex h-full items-center justify-center text-[10px] text-neutral-500">
              Map area
            </div>
          </PrintPreview>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleExport()} disabled={isExporting}>
            {isExporting ? "Preparing…" : canRasterize ? "Export PDF" : "Open print dialog"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
