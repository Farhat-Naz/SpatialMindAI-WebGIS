"use client"

import { useId } from "react"
import type { BBox, Position } from "../types/importExport.types"

/**
 * Transformation preview (specs/005-import-export, Phase 14; FR-064, FR-065,
 * SC-010).
 *
 * Shows where the data will actually land, **before** the import is confirmed.
 * This is the single most valuable thing the CRS step produces: the classic GIS
 * disaster is importing projected coordinates as if they were degrees, and the
 * symptom is not an error but data quietly placed off the coast of Africa. A
 * sample of transformed coordinates plus a bounding box is what lets a user
 * recognize that in one glance.
 *
 * Purely presentational — the transform has already run (in `crsCatalog`,
 * client-side, transient, and never persisted).
 */

export interface CrsPreviewProps {
  /** Sample positions in the source CRS, paired index-wise with `transformed`. */
  source: Position[]
  /** The same positions after transformation to WGS84. */
  transformed: Position[]
  /** Bounding box of the transformed sample, or null when the transform failed. */
  bbox: BBox | null
  /** Whether that bounding box falls inside valid geographic bounds (FR-065). */
  plausible: boolean
  /** The code being previewed, for the message. */
  crsCode: string
  /** How many sample rows to show. */
  rows?: number
}

function formatDegrees(value: number): string {
  return value.toFixed(6)
}

function formatSource(value: number): string {
  // Projected values are metres and want no decimals; degrees want six.
  return Math.abs(value) > 1000 ? value.toFixed(1) : value.toFixed(6)
}

export function CrsPreview({
  source,
  transformed,
  bbox,
  plausible,
  crsCode,
  rows = 3,
}: CrsPreviewProps) {
  const tableId = useId()

  if (transformed.length === 0) {
    return (
      <p role="alert" className="text-sm text-destructive">
        These coordinates could not be transformed from {crsCode}. Choose a different coordinate
        system.
      </p>
    )
  }

  const shown = Math.min(rows, source.length, transformed.length)

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Where these coordinates will land</p>
        <table
          id={tableId}
          className="w-full border-collapse text-xs"
          aria-label={`Sample coordinates transformed from ${crsCode} to WGS84`}
        >
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-1 pr-2 font-medium">
                In the file ({crsCode})
              </th>
              <th scope="col" className="py-1 font-medium">
                On the map (EPSG:4326)
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {Array.from({ length: shown }, (_, index) => (
              <tr key={index} className="border-b last:border-0">
                <td className="py-1 pr-2">
                  {formatSource(source[index][0])}, {formatSource(source[index][1])}
                </td>
                <td className="py-1">
                  {formatDegrees(transformed[index][0])}, {formatDegrees(transformed[index][1])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bbox && (
        <dl className="rounded-md border px-3 py-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Extent (west, south → east, north)</dt>
            <dd className="font-mono">
              {formatDegrees(bbox[0])}, {formatDegrees(bbox[1])} → {formatDegrees(bbox[2])},{" "}
              {formatDegrees(bbox[3])}
            </dd>
          </div>
        </dl>
      )}

      {plausible ? (
        <p role="status" className="text-xs text-muted-foreground">
          This extent falls inside valid geographic bounds.
        </p>
      ) : (
        <div role="alert" className="space-y-1 rounded-md bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">
            This extent is outside valid geographic bounds.
          </p>
          <p className="text-xs text-destructive/90">
            That almost always means {crsCode} is not the coordinate system this file was created in.
            Importing anyway will place the features somewhere they do not belong.
          </p>
        </div>
      )}
    </div>
  )
}
