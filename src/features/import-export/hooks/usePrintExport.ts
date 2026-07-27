"use client"

import { useCallback, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { analysisService } from "@/features/analysis/services/analysisService"
import type { PrintLayout } from "../types/importExport.types"
import { downloadBlob, toDownloadFilename } from "../services/downloadBlob"
import { canRasterize, exportMapAsPdf, type PrintContext } from "../services/pdfExport"
import { queryKeys } from "../services/queryKeys"
import { useExportStore } from "../store/exportStore"
import { exportErrorMessages } from "../utils/exportErrors"

/**
 * Print / PDF export (specs/005-import-export, T092; FR-044–FR-050).
 *
 * Owns the `PrintLayout` (delegated to `exportStore` so the dialog and the
 * preview read one source), the PDF render, and the `window.print()` fallback.
 *
 * ## Why the fallback is a first-class path, not error handling
 *
 * `html2canvas` cannot read a canvas tainted by a cross-origin tile. The
 * `crossOrigin="anonymous"` prop on the tile layer prevents that for tiles
 * fetched from then on, but tiles **already cached** without the attribute stay
 * tainted until the cache turns over. Rather than presenting that as a failure,
 * `canRasterize()` detects it and the dialog opens the browser's own print
 * dialog, which has no same-origin restriction and produces a correct page
 * (research.md Decision 11).
 *
 * Both outcomes are logged, so history reflects what the user actually got.
 */

export interface PrintExportRequest {
  /** The map pane to rasterize. */
  mapEl: HTMLElement
  /** Base name for the download, normally the project or layer name. */
  name: string
  context?: PrintContext
}

export function usePrintExport(projectId: string) {
  const queryClient = useQueryClient()
  const layout = useExportStore((state) => state.printLayout)
  const setPrintLayout = useExportStore((state) => state.setPrintLayout)
  const setError = useExportStore((state) => state.setError)

  /** True when the last attempt fell back to the browser's print dialog. */
  const [usedPrintFallback, setUsedPrintFallback] = useState(false)

  const mutation = useMutation<{ fellBack: boolean }, Error, PrintExportRequest>({
    mutationFn: async ({ mapEl, name, context }) => {
      setUsedPrintFallback(false)

      /** Opens the browser's print dialog against the print stylesheet. */
      const fallback = (): { fellBack: boolean } => {
        setUsedPrintFallback(true)
        setError(exportErrorMessages.pdfRasterizationFailed())
        if (typeof window !== "undefined") window.print()
        return { fellBack: true }
      }

      try {
        if (!canRasterize()) {
          const result = fallback()
          await logAttempt("succeeded", 0)
          return result
        }

        const blob = await exportMapAsPdf(layout, mapEl, context)
        downloadBlob(blob, toDownloadFilename(layout.title ?? name, "pdf", "map"))
        await logAttempt("succeeded", 0)
        return { fellBack: false }
      } catch (error) {
        // A SecurityError here means the pre-flight probe passed but a tile was
        // still tainted — the fallback covers it rather than losing the user's
        // page setup to a raw failure.
        //
        // Matched by name rather than `instanceof DOMException`, for the same
        // cross-realm reason `isAbortError` documents: html2canvas renders inside
        // its own iframe, so the exception can originate from a different realm.
        const errorName = (error as { name?: unknown } | null)?.name
        const isTaint = errorName === "SecurityError" || errorName === "InvalidStateError"

        if (isTaint) {
          const result = fallback()
          await logAttempt("succeeded", 0)
          return result
        }

        await logAttempt("failed", 0, error instanceof Error ? error.message : "PDF export failed.")
        setError(exportErrorMessages.writerFailed("pdf"))
        throw error
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.exportHistoryList(projectId) })
    },
  })

  /**
   * Records the attempt in export history (FR-043).
   *
   * `scope: "layer"` because a printed map is a view of the current layer set,
   * and `featureCount: 0` because a raster carries no feature count — inventing
   * one would put a number in history that means nothing.
   */
  async function logAttempt(
    status: "succeeded" | "failed",
    featureCount: number,
    errorMessage?: string,
  ): Promise<void> {
    await analysisService
      .logExport(projectId, { format: "pdf", scope: "layer", status, featureCount, errorMessage })
      .catch(() => undefined)
  }

  /**
   * Closes the dialog without producing anything (FR-050).
   *
   * Deliberately does **not** reset the layout or touch the map view: cancelling
   * must leave the map exactly as it was, and discarding a page setup the user
   * just configured would punish an accidental close.
   */
  const cancel = useCallback(() => {
    setError(null)
    setUsedPrintFallback(false)
    useExportStore.getState().closePrintDialog()
  }, [setError])

  const updateLayout = useCallback(
    (patch: Partial<PrintLayout>) => setPrintLayout(patch),
    [setPrintLayout],
  )

  return {
    layout,
    updateLayout,
    exportPdf: mutation.mutateAsync,
    isExporting: mutation.isPending,
    usedPrintFallback,
    canRasterize: canRasterize(),
    cancel,
  }
}
