import { Prisma, type Report } from "@prisma/client"
import { prismaClient } from "@/server/db/prismaClient"
import { assertDashboardPermission } from "@/server/repositories/dashboardShareRepository"
import { resolveWidgetData } from "@/server/repositories/widgetRepository"
import { NotFoundError, ValidationError } from "@/shared/errors/apiError"
import { REPORT_RETENTION_LIMIT_PER_USER } from "@/features/dashboards/types/dashboardConfig.constants"
import type { ReportRecord, ScheduledReportRecord } from "@/features/dashboards/types/dashboard.types"

/** Never reads `fileContent` — safe to call with or without that column selected. */
function toReportRecord(row: Omit<Report, "fileContent">): ReportRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    userId: row.userId,
    scheduledReportId: row.scheduledReportId,
    format: row.format as ReportRecord["format"],
    status: row.status as ReportRecord["status"],
    sizeBytes: row.sizeBytes,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Prisma's generated `Bytes` field type (`Uint8Array<ArrayBuffer>`) is
 * stricter than Node's `Buffer` type declaration (`Uint8Array<ArrayBufferLike>`,
 * which also admits `SharedArrayBuffer`) — a TS-declaration mismatch only;
 * every `Buffer` this module produces is always real-`ArrayBuffer`-backed at
 * runtime. `new Uint8Array(buffer)` makes a real copy satisfying the
 * stricter type exactly.
 */
function toPrismaBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer)
}

function toScheduledRecord(row: {
  id: string
  dashboardId: string
  userId: string
  format: string
  recurrence: string
  nextRunAt: Date
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): ScheduledReportRecord {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    userId: row.userId,
    format: row.format as ScheduledReportRecord["format"],
    recurrence: row.recurrence as ScheduledReportRecord["recurrence"],
    nextRunAt: row.nextRunAt.toISOString(),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** One row per widget: title, type, data source, and a JSON summary of its resolved data — the shared row shape behind every server-generated report format. */
async function collectReportRows(
  dashboardId: string,
  userId: string,
): Promise<{ dashboardName: string; rows: Record<string, string>[] }> {
  const dashboard = await prismaClient.dashboard.findUnique({
    where: { id: dashboardId },
    include: { widgets: true },
  })
  if (!dashboard) {
    throw new NotFoundError(`No dashboard found with id "${dashboardId}".`)
  }

  const rows = await Promise.all(
    dashboard.widgets.map(async (widget) => {
      const result = await resolveWidgetData(dashboardId, widget.id, userId)
      const summary = result.dataSourceUnavailable ? "unavailable" : JSON.stringify(result.data).slice(0, 1000)
      return {
        Widget: widget.title ?? widget.type,
        Type: widget.type,
        "Data Source": widget.dataSourceType ?? "",
        Summary: summary,
      }
    }),
  )

  return { dashboardName: dashboard.name, rows }
}

function rowsToCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header] ?? "")).join(","))
  }
  return lines.join("\r\n")
}

