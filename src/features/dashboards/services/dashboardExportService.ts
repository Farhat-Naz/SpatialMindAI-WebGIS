import { featureService } from "@/features/database/services/featureService"
import { buildXlsxWorkbook, captureElementAsPng, downloadBlob } from "./captureUtils"
import { apiFetch } from "./apiFetch"

/**
 * Ad-hoc, non-persisted exports (research.md Decision 9 — distinct from
 * `reportService.ts`'s persisted Reports): whole-dashboard image, a single
 * chart/widget image, and a single table widget's data file. Reuses
 * `captureUtils` and `database`'s existing paginated feature listing rather
 * than duplicating either.
 */
/** Decodes a `data:` URL into a `Blob` via `atob` — avoids `fetch()` on a `data:` URL, which not every environment (including jsdom) supports reliably. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",")
  const mime = /data:(.*?);base64/.exec(header)?.[1] ?? "image/png"
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

export const dashboardExportService = {
  /**
   * T340/research.md Decision 9 & 11 — records that an ad-hoc export
   * happened (audit purposes, FR-042) without persisting the file itself.
   * Fire-and-forget from the caller's perspective: a logging failure must
   * never block or roll back an export the user already received.
   */
  logExport(dashboardId: string, format: string, filters?: unknown): Promise<void> {
    return apiFetch(`/api/dashboards/${dashboardId}/export-log`, { method: "POST", body: JSON.stringify({ format, filters }) })
  },

  /** Exports the whole dashboard's current rendering as a PNG (FR-016 image path). */
  async exportDashboardAsImage(dashboardElement: HTMLElement, filename = "dashboard.png"): Promise<void> {
    const dataUrl = await captureElementAsPng(dashboardElement)
    downloadBlob(dataUrlToBlob(dataUrl), filename)
  },

  /** Exports one chart/gauge widget's current rendering as a downloadable image (FR-031). */
  async exportWidgetAsImage(widgetElement: HTMLElement, filename = "widget.png"): Promise<void> {
    const dataUrl = await captureElementAsPng(widgetElement)
    downloadBlob(dataUrlToBlob(dataUrl), filename)
  },

  /** Exports one table widget's underlying layer data as CSV or Excel (FR-032), paging through every feature. */
  async exportTableWidgetData(layerId: string, format: "csv" | "excel", filename?: string): Promise<void> {
    const rows: Record<string, unknown>[] = []
    let cursor: string | undefined

    do {
      const page = await featureService.list(layerId, cursor ? { cursor } : undefined)
      for (const feature of page.features) {
        rows.push({
          id: feature.id,
          geometry: JSON.stringify(feature.geometry),
          ...Object.fromEntries(feature.attributes.map((attribute) => [attribute.key, attribute.value])),
        })
      }
      cursor = page.nextCursor ?? undefined
    } while (cursor)

    if (format === "excel") {
      const blob = await buildXlsxWorkbook([{ name: "Data", rows }])
      downloadBlob(blob, filename ?? "table.xlsx")
      return
    }

    // T267 — assembled as an array of Blob parts (one per row, mirroring
    // 005-import-export's KML writer), never one giant `.join()`ed string
    // held in memory before the `Blob` is even created.
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
    const parts: string[] = [`${headers.map(escape).join(",")}\r\n`]
    for (const row of rows) {
      parts.push(`${headers.map((header) => escape(row[header])).join(",")}\r\n`)
    }
    const blob = new Blob(parts, { type: "text/csv" })
    downloadBlob(blob, filename ?? "table.csv")
  },
}
