/**
 * Shared DOM-capture / document-assembly helpers used by both
 * `reportService.ts` (persisted Reports, US5) and `dashboardExportService.ts`
 * (ad-hoc exports, US9) — factored out per plan.md's Architecture → Export
 * services section so the two never duplicate capture logic. Every heavy
 * dependency is dynamically imported at the point of use (Constitution
 * Principle V) — never part of the initial route bundle.
 */

/** Captures a DOM node as a PNG data URL via `html2canvas` (FR-016/FR-031). */
export async function captureElementAsPng(node: HTMLElement): Promise<string> {
  const { default: html2canvas } = await import("html2canvas")
  const canvas = await html2canvas(node, { backgroundColor: "#ffffff", useCORS: true })
  return canvas.toDataURL("image/png")
}

/** Assembles a multi-page PDF `Blob` from one or more PNG data URLs, one per page (FR-016). */
export async function buildPdfFromImages(images: string[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "landscape", unit: "px" })

  for (let i = 0; i < images.length; i += 1) {
    if (i > 0) doc.addPage()
    const properties = doc.getImageProperties(images[i])
    const pageWidth = doc.internal.pageSize.getWidth()
    const scale = pageWidth / properties.width
    doc.addImage(images[i], "PNG", 0, 0, pageWidth, properties.height * scale)
  }

  return doc.output("blob")
}

/** One workbook sheet: a name plus row objects (each object's keys become the header row). */
export interface XlsxSheet {
  name: string
  rows: Record<string, unknown>[]
}

/** Builds an `.xlsx` workbook `Blob` from one or more sheets (US5/US9, `xlsx`/SheetJS). */
export async function buildXlsxWorkbook(sheets: XlsxSheet[]): Promise<Blob> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  }

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}