function rowsToHtml(dashboardName: string, rows: Record<string, string>[]): string {
  const headers = Object.keys(rows[0] ?? {})
  const headerHtml = headers.map((h) => `<th>${h}</th>`).join("")
  const rowsHtml = rows
    .map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`)
    .join("")
  return `<!doctype html><html><head><meta charset="utf-8"><title>${dashboardName}</title></head><body><h1>${dashboardName}</h1><table border="1" cellpadding="4"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`
}

/** Generates a report file server-side for Excel/CSV/HTML (no browser present for a scheduled run, research.md Decision 10). PDF is never generated here — client-side only. */
async function generateReportFileServerSide(
  dashboardId: string,
  userId: string,
  format: "excel" | "csv" | "html",
): Promise<Buffer> {
  const { dashboardName, rows } = await collectReportRows(dashboardId, userId)

  if (format === "csv") {
    return Buffer.from(rowsToCsv(rows), "utf-8")
  }
  if (format === "html") {
    return Buffer.from(rowsToHtml(dashboardName, rows), "utf-8")
  }

  // Server-side xlsx generation runs in a Node context (no bundle-size
  // concern the way the client's dynamic-import captureUtils.ts has), so a
  // top-level import is fine here.
  const XLSX = await import("xlsx")
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, dashboardName.slice(0, 31) || "Report")
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer
}

/** Prunes the oldest report(s) beyond the per-user retention cap (research.md Decision 17) — called inside the same transaction as a new report's creation. */
async function pruneOldReports(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const excess = await tx.report.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: REPORT_RETENTION_LIMIT_PER_USER,
    select: { id: true },
  })
  if (excess.length > 0) {
    await tx.report.deleteMany({ where: { id: { in: excess.map((row) => row.id) } } })
  }
}

export interface CreateReportInput {
  format: "pdf" | "excel" | "csv" | "html"
  /** Raw file bytes when the client already generated it (e.g. a client-rendered PDF). Omitted for Excel/CSV/HTML lets the server generate it. */
  fileContent?: Buffer
  scheduledReportId?: string
}

/** Creates (persists) a report — generates Excel/CSV/HTML server-side when `fileContent` is omitted; PDF always arrives pre-generated from the client (research.md Decision 9). Enforces the retention cap. */
export async function createReport(
  dashboardId: string,
  userId: string,
  input: CreateReportInput,
): Promise<ReportRecord> {
  await assertDashboardPermission(dashboardId, userId, "view")

  if (input.format === "pdf" && !input.fileContent) {
    throw new ValidationError("A PDF report must be generated client-side and attached as fileContent.")
  }

  let fileContent = input.fileContent
  let status: "succeeded" | "failed" = "succeeded"
  let errorMessage: string | undefined

  if (!fileContent && input.format !== "pdf") {
    try {
      fileContent = await generateReportFileServerSide(dashboardId, userId, input.format)
    } catch (error) {
      status = "failed"
      errorMessage = error instanceof Error ? error.message : "Report generation failed."
    }
  }

  const row = await prismaClient.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        dashboardId,
        userId,
        scheduledReportId: input.scheduledReportId,
        format: input.format,
        status,
        fileContent: fileContent ? toPrismaBytes(fileContent) : null,
        sizeBytes: fileContent?.byteLength ?? null,
        errorMessage,
      },
    })
    await pruneOldReports(tx, userId)
    return created
  })

  return toReportRecord(row)
}

export interface ListReportsParams {
  cursor?: string
  limit?: number
}

/** Lists the requesting user's Generated Reports, newest first (FR-018/FR-033) — never selects `fileContent`. */
export async function listReportsForUser(
  projectId: string,
  userId: string,
  params: ListReportsParams = {},
): Promise<{ reports: ReportRecord[]; nextCursor: string | null }> {
  const limit = Math.min(params.limit ?? 20, 100)
  const rows = await prismaClient.report.findMany({
    where: { userId, dashboard: { projectId } },
    select: {
      id: true,
      dashboardId: true,
      userId: true,
      scheduledReportId: true,
      format: true,
      status: true,
      sizeBytes: true,
      errorMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasNextPage = rows.length > limit
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? pageRows[pageRows.length - 1]?.id ?? null : null

  return { reports: pageRows.map(toReportRecord), nextCursor }
}

/** The one function that selects `fileContent` — streamed for download. */
export async function getReportFileForDownload(
  reportId: string,
  userId: string,
): Promise<{ fileContent: Buffer; format: string } | null> {
  const row = await prismaClient.report.findUnique({ where: { id: reportId } })
  if (!row || row.userId !== userId || row.status !== "succeeded" || !row.fileContent) {
    return null
  }
  return { fileContent: Buffer.from(row.fileContent), format: row.format }
}

export interface CreateScheduledReportInput {
  format: "excel" | "csv" | "html"
  recurrence: "daily" | "weekly" | "monthly"
}

const RECURRENCE_MS: Record<"daily" | "weekly" | "monthly", number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
}

function assertNotPdf(format: string): void {
  if (format === "pdf") {
    throw new ValidationError('A scheduled report cannot use format "pdf" — no browser is present when a schedule fires.')
  }
}

/** Creates a recurring schedule (US5/FR-017) — rejects `"pdf"` (research.md Decision 10). */
export async function createScheduledReport(
  dashboardId: string,
  userId: string,
  input: CreateScheduledReportInput,
): Promise<ScheduledReportRecord> {
  await assertDashboardPermission(dashboardId, userId, "edit")
  assertNotPdf(input.format)

  const row = await prismaClient.scheduledReport.create({
    data: {
      dashboardId,
      userId,
      format: input.format,
      recurrence: input.recurrence,
      nextRunAt: new Date(Date.now() + RECURRENCE_MS[input.recurrence]),
    },
  })
  return toScheduledRecord(row)
}

/** Updates a schedule's `recurrence`/`isActive` (pause/resume). */
export async function updateScheduledReport(
  scheduledReportId: string,
  userId: string,
  input: { recurrence?: "daily" | "weekly" | "monthly"; isActive?: boolean },
): Promise<ScheduledReportRecord> {
  const existing = await prismaClient.scheduledReport.findUnique({ where: { id: scheduledReportId } })
  if (!existing) {
    throw new NotFoundError(`No scheduled report found with id "${scheduledReportId}".`)
  }
  await assertDashboardPermission(existing.dashboardId, userId, "edit")

  const row = await prismaClient.scheduledReport.update({
    where: { id: scheduledReportId },
    data: {
      ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  })
  return toScheduledRecord(row)
}

/** Deletes a schedule — previously generated `Report` rows survive with `scheduledReportId` set-null. */
export async function deleteScheduledReport(scheduledReportId: string, userId: string): Promise<void> {
  const existing = await prismaClient.scheduledReport.findUnique({ where: { id: scheduledReportId } })
  if (!existing) {
    throw new NotFoundError(`No scheduled report found with id "${scheduledReportId}".`)
  }
  await assertDashboardPermission(existing.dashboardId, userId, "edit")
  await prismaClient.scheduledReport.delete({ where: { id: scheduledReportId } })
}

/**
 * Finds every due schedule and generates+persists a `Report` for each,
 * advancing `nextRunAt` regardless of success or failure (a failure still
 * writes a `status: "failed"` `Report` with `errorMessage`, so it isn't
 * retried forever). One schedule's failure is caught individually and never
 * aborts the batch (mirrors 007's Batch Run per-item isolation).
 */
export async function runDueScheduledReports(): Promise<{ processed: number; failed: number }> {
  const due = await prismaClient.scheduledReport.findMany({
    where: { isActive: true, nextRunAt: { lte: new Date() } },
  })

  let processed = 0
  let failed = 0

  for (const schedule of due) {
    try {
      const fileContent = await generateReportFileServerSide(
        schedule.dashboardId,
        schedule.userId,
        schedule.format as "excel" | "csv" | "html",
      )
      await prismaClient.$transaction(async (tx) => {
        await tx.report.create({
          data: {
            dashboardId: schedule.dashboardId,
            userId: schedule.userId,
            scheduledReportId: schedule.id,
            format: schedule.format,
            status: "succeeded",
            fileContent: toPrismaBytes(fileContent),
            sizeBytes: fileContent.byteLength,
          },
        })
        await pruneOldReports(tx, schedule.userId)
        await tx.scheduledReport.update({
          where: { id: schedule.id },
          data: { nextRunAt: new Date(Date.now() + RECURRENCE_MS[schedule.recurrence as "daily" | "weekly" | "monthly"]) },
        })
      })
      processed += 1
    } catch (error) {
      failed += 1
      await prismaClient.$transaction(async (tx) => {
        await tx.report.create({
          data: {
            dashboardId: schedule.dashboardId,
            userId: schedule.userId,
            scheduledReportId: schedule.id,
            format: schedule.format,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Scheduled report generation failed.",
          },
        })
        await tx.scheduledReport.update({
          where: { id: schedule.id },
          data: { nextRunAt: new Date(Date.now() + RECURRENCE_MS[schedule.recurrence as "daily" | "weekly" | "monthly"]) },
        })
      })
    }
  }

  return { processed, failed }
}
