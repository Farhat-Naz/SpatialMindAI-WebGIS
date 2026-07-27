"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { analysisService } from "@/features/analysis/services/analysisService"
import { WGS84_CODE } from "@/shared/contracts/crs.schema"
import { EXPORT_FILE_EXTENSIONS } from "../types/exportConstants"
import type { ExportFormat, ExportScope, ExportSource } from "../types/importExport.types"
import { downloadBlob, toDownloadFilename } from "../services/downloadBlob"
import {
  writeCsv,
  writeGeoJson,
  writeKml,
  writeProjectArchive,
  writeShapefile,
} from "../services/exportWriters"
import { queryKeys } from "../services/queryKeys"
import { exportErrorMessages } from "../utils/exportErrors"

/**
 * Runs a client-side export and logs the attempt (specs/005-import-export,
 * T090, T095; FR-034–FR-043).
 *
 * The export **runs entirely in the browser**. `POST /api/projects/:id/exports`
 * logs a finished attempt and never drives one — 007's research Decision 10,
 * preserved verbatim. There is no server-side export endpoint and none is added.
 *
 * The outcome is logged on **both** success and failure, preserving the
 * try/catch/log shape `useExportResult` established: a user whose export failed
 * needs it in history most of all, and a history that silently omits failures
 * would misrepresent what happened (FR-043).
 *
 * Modeled as a mutation rather than a plain async function purely so callers get
 * the same `isPending` / `onSuccess` / `onError` semantics as every other action
 * in the feature.
 */

export interface ExportRequest {
  source: ExportSource
  format: ExportFormat
  scope: ExportScope
  /** Authority code for output coordinates. Omitted or WGS84 means no transform (FR-041). */
  outputCrs?: string
  onProgress?: (pagesLoaded: number, totalPages: number) => void
  signal?: AbortSignal
}

/** What a completed export produced, returned so the caller can report it. */
export interface ExportOutcome {
  blob: Blob
  featureCount: number
  layerCount?: number
  filename: string
}

/** A human-readable base name for the download, per scope. */
function sourceName(source: ExportSource): string {
  return source.kind === "project" ? source.projectName : source.layerName
}

export function useExport(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation<ExportOutcome, Error, ExportRequest>({
    mutationFn: async (request) => {
      const { source, format, scope, outputCrs, onProgress, signal } = request

      // A no-transform export passes `undefined` rather than "EPSG:4326", so the
      // writers can skip the coordinate walk entirely.
      const options = {
        outputCrs: outputCrs && outputCrs !== WGS84_CODE ? outputCrs : undefined,
        onProgress,
        signal,
      }

      try {
        // PDF is produced by `usePrintExport` against the live map element, not
        // from feature pages — there is no map to rasterize from here.
        if (format === "pdf") {
          throw new Error(exportErrorMessages.pdfHandledByPrintDialog())
        }

        const result =
          scope === "project" && source.kind === "project"
            ? await writeProjectArchive(source.projectId, options)
            : format === "geojson"
              ? await writeGeoJson(source, options)
              : format === "csv"
                ? await writeCsv(source, options)
                : format === "kml"
                  ? await writeKml(source, options)
                  : await writeShapefile(source, options)

        // An empty scope produces a clear message and **no file** (FR-042):
        // downloading an empty shapefile or a header-only CSV looks like a
        // successful export of nothing, which is worse than being told.
        if (result.featureCount === 0 && scope !== "project") {
          throw new Error(exportErrorMessages.nothingToExport(scope))
        }

        const extension =
          scope === "project" && source.kind === "project" ? "zip" : EXPORT_FILE_EXTENSIONS[format]
        const filename = toDownloadFilename(sourceName(source), extension, scope === "selection" ? "selection" : undefined)

        downloadBlob(result.blob, filename)

        await analysisService.logExport(projectId, {
          format,
          scope,
          status: "succeeded",
          featureCount: result.featureCount,
          layerCount: result.layerCount,
          outputCrs: outputCrs ?? WGS84_CODE,
          // A project-scope log must carry no source id (contracts §9).
          sourceLayerId: scope === "project" ? undefined : source.kind !== "project" ? source.layerId : undefined,
        })

        return {
          blob: result.blob,
          featureCount: result.featureCount,
          layerCount: result.layerCount,
          filename,
        }
      } catch (error) {
        // Logged before rethrowing so history records the attempt even though
        // the caller still sees the failure.
        await analysisService
          .logExport(projectId, {
            format,
            scope,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Export failed.",
            sourceLayerId: scope === "project" ? undefined : source.kind !== "project" ? source.layerId : undefined,
          })
          .catch(() => undefined)
        throw error
      }
    },

    onSettled: () => {
      // The list prefix, so every cached cursor page of export history is
      // invalidated rather than only the no-params page. The key is deliberately
      // identical to 007's, so the Analysis panel's history refreshes too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.exportHistoryList(projectId) })
    },
  })
}
